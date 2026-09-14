import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, createMemberSession, isAllowedOrigin, jsonResponse, serviceRoleKey, verifyOAuthState } from '../_shared/security.ts'

type CallbackBody = { code?: string; state?: string; expected_state?: string; invite_code?: string }

function constantTimeMatch(left: string, right: string): boolean {
  if (!right || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'POST, OPTIONS')
    return new Response('ok', { headers: corsHeaders(req, 'POST, OPTIONS') })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST, OPTIONS')
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'POST, OPTIONS')

  try {
    const body: CallbackBody = await req.json().catch(() => ({}))
    const code = body.code?.trim() ?? ''
    const state = body.state ?? ''
    const expectedState = body.expected_state ?? ''
    const inviteCode = body.invite_code?.trim().toUpperCase() ?? ''
    if (!code || code.length > 2000) return jsonResponse(req, { ok: false, error: 'no_code' }, 400, 'POST, OPTIONS')
    if (!constantTimeMatch(state, expectedState) || !(await verifyOAuthState(state, 'linkedin'))) {
      return jsonResponse(req, { ok: false, error: 'invalid_state' }, 400, 'POST, OPTIONS')
    }

    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') ?? ''
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET') ?? ''
    const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI') ?? 'https://immortal.life/auth/linkedin'
    if (!clientId || !clientSecret) throw new Error('LinkedIn OAuth secrets are not configured')

    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
    })
    if (!tokenResponse.ok) {
      console.error('LinkedIn token exchange failed with status', tokenResponse.status)
      return jsonResponse(req, { ok: false, error: 'token_failed' }, 401, 'POST, OPTIONS')
    }
    const token = await tokenResponse.json()
    if (typeof token?.access_token !== 'string' || !token.access_token) throw new Error('LinkedIn token response was incomplete')

    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    if (!profileResponse.ok) {
      console.error('LinkedIn userinfo failed with status', profileResponse.status)
      return jsonResponse(req, { ok: false, error: 'profile_failed' }, 401, 'POST, OPTIONS')
    }
    const profile = await profileResponse.json()
    if (typeof profile?.sub !== 'string' || !profile.sub || typeof profile?.name !== 'string' || !profile.name) {
      throw new Error('LinkedIn profile was incomplete')
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await supabase.rpc('register_social_member', {
      p_provider: 'linkedin',
      p_subject: profile.sub,
      p_display_name: profile.name,
      p_avatar_url: typeof profile.picture === 'string' ? profile.picture : null,
      p_profile_handle: null,
      p_profile_url: null,
      p_follower_count: 0,
      p_invite_code: inviteCode,
    })
    if (error) {
      if (error.message.includes('invalid_invite')) return jsonResponse(req, { ok: false, error: 'invalid_code' }, 200, 'POST, OPTIONS')
      throw error
    }
    const result = Array.isArray(data) ? data[0] : data
    const memberId = Number(result?.member_id)
    if (!Number.isSafeInteger(memberId) || memberId <= 0) throw new Error('Member registration returned no member')
    const session = await createMemberSession(memberId, 'linkedin', profile.sub)
    return jsonResponse(req, { ok: true, session }, 200, 'POST, OPTIONS')
  } catch (error) {
    console.error('LinkedIn callback error:', error instanceof Error ? error.message : String(error))
    return jsonResponse(req, { ok: false, error: 'server_error' }, 500, 'POST, OPTIONS')
  }
})

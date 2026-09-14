import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders,
  createMemberSession,
  isAllowedOrigin,
  jsonResponse,
  serviceRoleKey,
} from '../_shared/security.ts'

type CallbackBody = {
  code?: string
  state?: string
  expected_state?: string
  code_verifier?: string
  invite_code?: string
}

function validOAuthState(state: string, expected: string): boolean {
  if (state.length < 32 || state.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < state.length; i++) mismatch |= state.charCodeAt(i) ^ expected.charCodeAt(i)
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
    let body: CallbackBody
    try {
      body = await req.json()
    } catch {
      return jsonResponse(req, { ok: false, error: 'invalid_json' }, 400, 'POST, OPTIONS')
    }

    const code = body.code?.trim() ?? ''
    const state = body.state ?? ''
    const expectedState = body.expected_state ?? ''
    const codeVerifier = body.code_verifier ?? ''
    const inviteCode = body.invite_code?.trim().toUpperCase() ?? ''

    if (!code) return jsonResponse(req, { ok: false, error: 'no_code' }, 400, 'POST, OPTIONS')
    if (!validOAuthState(state, expectedState)) {
      return jsonResponse(req, { ok: false, error: 'invalid_state' }, 400, 'POST, OPTIONS')
    }
    if (codeVerifier.length < 43 || codeVerifier.length > 128) {
      return jsonResponse(req, { ok: false, error: 'invalid_verifier' }, 400, 'POST, OPTIONS')
    }

    const clientId = Deno.env.get('X_CLIENT_ID') ?? ''
    const clientSecret = Deno.env.get('X_CLIENT_SECRET') ?? ''
    const redirectUri = Deno.env.get('X_REDIRECT_URI') ?? ''
    if (!clientId || !clientSecret || !redirectUri) throw new Error('X OAuth secrets are not configured')

    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenRes.ok) {
      console.error('X token exchange failed with status', tokenRes.status)
      return jsonResponse(req, { ok: false, error: 'token_failed' }, 401, 'POST, OPTIONS')
    }

    const tokenJson = await tokenRes.json()
    const accessToken = tokenJson.access_token
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('X token response was incomplete')

    const profileRes = await fetch(
      'https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!profileRes.ok) {
      console.error('X profile request failed with status', profileRes.status)
      return jsonResponse(req, { ok: false, error: 'profile_failed' }, 401, 'POST, OPTIONS')
    }

    const profileJson = await profileRes.json()
    const profile = profileJson.data
    if (!profile?.id || !profile?.username || !profile?.name) throw new Error('X profile was incomplete')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { data, error } = await supabase.rpc('register_x_member', {
      p_x_id: String(profile.id),
      p_x_username: String(profile.username),
      p_x_display_name: String(profile.name),
      p_x_avatar_url: profile.profile_image_url ? String(profile.profile_image_url) : null,
      p_x_follower_count: Number(profile.public_metrics?.followers_count) || 0,
      p_invite_code: inviteCode,
    })

    if (error) {
      if (error.message.includes('invalid_invite')) {
        return jsonResponse(req, { ok: false, error: 'invalid_code' }, 200, 'POST, OPTIONS')
      }
      throw error
    }

    const result = Array.isArray(data) ? data[0] : data
    const memberId = Number(result?.member_id)
    if (!Number.isSafeInteger(memberId) || memberId <= 0) throw new Error('Member registration returned no member')

    const session = await createMemberSession(memberId, String(profile.id))
    return jsonResponse(req, { ok: true, session }, 200, 'POST, OPTIONS')
  } catch (err) {
    console.error('Auth callback error:', err instanceof Error ? err.message : String(err))
    return jsonResponse(req, { ok: false, error: 'server_error' }, 500, 'POST, OPTIONS')
  }
})

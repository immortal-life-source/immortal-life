import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, createOAuthState, isAllowedOrigin, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'GET, POST, OPTIONS')
    return new Response('ok', { headers: corsHeaders(req, 'GET, POST, OPTIONS') })
  }
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse(req, { error: 'Method not allowed' }, 405, 'GET, POST, OPTIONS')
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'GET, POST, OPTIONS')

  try {
    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') ?? ''
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET') ?? ''
    if (req.method === 'GET') return jsonResponse(req, { enabled: Boolean(clientId && clientSecret) }, 200, 'GET, POST, OPTIONS')
    const body = await req.json().catch(() => ({}))
    const inviteCode = typeof body?.invite_code === 'string' ? body.invite_code.trim().toUpperCase() : ''
    if (inviteCode) {
      if (!/^[A-Z2-9]{8}$/.test(inviteCode)) return jsonResponse(req, { error: 'invalid_code' }, 400, 'POST, OPTIONS')
      const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
      const { data } = await supabase.from('invite_codes').select('id').eq('code', inviteCode).eq('is_used', false).maybeSingle()
      if (!data) return jsonResponse(req, { error: 'invalid_code' }, 400, 'POST, OPTIONS')
    }

    const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI') ?? 'https://immortal.life/auth/linkedin'
    if (!clientId || !clientSecret) return jsonResponse(req, { error: 'linkedin_not_configured' }, 503, 'GET, POST, OPTIONS')
    const state = await createOAuthState('linkedin')
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('scope', 'openid profile')
    return jsonResponse(req, { url: url.toString(), state }, 200, 'GET, POST, OPTIONS')
  } catch (error) {
    console.error('start-linkedin-auth error:', error instanceof Error ? error.message : String(error))
    return jsonResponse(req, { error: 'server_error' }, 500, 'GET, POST, OPTIONS')
  }
})

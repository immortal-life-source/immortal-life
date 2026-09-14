import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isAllowedOrigin, jsonResponse, serviceRoleKey, sessionFromRequest } from '../_shared/security.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'GET, POST, OPTIONS')
    return new Response('ok', { headers: corsHeaders(req, 'GET, POST, OPTIONS') })
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405, 'GET, POST, OPTIONS')
  }
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'GET, POST, OPTIONS')

  try {
    const session = await sessionFromRequest(req)
    if (!session) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'GET, POST, OPTIONS')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    if (req.method === 'GET') {
      const { data: member, error } = await supabase
        .from('members')
        .select('id, auth_provider, auth_subject, last_daily_claim')
        .eq('id', session.member_id)
        .eq('auth_provider', session.provider)
        .eq('auth_subject', session.subject)
        .single()
      if (error || !member) return jsonResponse(req, { error: 'Member not found' }, 404, 'GET, POST, OPTIONS')

      const lastClaim = member.last_daily_claim ? new Date(member.last_daily_claim).getTime() : 0
      const nextClaimAt = lastClaim ? lastClaim + 20 * 60 * 60 * 1000 : 0
      if (nextClaimAt > Date.now()) {
        return jsonResponse(req, {
          claimable: false,
          reason: 'already_claimed',
          next_claim_at: new Date(nextClaimAt).toISOString(),
        }, 200, 'GET, POST, OPTIONS')
      }
      return jsonResponse(req, { claimable: true }, 200, 'GET, POST, OPTIONS')
    }

    const { data, error } = await supabase.rpc('claim_daily_points', {
      p_member_id: session.member_id,
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : data
    return jsonResponse(req, result, 200, 'GET, POST, OPTIONS')
  } catch (err) {
    console.error('claim-daily error:', err instanceof Error ? err.message : String(err))
    return jsonResponse(req, { error: 'server_error' }, 500, 'GET, POST, OPTIONS')
  }
})

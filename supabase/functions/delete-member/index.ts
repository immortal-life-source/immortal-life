import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isAllowedOrigin, jsonResponse, serviceRoleKey, sessionFromRequest } from '../_shared/security.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'POST, OPTIONS')
    return new Response('ok', { headers: corsHeaders(req, 'POST, OPTIONS') })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST, OPTIONS')
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'POST, OPTIONS')

  try {
    const session = await sessionFromRequest(req)
    if (!session) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST, OPTIONS')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id')
      .eq('id', session.member_id)
      .eq('auth_provider', session.provider)
      .eq('auth_subject', session.subject)
      .single()
    if (memberError || !member) return jsonResponse(req, { error: 'Member not found' }, 404, 'POST, OPTIONS')

    const { data, error } = await supabase.rpc('delete_member_account', {
      p_member_id: session.member_id,
    })
    if (error) throw error
    return jsonResponse(req, { success: data === true }, 200, 'POST, OPTIONS')
  } catch (err) {
    console.error('delete-member error:', err instanceof Error ? err.message : String(err))
    return jsonResponse(req, { error: 'server_error' }, 500, 'POST, OPTIONS')
  }
})

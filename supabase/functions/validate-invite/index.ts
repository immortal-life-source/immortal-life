import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isAllowedOrigin, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'POST, OPTIONS')
    return new Response('ok', { headers: corsHeaders(req, 'POST, OPTIONS') })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST, OPTIONS')
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'POST, OPTIONS')

  try {
    const { code } = await req.json()

    if (typeof code !== 'string' || !/^[A-Z2-9]{8}$/i.test(code)) {
      return jsonResponse(req, { valid: false, error: 'Invalid code format' }, 400, 'POST, OPTIONS')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey()
    )

    const { data, error } = await supabase
      .from('invite_codes')
      .select('id, code, is_used, owner_id, members!invite_codes_owner_id_fkey(x_username)')
      .eq('code', code.toUpperCase())
      .single()

    if (error || !data) {
      return jsonResponse(req, { valid: false }, 200, 'POST, OPTIONS')
    }

    if (data.is_used) {
      return jsonResponse(req, { valid: false, reason: 'already_used' }, 200, 'POST, OPTIONS')
    }

    const ownerRel = data.members as { x_username?: string } | { x_username?: string }[] | null
    const owner_username = Array.isArray(ownerRel)
      ? (ownerRel[0]?.x_username ?? 'unknown')
      : (ownerRel?.x_username ?? 'unknown')

    return jsonResponse(req, { valid: true, owner_username }, 200, 'POST, OPTIONS')
  } catch (err) {
    console.error('validate-invite error:', err instanceof Error ? err.message : String(err))
    return jsonResponse(req, { valid: false, error: 'server_error' }, 500, 'POST, OPTIONS')
  }
})

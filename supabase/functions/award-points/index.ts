import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const ACTIONS = new Set([
  'daily_login',
  'invite_signup',
  'chain_signup_depth2',
  'chain_signup_depth3',
  'streak_bonus_7',
  'streak_bonus_30',
  'streak_bonus_100',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req, 'POST, OPTIONS') })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST, OPTIONS')
  if (!isInternalServiceRequest(req)) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST, OPTIONS')

  try {
    const { member_id, action, meta } = await req.json()
    if (!Number.isSafeInteger(member_id) || member_id <= 0 || !ACTIONS.has(action)) {
      return jsonResponse(req, { error: 'Invalid request' }, 400, 'POST, OPTIONS')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data, error } = await supabase.rpc('award_member_points', {
      p_member_id: member_id,
      p_action: action,
      p_meta: meta && typeof meta === 'object' ? meta : {},
    })
    if (error) throw error

    const result = Array.isArray(data) ? data[0] : data
    return jsonResponse(req, { success: true, earned: result?.earned, new_total: result?.new_total }, 200, 'POST, OPTIONS')
  } catch (err) {
    console.error('award-points error:', err instanceof Error ? err.message : String(err))
    return jsonResponse(req, { error: 'server_error' }, 500, 'POST, OPTIONS')
  }
})

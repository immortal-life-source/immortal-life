import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isAllowedOrigin, jsonResponse, serviceRoleKey, sessionFromRequest } from '../_shared/security.ts'

function tierFromRank(rank: number): string {
  if (rank <= 10) return 'Founding Circle'
  if (rank <= 100) return 'Builder'
  if (rank <= 1000) return 'Early'
  return 'Member'
}

function entitledMaxCodes(points: number): number {
  if (points >= 20000) return 66
  if (points >= 5000) return 16
  if (points >= 1000) return 6
  return 3
}

function nextCodeUnlockInfo(points: number): { pointsNeeded: number; codesAtNext: number } | null {
  if (points < 1000) return { pointsNeeded: 1000 - points, codesAtNext: 6 }
  if (points < 5000) return { pointsNeeded: 5000 - points, codesAtNext: 16 }
  if (points < 20000) return { pointsNeeded: 20000 - points, codesAtNext: 66 }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'GET, OPTIONS')
    return new Response('ok', { headers: corsHeaders(req, 'GET, OPTIONS') })
  }
  if (req.method !== 'GET') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'GET, OPTIONS')
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, 'GET, OPTIONS')

  try {
    const session = await sessionFromRequest(req)
    if (!session) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'GET, OPTIONS')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, created_at, x_id, x_username, x_display_name, x_avatar_url, x_follower_count, points, is_og, invited_by, referral_chain_depth, network_size, multiplier, last_login, last_daily_claim, login_streak')
      .eq('id', session.member_id)
      .eq('x_id', session.x_id)
      .single()

    if (memberError || !member) return jsonResponse(req, { error: 'Member not found' }, 404, 'GET, OPTIONS')

    const [{ data: rankData, error: rankError }, { data: inviteCodes, error: codesError }, { data: pointsLog, error: logError }] = await Promise.all([
      supabase.rpc('get_member_rank', { p_member_id: session.member_id }),
      supabase.from('invite_codes').select('id, code, is_used, used_at, created_at').eq('owner_id', session.member_id).order('created_at'),
      supabase.from('points_log').select('id, created_at, action, points, meta').eq('member_id', session.member_id).order('created_at', { ascending: false }).limit(10),
    ])
    if (rankError || codesError || logError) throw rankError ?? codesError ?? logError

    const rank = Number(rankData) || 1
    const points = Number(member.points) || 0
    const codes = inviteCodes ?? []
    const maxEntitled = entitledMaxCodes(points)
    const nextUnlock = nextCodeUnlockInfo(points)
    const unusedCodes = codes.filter((code) => !code.is_used)

    return jsonResponse(req, {
      member,
      rank,
      tier: tierFromRank(rank),
      invite_codes: codes,
      points_log: pointsLog ?? [],
      codes_progress: {
        issued: codes.length,
        entitled_max: maxEntitled,
        points_needed_for_next_codes: nextUnlock?.pointsNeeded ?? 0,
        codes_at_next_tier: nextUnlock?.codesAtNext ?? maxEntitled,
      },
      referral_code: unusedCodes[0]?.code ?? '',
    }, 200, 'GET, OPTIONS')
  } catch (err) {
    console.error('get-dashboard error:', err instanceof Error ? err.message : String(err))
    return jsonResponse(req, { error: 'server_error' }, 500, 'GET, OPTIONS')
  }
})

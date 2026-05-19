import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function getTier(rank: number): string {
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
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const auth = req.headers.get('Authorization') ?? ''
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!bearer) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let payload: { member_id?: number }
    try {
      payload = JSON.parse(atob(bearer))
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const memberId = payload.member_id
    if (memberId == null || typeof memberId !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    const { data: member, error: memErr } = await supabase
      .from('members')
      .select(
        'id, created_at, x_id, x_username, x_display_name, x_avatar_url, x_follower_count, points, tier, invited_by, referral_chain_depth, network_size, multiplier, last_login, login_streak'
      )
      .eq('id', memberId)
      .single()

    if (memErr || !member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { count: rankAhead } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .gt('points', member.points)

    const rank = (rankAhead ?? 0) + 1

    const { data: inviteCodes } = await supabase
      .from('invite_codes')
      .select('id, code, is_used, used_at, created_at')
      .eq('owner_id', memberId)
      .order('created_at', { ascending: true })

    const { data: pointsLog } = await supabase
      .from('points_log')
      .select('id, created_at, action, points, meta')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(10)

    const codes = inviteCodes ?? []
    const issued = codes.length
    const maxEntitled = entitledMaxCodes(member.points)
    const nextUnlock = nextCodeUnlockInfo(member.points)
    const unusedCodes = codes.filter((c) => !c.is_used)
    const firstUnusedCode = unusedCodes[0]?.code ?? codes[0]?.code ?? ''

    return new Response(
      JSON.stringify({
        member,
        rank,
        tier: getTier(rank),
        invite_codes: codes,
        points_log: pointsLog ?? [],
        codes_progress: {
          issued,
          entitled_max: maxEntitled,
          points_needed_for_next_codes: nextUnlock?.pointsNeeded ?? 0,
          codes_at_next_tier: nextUnlock?.codesAtNext ?? maxEntitled,
        },
        referral_code: firstUnusedCode,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

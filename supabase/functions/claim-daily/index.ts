import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Next midnight UTC (start of tomorrow UTC) as ISO timestamp */
function nextMidnightUtcIso(): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0))
  return next.toISOString()
}

function parseSessionMemberId(authHeader: string | null): number | null {
  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!raw) return null
  try {
    const p = JSON.parse(atob(raw))
    return typeof p.member_id === 'number' ? p.member_id : null
  } catch {
    return null
  }
}

/** True if last_daily_claim is on the same UTC calendar day as now */
function alreadyClaimedTodayUtc(lastDailyClaimIso: string | null): boolean {
  if (!lastDailyClaimIso) return false
  const last = new Date(lastDailyClaimIso)
  const now = new Date()
  return utcDateString(last) === utcDateString(now)
}

async function invokeAwardPoints(memberId: number): Promise<{ earned: number; new_total: number }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/award-points`
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      member_id: memberId,
      action: 'daily_login',
      base_points: 10,
      meta: {},
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`award-points failed: ${res.status} ${t}`)
  }
  const j = (await res.json()) as { earned?: number; new_total?: number }
  return { earned: j.earned ?? 10, new_total: j.new_total ?? 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authMemberId = parseSessionMemberId(req.headers.get('Authorization'))

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const checkOnly = url.searchParams.get('check_only') === 'true'
      const memberId = parseInt(url.searchParams.get('member_id') ?? '', 10)

      if (!checkOnly || !Number.isFinite(memberId)) {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (authMemberId == null || authMemberId !== memberId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SERVICE_ROLE_KEY') ?? ''
      )

      const { data: member, error } = await supabase
        .from('members')
        .select('last_daily_claim')
        .eq('id', memberId)
        .single()

      if (error || !member) {
        return new Response(JSON.stringify({ error: 'Member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const lastDaily = member.last_daily_claim as string | null
      if (alreadyClaimedTodayUtc(lastDaily)) {
        return new Response(
          JSON.stringify({
            claimable: false,
            reason: 'already_claimed',
            next_claim_at: nextMidnightUtcIso(),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(JSON.stringify({ claimable: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      let body: { member_id?: number }
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ error: 'invalid_json' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const memberId = body.member_id
      if (memberId == null || typeof memberId !== 'number') {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (authMemberId == null || authMemberId !== memberId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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
        .select('last_daily_claim, login_streak')
        .eq('id', memberId)
        .single()

      if (memErr || !member) {
        return new Response(JSON.stringify({ error: 'Member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const lastDailyIso = member.last_daily_claim as string | null
      if (alreadyClaimedTodayUtc(lastDailyIso)) {
        return new Response(
          JSON.stringify({
            success: false,
            reason: 'already_claimed',
            next_claim_at: nextMidnightUtcIso(),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const prevClaim = lastDailyIso ? new Date(lastDailyIso) : null
      const now = new Date()
      const hoursSince = prevClaim
        ? (now.getTime() - prevClaim.getTime()) / (1000 * 60 * 60)
        : Number.POSITIVE_INFINITY

      const newStreak = prevClaim && hoursSince <= 48 ? (member.login_streak ?? 0) + 1 : 1

      const { earned, new_total } = await invokeAwardPoints(memberId)

      const { error: upErr } = await supabase
        .from('members')
        .update({
          last_daily_claim: now.toISOString(),
          login_streak: newStreak,
        })
        .eq('id', memberId)

      if (upErr) throw upErr

      return new Response(
        JSON.stringify({
          success: true,
          points_earned: earned,
          new_total,
          login_streak: newStreak,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

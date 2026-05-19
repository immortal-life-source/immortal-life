import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Threshold crossed means oldPoints < threshold <= newPoints */
const CODE_UNLOCK_THRESHOLDS: { threshold: number; count: number }[] = [
  { threshold: 1000, count: 3 },
  { threshold: 5000, count: 10 },
  { threshold: 20000, count: 50 },
]

function getMultiplier(networkSize: number): number {
  if (networkSize >= 200) return 3.0
  if (networkSize >= 51) return 2.0
  if (networkSize >= 11) return 1.5
  return 1.0
}

function generateInviteCodes(n: number): string[] {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: n }, () =>
    Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  )
}

async function unlockThresholdInviteCodes(
  supabase: ReturnType<typeof createClient>,
  memberId: number,
  oldPoints: number,
  newPoints: number
) {
  for (const { threshold, count } of CODE_UNLOCK_THRESHOLDS) {
    if (oldPoints < threshold && newPoints >= threshold) {
      const codes = generateInviteCodes(count)
      const { error: codeErr } = await supabase.from('invite_codes').insert(codes.map((c) => ({ code: c, owner_id: memberId })))
      if (codeErr) throw codeErr
      const { error: logErr } = await supabase.from('points_log').insert({
        member_id: memberId,
        action: 'codes_unlocked',
        points: 0,
        meta: { count, threshold },
      })
      if (logErr) throw logErr
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { member_id, action, base_points, meta } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    const { data: member } = await supabase
      .from('members')
      .select('points, network_size, multiplier')
      .eq('id', member_id)
      .single()

    if (!member) throw new Error('Member not found')

    const oldPoints = member.points ?? 0
    const multiplier = getMultiplier(member.network_size ?? 0)
    const earned = Math.round(Number(base_points) * multiplier)
    const newPoints = oldPoints + earned

    await supabase
      .from('points_log')
      .insert({ member_id, action, points: earned, meta })

    await supabase
      .from('members')
      .update({ points: newPoints, multiplier })
      .eq('id', member_id)

    await unlockThresholdInviteCodes(supabase, member_id, oldPoints, newPoints)

    return new Response(
      JSON.stringify({ success: true, earned, new_total: newPoints }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

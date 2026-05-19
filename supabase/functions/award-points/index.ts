import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getMultiplier(networkSize: number): number {
  if (networkSize >= 200) return 3.0
  if (networkSize >= 51) return 2.0
  if (networkSize >= 11) return 1.5
  return 1.0
}

function getUnlockedCodes(points: number): number {
  if (points >= 20000) return 66
  if (points >= 5000) return 16
  if (points >= 1000) return 6
  return 3
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

    const multiplier = getMultiplier(member.network_size)
    const earned = Math.round(base_points * multiplier)
    const newPoints = member.points + earned

    await supabase
      .from('points_log')
      .insert({ member_id, action, points: earned, meta })

    await supabase
      .from('members')
      .update({ points: newPoints, multiplier })
      .eq('id', member_id)

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

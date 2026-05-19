import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getTier(rank: number): string {
  if (rank <= 10) return 'Founding Circle'
  if (rank <= 100) return 'Builder'
  if (rank <= 1000) return 'Early'
  return 'Member'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') ?? '100')
    const offset = parseInt(url.searchParams.get('offset') ?? '0')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase
      .from('members')
      .select('id, x_username, x_display_name, x_avatar_url, points, network_size, created_at')
      .order('points', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const { count } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })

    const ranked = (data ?? []).map((member, index) => ({
      rank: offset + index + 1,
      ...member,
      tier: getTier(offset + index + 1)
    }))

    return new Response(
      JSON.stringify({ members: ranked, total: count ?? 0 }),
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

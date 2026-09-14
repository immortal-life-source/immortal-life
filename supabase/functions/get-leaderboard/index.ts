import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

function tierFromRank(rank: number): string {
  if (rank <= 10) return 'Founding Circle'
  if (rank <= 100) return 'Builder'
  if (rank <= 1000) return 'Early'
  return 'Member'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req, 'GET, OPTIONS') })
  if (req.method !== 'GET') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'GET, OPTIONS')

  try {
    const url = new URL(req.url)
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '100', 10)
    const parsedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 100
    const offset = Number.isFinite(parsedOffset) ? Math.min(Math.max(parsedOffset, 0), 10000) : 0

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data, error } = await supabase
      .from('members')
      .select('id, auth_provider, profile_handle, profile_url, profile_display_name, profile_avatar_url, points, network_size, created_at, is_og')
      .order('points', { ascending: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
    if (error) throw error

    const { count, error: countError } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
    if (countError) throw countError

    const members = (data ?? []).map((member, index) => {
      const rank = offset + index + 1
      return { rank, ...member, tier: tierFromRank(rank), is_og: Boolean(member.is_og) }
    })
    return jsonResponse(req, { members, total: count ?? 0 }, 200, 'GET, OPTIONS')
  } catch (err) {
    console.error('get-leaderboard error:', err instanceof Error ? err.message : String(err))
    return jsonResponse(req, { error: 'server_error' }, 500, 'GET, OPTIONS')
  }
})

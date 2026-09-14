import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req, 'GET, OPTIONS') })
  if (req.method !== 'GET') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'GET, OPTIONS')
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
    const [projectResult, legacyResult] = await Promise.all([
      supabase.from('project_news').select('id,title,content,published_at').eq('is_published', true).lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }).limit(30),
      supabase.from('news').select('id,content,published_at').eq('is_visible', true).lte('published_at', new Date().toISOString().slice(0, 10)).order('published_at', { ascending: false }).limit(30),
    ])
    if (projectResult.error) throw projectResult.error
    if (legacyResult.error) throw legacyResult.error
    const combined = [
      ...(projectResult.data ?? []),
      ...(legacyResult.data ?? []).map((item: any) => ({ ...item, id: `legacy-${item.id}`, title: null })),
    ].sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime()).slice(0, 40)
    const response = jsonResponse(req, { news: combined }, 200, 'GET, OPTIONS')
    response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=900')
    return response
  } catch (error) {
    console.error('get-news error:', error instanceof Error ? error.message : String(error))
    return jsonResponse(req, { error: 'content_unavailable' }, 500, 'GET, OPTIONS')
  }
})

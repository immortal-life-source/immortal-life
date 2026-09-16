import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { corsHeaders, isAllowedOrigin, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const METHODS = 'POST, OPTIONS'
const EVENTS = new Set(['open_source', 'create_watch', 'remove_watch', 'open_change', 'download_dataset', 'copy_embed', 'subscribe_briefing', 'share_record'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, METHODS)
    return new Response('ok', { headers: corsHeaders(req, METHODS) })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, METHODS)
  if (!isAllowedOrigin(req)) return jsonResponse(req, { error: 'Origin not allowed' }, 403, METHODS)
  const body = await req.json().catch(() => ({}))
  const eventName = cleanText(body?.event, 40)
  const pagePath = cleanText(body?.path, 240)
  if (!EVENTS.has(eventName) || !/^\/[a-zA-Z0-9/_\-.]{0,240}$/.test(pagePath)) return jsonResponse(req, { error: 'Invalid event' }, 400, METHODS)
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await supabase.rpc('increment_utility_event', { p_event_name: eventName, p_page_path: pagePath })
    if (error) throw error
    return new Response(null, { status: 204, headers: corsHeaders(req, METHODS) })
  } catch (error) {
    console.error('record-utility-event error:', error instanceof Error ? error.message : String(error))
    return jsonResponse(req, { error: 'server_error' }, 500, METHODS)
  }
})

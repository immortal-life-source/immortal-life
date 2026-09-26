import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character))
}

function safeSourceUrl(value: unknown): string {
  try {
    const parsed = new URL(String(value ?? ''))
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : SITE
  } catch (_) { return SITE }
}

function constantTimeMatch(left: string, right: string): boolean {
  if (!right || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}
async function authorized(req: Request, supabase: any): Promise<boolean> {
  if (isInternalServiceRequest(req)) return true
  const supplied = req.headers.get('x-intelligence-secret')?.trim() ?? ''
  if (supplied.length < 32 || supplied.length > 256) return false
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && constantTimeMatch(hash, data.value)
}

async function unsubscribeToken(id: string): Promise<string> {
  const secret = Deno.env.get('SUBSCRIPTION_SIGNING_SECRET') || serviceRoleKey()
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${id}.${signature}`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!apiKey) return jsonResponse(req, { ok: true, configured: false, delivered: 0 }, 200, 'POST')
  try {
    const { data: briefing, error: briefingError } = await supabase.from('public_briefings').select('slug,title,dek,summary,period_start,period_end').order('period_start', { ascending: false }).limit(1).maybeSingle()
    if (briefingError) throw briefingError
    if (!briefing) return jsonResponse(req, { ok: true, configured: true, delivered: 0, reason: 'no_briefing' }, 200, 'POST')
    const until = new Date(`${briefing.period_end}T00:00:00Z`)
    until.setUTCDate(until.getUTCDate() + 1)
    const [{ data: subscribers, error: subscriberError }, { data: changes, error: changesError }] = await Promise.all([
      supabase.from('briefing_subscribers').select('id,email,topic_slug,unsubscribe_token_hash,last_delivery_at').eq('status', 'active').limit(1000),
      supabase.from('intelligence_change_events')
        .select('event_type,record_type,title,source_url,occurred_at,topic_slugs,content_sources!inner(paid_distribution_allowed)')
        .eq('content_sources.paid_distribution_allowed', true)
        .neq('event_type', 'quality_state_changed')
        .gte('occurred_at', `${briefing.period_start}T00:00:00Z`)
        .lt('occurred_at', until.toISOString())
        .order('occurred_at', { ascending: false })
        .limit(2000),
    ])
    if (subscriberError || changesError) throw subscriberError || changesError
    let delivered = 0
    for (const subscriber of subscribers ?? []) {
      if (subscriber.last_delivery_at && new Date(subscriber.last_delivery_at) >= new Date(`${briefing.period_start}T00:00:00Z`)) continue
      const topicChanges = subscriber.topic_slug
        ? (changes ?? []).filter((change: any) => Array.isArray(change.topic_slugs) && change.topic_slugs.includes(subscriber.topic_slug))
        : []
      if (subscriber.topic_slug && topicChanges.length === 0) {
        await supabase.from('briefing_subscribers').update({ last_delivery_at: new Date().toISOString() }).eq('id', subscriber.id)
        continue
      }
      const topicName = String(subscriber.topic_slug || '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
      const topicLine = subscriber.topic_slug ? `<p>Your watch: <a href="${SITE}/topics/${encodeURIComponent(subscriber.topic_slug)}">${escapeHtml(topicName)}</a></p>` : ''
      const changeList = subscriber.topic_slug
        ? `<h2>What changed</h2><ul>${topicChanges.slice(0, 10).map((change: any) => `<li><a href="${escapeHtml(safeSourceUrl(change.source_url))}">${escapeHtml(change.title)}</a> <small>${escapeHtml(String(change.record_type || '').replace(/-/g, ' '))}</small></li>`).join('')}</ul>`
        : ''
      const unsubscribe = await unsubscribeToken(subscriber.id)
      const subject = subscriber.topic_slug ? `${topicName} Longevity Watch · week ending ${briefing.period_end}` : briefing.title
      const intro = subscriber.topic_slug
        ? `${topicChanges.length} source-linked update${topicChanges.length === 1 ? '' : 's'} matched your watch this week. Inclusion describes a source change, not evidence of benefit or safety.`
        : briefing.summary
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('BRIEFING_FROM_EMAIL') ?? 'immortal.life <briefings@immortal.life>', to: [subscriber.email], subject, html: `<h1>${escapeHtml(subject)}</h1><p>${escapeHtml(intro)}</p>${topicLine}${changeList}<p><a href="${SITE}/briefings/${encodeURIComponent(briefing.slug)}">Read the complete source-linked briefing</a></p><p>Generated automatically from commercially cleared source metadata. Research information only; not medical advice.</p><p><small><a href="${SITE}/api/subscribe?action=unsubscribe&amp;token=${encodeURIComponent(unsubscribe)}">Unsubscribe</a></small></p>` }) })
      await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: 'email', destination: `subscriber:${subscriber.id}`, succeeded: response.ok, response_status: response.status, error_code: response.ok ? null : `http_${response.status}` })
      if (response.ok) { delivered += 1; await supabase.from('briefing_subscribers').update({ last_delivery_at: new Date().toISOString() }).eq('id', subscriber.id) }
    }
    return jsonResponse(req, { ok: true, configured: true, delivered }, 200, 'POST')
  } catch (error) {
    console.error('deliver-briefings error:', cleanText(error instanceof Error ? error.message : String(error), 500))
    return jsonResponse(req, { error: 'delivery_failed' }, 500, 'POST')
  }
})

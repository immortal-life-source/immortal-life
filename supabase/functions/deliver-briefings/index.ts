import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'

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
    const [{ data: briefing, error: briefingError }, { data: subscribers, error: subscriberError }] = await Promise.all([
      supabase.from('public_briefings').select('slug,title,dek,summary,period_start,period_end').order('period_start', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('briefing_subscribers').select('id,email,topic_slug,unsubscribe_token_hash,last_delivery_at').eq('status', 'active').limit(1000),
    ])
    if (briefingError || subscriberError) throw briefingError || subscriberError
    if (!briefing) return jsonResponse(req, { ok: true, configured: true, delivered: 0, reason: 'no_briefing' }, 200, 'POST')
    let delivered = 0
    for (const subscriber of subscribers ?? []) {
      if (subscriber.last_delivery_at && new Date(subscriber.last_delivery_at) >= new Date(`${briefing.period_start}T00:00:00Z`)) continue
      const topicLine = subscriber.topic_slug ? `<p>Your watch: <a href="${SITE}/topics/${subscriber.topic_slug}">${subscriber.topic_slug.replace(/-/g, ' ')}</a></p>` : ''
      const unsubscribe = await unsubscribeToken(subscriber.id)
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('BRIEFING_FROM_EMAIL') ?? 'immortal.life <briefings@immortal.life>', to: [subscriber.email], subject: briefing.title, html: `<h1>${briefing.title}</h1><p>${briefing.summary}</p>${topicLine}<p><a href="${SITE}/briefings/${briefing.slug}">Read the source-linked briefing</a></p><p>Generated automatically from cited source metadata. Research information only; not medical advice.</p><p><small><a href="${SITE}/api/subscribe?action=unsubscribe&amp;token=${encodeURIComponent(unsubscribe)}">Unsubscribe</a></small></p>` }) })
      await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: 'email', destination: `subscriber:${subscriber.id}`, succeeded: response.ok, response_status: response.status, error_code: response.ok ? null : `http_${response.status}` })
      if (response.ok) { delivered += 1; await supabase.from('briefing_subscribers').update({ last_delivery_at: new Date().toISOString() }).eq('id', subscriber.id) }
    }
    return jsonResponse(req, { ok: true, configured: true, delivered }, 200, 'POST')
  } catch (error) {
    console.error('deliver-briefings error:', cleanText(error instanceof Error ? error.message : String(error), 500))
    return jsonResponse(req, { error: 'delivery_failed' }, 500, 'POST')
  }
})

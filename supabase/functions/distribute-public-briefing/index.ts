import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'
const INDEXNOW_KEY = '9f2c4a7e61d84b73a5c901e8f426bd10'
const AUTOMATION_DISCLOSURE = 'Generated automatically from cited source metadata. No scientist, clinician, researcher, editor, or human reviewer evaluates this publication before release.'
const MEDICAL_NOTICE = 'Research information only. Not medical advice, diagnosis, or treatment guidance.'

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
  const hash = await sha256(supplied)
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && constantTimeMatch(hash, data.value)
}

function safeEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || host === 'localhost' || host.endsWith('.local') || /^(127|10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null
    return url.toString()
  } catch { return null }
}

function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

async function signature(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))
}

function sourceRows(payload: any): any[] {
  const dateFields: Record<string, string[]> = { research: ['published_on'], trials: ['last_update_date'], regulatory: ['published_at'], integrity: ['announced_on', 'detected_at'] }
  return ['research', 'trials', 'regulatory', 'integrity'].flatMap((type) => (Array.isArray(payload?.[type]) ? payload[type] : []).map((row: any) => ({
    type,
    id: `${type}:${String(row.id)}`,
    title: cleanText(row.title, 500),
    url: String(row.source_url || ''),
    publishedAt: dateFields[type].map((field) => row[field]).find(Boolean) || null,
  }))).filter((row) => row.title && /^https:\/\//i.test(row.url)).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)).slice(0, 20)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  try {
    const { data: briefing, error } = await supabase.from('public_briefings').select('slug,title,dek,period_start,period_end,summary,payload,automation_disclosure').order('period_start', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!briefing) return jsonResponse(req, { ok: true, distributed: 0, reason: 'no_briefing' }, 200, 'POST')

    const briefingUrl = `${SITE}/briefings/${briefing.slug}`
    const localTargets = [
      { channel: 'websub-rss', destination: 'https://pubsubhubbub.appspot.com/', body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': `${SITE}/feed.xml` }), type: 'form' },
      { channel: 'websub-atom', destination: 'https://pubsubhubbub.appspot.com/', body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': `${SITE}/feed.atom` }), type: 'form' },
      { channel: 'indexnow', destination: 'https://api.indexnow.org/indexnow', body: JSON.stringify({ host: 'www.immortal.life', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: [briefingUrl] }), type: 'json' },
    ]
    const outcomes: Array<Record<string, unknown>> = []
    for (const target of localTargets) {
      const { count } = await supabase.from('briefing_distribution_log').select('*', { count: 'exact', head: true }).eq('briefing_slug', briefing.slug).eq('channel', target.channel).eq('destination', target.destination).eq('succeeded', true)
      if ((count ?? 0) > 0) { outcomes.push({ channel: target.channel, status: 'already_distributed' }); continue }
      try {
        const result = await fetch(target.destination, { method: 'POST', headers: { 'Content-Type': target.type === 'form' ? 'application/x-www-form-urlencoded' : 'application/json' }, body: target.body })
        const succeeded = result.ok || result.status === 202 || result.status === 204
        await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: target.channel, destination: target.destination, succeeded, response_status: result.status, error_code: succeeded ? null : `http_${result.status}` })
        outcomes.push({ channel: target.channel, status: result.status, succeeded })
      } catch (targetError) {
        const errorCode = cleanText(targetError instanceof Error ? targetError.message : String(targetError), 240) || 'delivery_failed'
        await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: target.channel, destination: target.destination, succeeded: false, error_code: errorCode })
        outcomes.push({ channel: target.channel, succeeded: false, error: errorCode })
      }
    }

    const endpoint = safeEndpoint(Deno.env.get('SOCIAL_DISTRIBUTION_ENDPOINT'))
    const secret = Deno.env.get('SOCIAL_DISTRIBUTION_WEBHOOK_SECRET') ?? ''
    if (endpoint && secret.length >= 32) {
      const counts = briefing.payload?.counts ?? { research: 0, trials: 0, regulatory: 0, integrity: 0 }
      const material = { slug: briefing.slug, title: briefing.title, dek: briefing.dek, summary: briefing.summary, periodStart: briefing.period_start, periodEnd: briefing.period_end, url: briefingUrl, counts, sources: sourceRows(briefing.payload) }
      const sourceDigest = await sha256(stable(material))
      const idempotencyKey = `immortal-life:briefing:${briefing.slug}:${sourceDigest.slice(0, 16)}`
      const event = { schemaVersion: 1, event: 'briefing.published', project: 'immortal-life', occurredAt: new Date().toISOString(), idempotencyKey, channels: ['linkedin', 'x'], briefing: { ...material, sourceDigest, automationDisclosure: briefing.automation_disclosure || AUTOMATION_DISCLOSURE, medicalNotice: MEDICAL_NOTICE } }
      const rawBody = JSON.stringify(event); const timestamp = String(Math.floor(Date.now() / 1000))
      try {
        const signed = await signature(secret, `${timestamp}.${rawBody}`)
        const result = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, 'X-Distribution-Timestamp': timestamp, 'X-Distribution-Signature': `sha256=${signed}` }, body: rawBody })
        const responseBody = await result.json().catch(() => ({}))
        const succeeded = result.status === 200 || result.status === 202
        await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: 'webhook', destination: endpoint, succeeded, response_status: result.status, error_code: succeeded ? null : `http_${result.status}`, source_digest: sourceDigest, receipt_id: cleanText(responseBody?.receiptId, 200) || null })
        outcomes.push({ channel: 'social-distribution', status: result.status, succeeded, receipt_id: responseBody?.receiptId ?? null })
      } catch (socialError) {
        const errorCode = cleanText(socialError instanceof Error ? socialError.message : String(socialError), 240) || 'delivery_failed'
        await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: 'webhook', destination: endpoint, succeeded: false, error_code: errorCode, source_digest: sourceDigest })
        outcomes.push({ channel: 'social-distribution', succeeded: false, error: errorCode })
      }
    } else {
      outcomes.push({ channel: 'social-distribution', status: 'not_configured' })
    }
    return jsonResponse(req, { ok: outcomes.every((item) => item.succeeded !== false), briefing: briefing.slug, outcomes }, 200, 'POST')
  } catch (error) {
    console.error('distribute-public-briefing error:', cleanText(error instanceof Error ? error.message : String(error), 500))
    return jsonResponse(req, { error: 'distribution_failed' }, 500, 'POST')
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanText } from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'
const INDEXNOW_KEY = '9f2c4a7e61d84b73a5c901e8f426bd10'

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

function safeWebhook(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || /^(127|10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null
    return url.toString()
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')

  try {
    const { data: briefing, error } = await supabase.from('public_briefings').select('slug,title,dek,period_start,period_end,summary').order('period_start', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!briefing) return jsonResponse(req, { ok: true, distributed: 0, reason: 'no_briefing' }, 200, 'POST')

    const configured = JSON.parse(Deno.env.get('BRIEFING_DISTRIBUTION_WEBHOOKS') || '[]')
    const webhooks = Array.isArray(configured) ? configured.map(safeWebhook).filter(Boolean) as string[] : []
    const briefingUrl = `${SITE}/briefings/${briefing.slug}`
    const socialText = `${briefing.title}\n\n${briefing.dek}\n\nSource-linked and generated automatically. Research information only.\n${briefingUrl}`
    const linkedinToken = Deno.env.get('LINKEDIN_PAGE_ACCESS_TOKEN') ?? ''
    const linkedinAuthor = Deno.env.get('LINKEDIN_PAGE_AUTHOR_URN') ?? ''
    const xToken = Deno.env.get('X_USER_ACCESS_TOKEN') ?? ''
    const targets = [
      { channel: 'websub-rss', destination: 'https://pubsubhubbub.appspot.com/', body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': `${SITE}/feed.xml` }), type: 'form', headers: {} },
      { channel: 'websub-atom', destination: 'https://pubsubhubbub.appspot.com/', body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': `${SITE}/feed.atom` }), type: 'form', headers: {} },
      { channel: 'indexnow', destination: 'https://api.indexnow.org/indexnow', body: JSON.stringify({ host: 'www.immortal.life', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: [briefingUrl] }), type: 'json', headers: {} },
      ...(linkedinToken && linkedinAuthor ? [{ channel: 'linkedin', destination: 'https://api.linkedin.com/rest/posts', body: JSON.stringify({ author: linkedinAuthor, commentary: socialText, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }), type: 'json', headers: { Authorization: `Bearer ${linkedinToken}`, 'LinkedIn-Version': '202609', 'X-Restli-Protocol-Version': '2.0.0' } }] : []),
      ...(xToken ? [{ channel: 'x', destination: 'https://api.x.com/2/tweets', body: JSON.stringify({ text: socialText.slice(0, 275) }), type: 'json', headers: { Authorization: `Bearer ${xToken}` } }] : []),
      ...webhooks.map((destination) => ({ channel: 'webhook', destination, body: JSON.stringify({ event: 'briefing.published', briefing: { ...briefing, url: briefingUrl }, automation_disclosure: 'Generated and distributed automatically without human review.' }), type: 'json', headers: {} })),
    ]

    const outcomes: Array<Record<string, unknown>> = []
    for (const target of targets) {
      const { count } = await supabase.from('briefing_distribution_log').select('*', { count: 'exact', head: true }).eq('briefing_slug', briefing.slug).eq('channel', target.channel).eq('destination', target.destination).eq('succeeded', true)
      if ((count ?? 0) > 0) {
        outcomes.push({ channel: target.channel, status: 'already_distributed' })
        continue
      }
      try {
        const result = await fetch(target.destination, { method: 'POST', headers: { 'Content-Type': target.type === 'form' ? 'application/x-www-form-urlencoded' : 'application/json', ...target.headers }, body: target.body })
        const succeeded = result.ok || result.status === 202 || result.status === 204
        await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: target.channel, destination: target.destination, succeeded, response_status: result.status, error_code: succeeded ? null : `http_${result.status}` })
        outcomes.push({ channel: target.channel, status: result.status, succeeded })
      } catch (targetError) {
        const errorCode = cleanText(targetError instanceof Error ? targetError.message : String(targetError), 240) || 'delivery_failed'
        await supabase.from('briefing_distribution_log').insert({ briefing_slug: briefing.slug, channel: target.channel, destination: target.destination, succeeded: false, error_code: errorCode })
        outcomes.push({ channel: target.channel, succeeded: false, error: errorCode })
      }
    }
    return jsonResponse(req, { ok: outcomes.every((item) => item.succeeded !== false), briefing: briefing.slug, outcomes }, 200, 'POST')
  } catch (error) {
    console.error('distribute-public-briefing error:', cleanText(error instanceof Error ? error.message : String(error), 500))
    return jsonResponse(req, { error: 'distribution_failed' }, 500, 'POST')
  }
})

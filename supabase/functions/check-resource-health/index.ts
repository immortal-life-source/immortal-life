import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const ALLOWED_HOSTS = new Set([
  'www.who.int', 'trialsearch.who.int', 'europepmc.org', 'www.ebi.ac.uk',
  'doaj.org',
  'pubmed.ncbi.nlm.nih.gov', 'eutils.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov',
  'www.crossref.org', 'api.crossref.org', 'clinicaltrials.gov',
  'www.canada.ca', 'health-products.canada.ca', 'open.canada.ca', 'recalls-rappels.canada.ca',
  'www.ema.europa.eu', 'euclinicaltrials.eu', 'www.fda.gov', 'open.fda.gov', 'api.fda.gov',
  'www.gov.uk', 'www.nationalarchives.gov.uk', 'sukl.gov.cz', 'www.swissmedic.ch',
  'www.tga.gov.au', 'www.pmda.go.jp', 'www.isrctn.com', 'www.anzctr.org.au', 'jrct.niph.go.jp',
  'www.ensaiosclinicos.gov.br', 'www.chictr.org.cn', 'cris.nih.go.kr', 'ctri.nic.in',
  'rpcec.sld.cu', 'www.clinicaltrialsregister.eu', 'www.drks.de', 'www.irct.ir',
  'itmctr.ccebtcm.org.cn', 'lbctr.moph.gov.lb', 'www.thaiclinicaltrials.org',
  'pactr.samrc.ac.za', 'ensayosclinicos-repec.ins.gob.pe', 'www.slctr.lk', 'jrct.mhlw.go.jp',
  'platform.who.int', 'data.who.int', 'genomics.senescence.info', 'g2aging.org',
  'www.ukbiobank.ac.uk', 'share-eric.eu', 'www.clsa-elcv.ca', 'hrs.isr.umich.edu',
  'www.cochranelibrary.com', 'www.epistemonikos.org', 'openalex.org', 'api.openalex.org',
  'www.gov.br', 'cdsco.gov.in', 'www.sahpra.org.za', 'www.medsafe.govt.nz',
  'www.hsa.gov.sg', 'www.mfds.go.kr', 'www.nmpa.gov.cn', 'www.sfda.gov.sa',
  'www.aifa.gov.it', 'www.aemps.gob.es', 'www.bfarm.de',
  'www.basg.gv.at', 'www.famhp.be', 'www.bda.bg', 'www.halmed.hr', 'www.moh.gov.cy',
  'laegemiddelstyrelsen.dk', 'www.ravimiamet.ee', 'fimea.fi', 'ansm.sante.fr', 'www.pei.de',
  'www.eof.gr', 'www.nnk.gov.hu', 'www.hpra.ie', 'www.zva.gov.lv', 'vvkt.lrv.lt',
  'sante.public.lu', 'medicinesauthority.gov.mt', 'www.cbg-meb.nl', 'www.urpl.gov.pl',
  'www.infarmed.pt', 'www.anm.ro', 'www.sukl.sk', 'www.jazmp.si', 'www.lakemedelsverket.se',
])

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
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied))
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data } = await supabase.from('intelligence_runtime_config').select('value').eq('key', 'sync_secret_sha256').maybeSingle()
  return typeof data?.value === 'string' && constantTimeMatch(hash, data.value)
}

function checkedUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error('healthcheck_host_not_allowed')
  return url
}

async function check(resource: any): Promise<Record<string, unknown>> {
  const started = Date.now()
  try {
    const url = checkedUrl(String(resource.healthcheck_url))
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'immortal.life-resource-monitor/1.0', Accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.5', Range: 'bytes=0-2047' },
      signal: AbortSignal.timeout(12000),
    })
    const healthy = response.status >= 200 && response.status < 400
    const reachable = healthy || [401, 403, 405, 416, 429].includes(response.status)
    try { await response.body?.cancel() } catch { /* Response metadata is sufficient. */ }
    return {
      id: resource.id,
      healthy,
      reachable,
      status: response.status,
      latency_ms: Date.now() - started,
      error: healthy ? null : `http_${response.status}`,
    }
  } catch (error) {
    return {
      id: resource.id,
      healthy: false,
      reachable: false,
      status: null,
      latency_ms: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 160) : 'healthcheck_failed',
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  if (!(await authorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')

  try {
    const { data: resources, error } = await supabase.from('global_resources').select('id,healthcheck_url,consecutive_failures').order('id')
    if (error) throw error
    const results: Record<string, unknown>[] = []
    const batchSize = 8
    for (let index = 0; index < (resources ?? []).length; index += batchSize) {
      const batch = (resources ?? []).slice(index, index + batchSize)
      results.push(...await Promise.all(batch.map(check)))
    }
    const checkedAt = new Date().toISOString()
    for (const result of results) {
      const current = (resources ?? []).find((resource: any) => resource.id === result.id)
      const healthy = result.healthy === true
      const reachable = result.reachable === true
      const { error: updateError } = await supabase.from('global_resources').update({
        last_checked_at: checkedAt,
        last_healthy_at: healthy ? checkedAt : undefined,
        last_status_code: result.status,
        consecutive_failures: reachable ? 0 : Number(current?.consecutive_failures ?? 0) + 1,
        last_error: result.error,
        updated_at: checkedAt,
      }).eq('id', result.id)
      if (updateError) throw updateError
    }
    const { error: eligibilityError } = await supabase.rpc('refresh_global_resource_eligibility')
    if (eligibilityError) throw eligibilityError
    return jsonResponse(req, {
      ok: true,
      checked: results.length,
      healthy: results.filter((result) => result.healthy).length,
      degraded: results.filter((result) => !result.healthy).length,
      results,
    }, 200, 'POST')
  } catch (error) {
    console.error('check-resource-health error', error instanceof Error ? error.message : String(error))
    return jsonResponse(req, { error: 'resource_health_check_failed' }, 500, 'POST')
  }
})

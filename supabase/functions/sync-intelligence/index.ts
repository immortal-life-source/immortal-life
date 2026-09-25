import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assessTopicMatch,
  classifyEvidence,
  cleanText,
  dateOnly,
  duplicateClusterKey,
  freshnessScore,
  normalizeTrialStatus,
  researchEditorialSummary,
  sourceQualityScore,
  trialEditorialSummary,
  uniqueStrings,
} from '../_shared/intelligence.ts'
import { isInternalServiceRequest, jsonResponse, serviceRoleKey } from '../_shared/security.ts'

type Topic = {
  slug: string
  name: string
  literature_query: string
  trials_query: string
}

type Job = {
  id: number
  source_id: string
  topic_slug: string | null
  job_key: string
  attempts: number
  sync_mode: 'incremental' | 'history'
  cursor_state: Record<string, unknown>
  pages_processed: number
  items_seen: number
  items_written: number
  window_start: string
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const RUN_TIME_BUDGET_MS = 118_000
const PUBMED_PAGE_SIZE = 200
const EUROPE_PMC_PAGE_SIZE = 1000
const CLINICAL_TRIALS_PAGE_SIZE = 1000
const HISTORY_START = '1800-01-01'
const USER_AGENT = 'immortal.life-intelligence/1.0 (contact: research@immortal.life)'

const REGULATORY_FEEDS = {
  ema: { url: 'https://www.ema.europa.eu/en/news.xml', jurisdiction: 'European Union', name: 'European Medicines Agency', language: 'en' },
  sukl: { url: 'https://sukl.gov.cz/feed/', jurisdiction: 'Czech Republic', name: 'SÚKL', language: 'cs' },
  'fda-medwatch': { url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml', jurisdiction: 'United States', name: 'U.S. Food and Drug Administration (MedWatch)', language: 'en' },
  mhra: { url: 'https://www.gov.uk/drug-safety-update.atom', jurisdiction: 'United Kingdom', name: 'Medicines and Healthcare products Regulatory Agency', language: 'en' },
  'health-canada-safety': { url: 'https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls', jurisdiction: 'Canada', name: 'Health Canada', language: 'en' },
  'tga-safety': { url: 'https://www.tga.gov.au/feeds/alert/safety-alerts.xml', jurisdiction: 'Australia', name: 'Therapeutic Goods Administration', language: 'en' },
} as const

type RegulatorySourceId = keyof typeof REGULATORY_FEEDS
const TOPIC_SOURCE_IDS = new Set(['europe-pmc', 'pubmed', 'clinicaltrials-gov'])
const GENERIC_SOURCE_IDS = new Set([...TOPIC_SOURCE_IDS, 'crossref', ...Object.keys(REGULATORY_FEEDS)])
const HISTORY_SOURCE_IDS = new Set([...TOPIC_SOURCE_IDS, 'crossref'])
let lastNcbiRequestAt = 0

type SyncOutcome = {
  seen: number
  written: number
  done: boolean
  cursorState?: Record<string, unknown>
  totalAvailable?: number | null
}

function constantTimeSecretMatch(supplied: string, expected: string): boolean {
  if (!expected || supplied.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < supplied.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i)
  return mismatch === 0
}

async function isAuthorized(req: Request, supabase: any): Promise<boolean> {
  if (isInternalServiceRequest(req)) return true
  const supplied = req.headers.get('x-intelligence-secret')?.trim() ?? ''
  if (supplied.length < 32 || supplied.length > 256) return false

  const environmentSecret = Deno.env.get('INTELLIGENCE_SYNC_SECRET') ?? ''
  if (environmentSecret && constantTimeSecretMatch(supplied, environmentSecret)) return true

  const suppliedHashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied))
  const suppliedHash = [...new Uint8Array(suppliedHashBytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const { data, error } = await supabase
    .from('intelligence_runtime_config')
    .select('value')
    .eq('key', 'sync_secret_sha256')
    .maybeSingle()
  return !error && typeof data?.value === 'string' && constantTimeSecretMatch(suppliedHash, data.value)
}

async function fetchJson(url: URL): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Upstream ${response.status} from ${url.hostname}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchText(url: URL): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Upstream ${response.status} from ${url.hostname}`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function xmlText(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return cleanText((match?.[1] ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"), 1200)
}

function xmlTexts(block: string, tag: string, maxItems = 80): string[] {
  const matches = [...block.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
  return uniqueStrings(matches.map((match) => cleanText((match[1] ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"), 1200)), maxItems)
}

async function throttleNcbi(): Promise<void> {
  const waitMs = Math.max(0, 400 - (Date.now() - lastNcbiRequestAt))
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs))
  lastNcbiRequestAt = Date.now()
}

async function stableId(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 40)
}

const TOPIC_KEYWORDS: Record<string, RegExp> = {
  rapamycin: /\b(rapamycin|sirolimus|everolimus|mTOR)\b/i,
  senolytics: /\b(senolytic|senescence|senescent)\b/i,
  'partial-reprogramming': /\b(partial reprogramming|epigenetic reprogramming|Yamanaka)\b/i,
  metformin: /\bmetformin\b/i,
  'glp-1-therapies': /\b(GLP-?1|semaglutide|tirzepatide|liraglutide)\b/i,
  exercise: /\b(exercise|physical activity|fitness)\b/i,
  'caloric-restriction': /\b(calori(?:c|e) restriction|intermittent fasting)\b/i,
  sleep: /\bsleep\b/i,
  'epigenetic-clocks': /\b(epigenetic clock|DNA methylation age|biological age)\b/i,
  'plasma-exchange': /\b(plasma exchange|plasmapheresis|plasma dilution)\b/i,
  'stem-cells': /\b(stem cell|progenitor cell)\b/i,
  'gene-therapy': /\b(gene therap|genome edit|CRISPR)\b/i,
  'genomic-instability': /\b(genomic instability|DNA damage|DNA repair)\b/i,
  'telomeres-telomerase': /\b(telomere|telomerase)\b/i,
  'epigenetic-alterations': /\b(epigenetic alteration|chromatin|histone|DNA methylation)\b/i,
  proteostasis: /\b(proteostasis|protein homeostasis|protein aggregation)\b/i,
  autophagy: /\b(autophagy|macroautophagy|lysosomal)\b/i,
  'nutrient-sensing': /\b(nutrient sensing|AMPK|IGF-?1|insulin signal)\b/i,
  'mitochondrial-function': /\b(mitochondrial dysfunction|mitochondrial function|mitophagy)\b/i,
  'intercellular-communication': /\b(intercellular communication|cell-cell communication|extracellular vesicle)\b/i,
  'chronic-inflammation': /\b(inflammaging|inflammageing|chronic inflammation)\b/i,
  'microbiome-dysbiosis': /\b(microbiome|dysbiosis|gut microbiota)\b/i,
  'nad-metabolism': /\b(NAD\+|NAD metabolism|nicotinamide riboside|nicotinamide mononucleotide|NMN)\b/i,
  sirtuins: /\b(sirtuin|SIRT1|SIRT3|SIRT6)\b/i,
  spermidine: /\bspermidine\b/i,
  'urolithin-a': /\burolithin[ -]?A\b/i,
  taurine: /\btaurine\b/i,
  'glycine-glynac': /\b(glycine|GlyNAC|glycine N-acetylcysteine)\b/i,
  'alpha-ketoglutarate': /\b(alpha[ -]ketoglutarate|AKG)\b/i,
  acarbose: /\bacarbose\b/i,
  canagliflozin: /\b(canagliflozin|SGLT-?2 inhibitor)\b/i,
  '17alpha-estradiol': /\b(17alpha-estradiol|17-alpha estradiol|17α-estradiol)\b/i,
  'ketogenic-diets': /\b(ketogenic diet|ketosis|ketone bod)\b/i,
  'protein-restriction': /\b(protein restriction|methionine restriction|amino acid restriction|BCAA restriction)\b/i,
  'young-blood-parabiosis': /\b(parabiosis|young blood|young plasma|circulating factor)\b/i,
  'heat-cold-hormesis': /\b(hormesis|sauna|heat exposure|cold exposure|heat shock protein)\b/i,
  frailty: /\b(frailty|frailty index)\b/i,
  sarcopenia: /\b(sarcopenia|muscle aging|muscle ageing)\b/i,
  'cognitive-aging': /\b(cognitive aging|cognitive ageing|brain aging|brain ageing)\b/i,
  'cardiovascular-aging': /\b(cardiovascular aging|cardiovascular ageing|vascular aging|vascular ageing|arterial stiffness)\b/i,
  'immune-aging': /\b(immunosenescence|immune aging|immune ageing|immune resilience)\b/i,
  'ovarian-aging': /\b(ovarian aging|ovarian ageing|reproductive longevity|ovarian reserve)\b/i,
  'longevity-genetics': /\b(longevity gene|longevity genetics|exceptional longevity|lifespan genetics)\b/i,
  'centenarian-biology': /\b(centenarian|supercentenarian|exceptional longevity)\b/i,
  'biological-age-biomarkers': /\b(biological age|aging biomarker|ageing biomarker|pace of aging|pace of ageing)\b/i,
  'proteomic-aging': /\b(proteomic aging|proteomic ageing|proteomic clock|protein aging signature)\b/i,
  'metabolomic-aging': /\b(metabolomic aging|metabolomic ageing|metabolomic clock|metabolic age)\b/i,
  'transcriptomic-aging': /\b(transcriptomic aging|transcriptomic ageing|transcriptomic clock|gene expression age)\b/i,
  'single-cell-aging': /\b(single-cell aging|single cell aging|single-cell ageing|single cell ageing)\b/i,
  'multi-omics-aging': /\b(multi-omics aging|multiomics aging|multi-omics ageing|multiomic ageing)\b/i,
  'rna-splicing-aging': /\b(RNA splicing|alternative splicing|spliceosome)\b/i,
  'clonal-hematopoiesis': /\b(clonal hematopoiesis|clonal haematopoiesis|CHIP)\b/i,
  'extracellular-matrix-aging': /\b(extracellular matrix|mechanobiology|tissue stiffness|fibrosis)\b/i,
  'glycation-ages': /\b(advanced glycation end product|glycation|AGE crosslink)\b/i,
  'oxidative-stress': /\b(oxidative stress|redox homeostasis|reactive oxygen species)\b/i,
  'ferroptosis-aging': /\b(ferroptosis|iron-dependent cell death)\b/i,
  'cell-competition': /\b(cell competition|fitness selection)\b/i,
  'senescence-sasp': /\b(SASP|senescence-associated secretory phenotype|senomorphic)\b/i,
  'thymic-aging': /\b(thymic aging|thymic ageing|thymic involution|thymic regeneration)\b/i,
  'hematopoietic-stem-cell-aging': /\b(hematopoietic stem cell aging|haematopoietic stem cell ageing|aged hematopoietic stem cell)\b/i,
  neuroinflammation: /\bneuroinflammation\b/i,
  'blood-brain-barrier-aging': /\b(blood-brain barrier|neurovascular)\b/i,
  'glymphatic-clearance': /\b(glymphatic|brain waste clearance)\b/i,
  'kidney-aging': /\b(kidney aging|kidney ageing|renal aging|renal ageing)\b/i,
  'liver-aging': /\b(liver aging|liver ageing|hepatic aging|hepatic ageing)\b/i,
  'lung-aging': /\b(lung aging|lung ageing|pulmonary aging|pulmonary ageing)\b/i,
  'skin-aging': /\b(skin aging|skin ageing|photoaging|photoageing)\b/i,
  'bone-aging': /\b(bone aging|bone ageing|osteoporosis|skeletal aging)\b/i,
  'joint-cartilage-aging': /\b(cartilage aging|cartilage ageing|osteoarthritis|joint aging)\b/i,
  'vision-aging': /\b(vision aging|vision ageing|retinal aging|ocular aging|age-related macular degeneration)\b/i,
  'hearing-aging': /\b(age-related hearing loss|presbycusis|hearing aging|hearing ageing)\b/i,
  'oral-health-aging': /\b(oral health|periodontitis|edentulism)\b/i,
  'cancer-and-aging': /\b(cancer|tumor|tumour)\b/i,
  multimorbidity: /\b(multimorbidity|multiple chronic conditions)\b/i,
  'physiological-resilience': /\b(physiological resilience|physical resilience|recovery resilience)\b/i,
  'circadian-rhythms': /\b(circadian rhythm|chronobiology|circadian clock)\b/i,
  'time-restricted-eating': /\b(time-restricted eating|time restricted feeding|early time-restricted)\b/i,
  'mediterranean-diet': /\b(Mediterranean diet|Mediterranean dietary pattern)\b/i,
  'resistance-training': /\b(resistance training|strength training)\b/i,
  'aerobic-fitness': /\b(cardiorespiratory fitness|aerobic fitness|VO2 max|VO2max)\b/i,
  'digital-biomarkers': /\b(digital biomarker|wearable|passive sensing)\b/i,
  'regenerative-medicine': /\b(regenerative medicine|tissue engineering|organoid|biomaterial)\b/i,
}

async function allResearchDois(supabase: any): Promise<any[]> {
  const rows: any[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase.from('research_items').select('id,doi,title,publication_state').not('doi', 'is', null).order('id').range(offset, offset + pageSize - 1)
    if (result.error) throw result.error
    rows.push(...(result.data ?? []))
    if ((result.data ?? []).length < pageSize) return rows
  }
}

async function syncCrossref(supabase: any, job: Job): Promise<SyncOutcome> {
  const from = job.sync_mode === 'history' ? HISTORY_START : new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)
  const url = new URL('https://api.crossref.org/works')
  url.searchParams.set('filter', `update-type:retraction,from-update-date:${from}`)
  url.searchParams.set('rows', '1000')
  url.searchParams.set('sort', 'updated')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('mailto', 'research@immortal.life')
  url.searchParams.set('cursor', typeof job.cursor_state?.cursor === 'string' && job.cursor_state.cursor ? String(job.cursor_state.cursor) : '*')
  const payload = await fetchJson(url)
  const notices = Array.isArray(payload?.message?.items) ? payload.message.items : []
  const localItems = await allResearchDois(supabase)
  const localByDoi = new Map(localItems.map((item: any) => [String(item.doi).toLowerCase(), item]))
  const events: any[] = []
  for (const notice of notices) {
    const relations = Array.isArray(notice?.['update-to']) ? notice['update-to'] : []
    for (const relation of relations) {
      const originalDoi = cleanText(relation?.DOI, 240).toLowerCase()
      const local = localByDoi.get(originalDoi)
      if (!local) continue
      const noticeDoi = cleanText(notice?.DOI, 240)
      const title = cleanText(Array.isArray(notice?.title) ? notice.title[0] : notice?.title, 500) || `Retraction notice for ${local.title}`
      events.push({
        source_id: 'crossref',
        external_id: `${noticeDoi || await stableId(title)}:${local.id}`,
        research_item_id: local.id,
        event_type: 'retraction',
        title,
        summary: 'Crossref identifies a retraction update linked to this indexed research record. Follow the publisher record for the authoritative notice.',
        source_url: noticeDoi ? `https://doi.org/${encodeURIComponent(noticeDoi)}` : `https://api.crossref.org/works/${encodeURIComponent(originalDoi)}`,
        announced_on: dateOnly(notice?.created?.['date-time'] ?? notice?.issued?.['date-parts']?.[0]?.join('-')),
        metadata: { notice_doi: noticeDoi || null, original_doi: originalDoi, source: 'Crossref REST API / Retraction Watch metadata' },
        relevance_confidence: 100,
        source_quality_score: sourceQualityScore('crossref'),
        freshness_score: freshnessScore(dateOnly(notice?.created?.['date-time'] ?? notice?.issued?.['date-parts']?.[0]?.join('-'))),
        publication_state: local.publication_state === 'published' ? 'published' : 'quarantined',
        match_explanation: 'Published automatically because Crossref supplied a retraction relationship to an indexed research record.',
        quality_checked_at: new Date().toISOString(),
      })
      await supabase.from('research_items').update({ status: 'retracted', integrity_checked_at: new Date().toISOString() }).eq('id', local.id)
    }
  }
  if (events.length) {
    const { error } = await supabase.from('research_integrity_events').upsert(events, { onConflict: 'source_id,external_id', defaultToNull: false })
    if (error) throw error
  }
  await supabase.from('research_items').update({ integrity_checked_at: new Date().toISOString() }).not('doi', 'is', null)
  const currentCursor = typeof job.cursor_state?.cursor === 'string' ? String(job.cursor_state.cursor) : '*'
  const cursor = cleanText(payload?.message?.['next-cursor'], 8000)
  const done = notices.length === 0 || !cursor || cursor === currentCursor
  return { seen: notices.length, written: events.length, done, cursorState: done ? {} : { cursor }, totalAvailable: Number(payload?.message?.['total-results'] ?? 0) || null }
}

async function syncRegulatoryFeed(supabase: any, sourceId: RegulatorySourceId): Promise<{ seen: number; written: number }> {
  const source = REGULATORY_FEEDS[sourceId]
  const xml = await fetchText(new URL(source.url))
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []
  const records: any[] = []
  for (const block of blocks) {
    const title = xmlText(block, 'title')
    let link = xmlText(block, 'link')
    if (!link) link = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? ''
    if (!title || !/^https?:\/\//i.test(link)) continue
    const rawSummary = xmlText(block, 'description') || xmlText(block, 'summary') || xmlText(block, 'content')
    const publishedRaw = xmlText(block, 'pubDate') || xmlText(block, 'published') || xmlText(block, 'updated')
    const parsedDate = new Date(publishedRaw)
    const haystack = `${title} ${rawSummary}`
    const candidateTopics = Object.entries(TOPIC_KEYWORDS).filter(([, pattern]) => pattern.test(haystack)).map(([slug]) => slug)
    const assessments = candidateTopics.map((slug) => ({ slug, assessment: assessTopicMatch(slug, {
      title,
      abstract: rawSummary,
      sourceId,
      sourceDate: Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString(),
      studyType: 'Official regulatory notice',
    }) }))
    const matchedTopics = assessments.filter((item) => item.assessment.publish).map((item) => item.slug)
    const best = assessments.sort((left, right) => right.assessment.relevanceScore - left.assessment.relevanceScore)[0]?.assessment
    const confidence = best?.relevanceScore ?? 0
    records.push({
      source_id: sourceId,
      external_id: await stableId(link),
      jurisdiction: source.jurisdiction,
      category: matchedTopics.length ? 'Monitored-topic update' : 'Regulatory update',
      title,
      summary: rawSummary || `Official update published by ${source.name}. Open the source record for full context.`,
      published_at: Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString(),
      source_url: link,
      matched_topics: matchedTopics,
      last_seen_at: new Date().toISOString(),
      metadata: { source_language: source.language, official_source: source.name },
      relevance_confidence: confidence,
      source_quality_score: sourceQualityScore(sourceId),
      freshness_score: freshnessScore(Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString()),
      publication_state: matchedTopics.length ? 'published' : 'quarantined',
      match_explanation: best?.explanation ?? 'Quarantined automatically because no controlled longevity topic term matched this official notice.',
      quality_checked_at: new Date().toISOString(),
      duplicate_cluster_key: duplicateClusterKey(title, link),
    })
  }
  if (!records.length) return { seen: blocks.length, written: 0 }
  const { error } = await supabase.from('regulatory_events').upsert(records, { onConflict: 'source_id,external_id', defaultToNull: false })
  if (error) throw error
  return { seen: blocks.length, written: records.length }
}

function sourceDateWindow(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

type DateRange = { from: string; to: string }

function splitDateRange(range: DateRange): [DateRange, DateRange] | null {
  const from = new Date(`${range.from}T00:00:00Z`)
  const to = new Date(`${range.to}T00:00:00Z`)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) return null
  const middle = new Date(from.getTime() + Math.floor((to.getTime() - from.getTime()) / 2))
  const laterFrom = new Date(middle.getTime() + 86400000)
  return [
    { from: range.from, to: middle.toISOString().slice(0, 10) },
    { from: laterFrom.toISOString().slice(0, 10), to: range.to },
  ]
}

function initialPubMedState(job: Job): { ranges: DateRange[]; current: DateRange | null; offset: number } {
  const existing = job.cursor_state ?? {}
  const ranges = Array.isArray(existing.ranges)
    ? existing.ranges.filter((range: any) => /^\d{4}-\d{2}-\d{2}$/.test(range?.from) && /^\d{4}-\d{2}-\d{2}$/.test(range?.to))
    : []
  const current = existing.current && typeof existing.current === 'object'
    ? existing.current as DateRange
    : null
  const offset = Math.max(0, Math.trunc(Number(existing.offset ?? 0)))
  if (current || ranges.length) return { ranges, current, offset }
  const to = job.sync_mode === 'history'
    ? new Date().toISOString().slice(0, 10)
    : new Date(new Date(job.window_start).getTime() + SIX_HOURS_MS).toISOString().slice(0, 10)
  const from = job.sync_mode === 'history'
    ? HISTORY_START
    : new Date(new Date(job.window_start).getTime() - 14 * 86400000).toISOString().slice(0, 10)
  return { ranges: [{ from, to }], current: null, offset: 0 }
}

function pubmedPublicationDate(block: string): string | null {
  const articleDate = block.match(/<ArticleDate[^>]*>([\s\S]*?)<\/ArticleDate>/i)?.[1]
  const pubDate = articleDate || block.match(/<PubDate[^>]*>([\s\S]*?)<\/PubDate>/i)?.[1] || ''
  const year = xmlText(pubDate, 'Year')
  if (!year) return null
  const monthValue = xmlText(pubDate, 'Month')
  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  const month = /^\d{1,2}$/.test(monthValue)
    ? monthValue.padStart(2, '0')
    : monthNames[monthValue.slice(0, 3).toLowerCase()] ?? '01'
  const dayValue = xmlText(pubDate, 'Day')
  return dateOnly(`${year}-${month}-${/^\d{1,2}$/.test(dayValue) ? dayValue.padStart(2, '0') : '01'}`)
}

async function syncPubMed(supabase: any, topic: Topic, job: Job): Promise<SyncOutcome> {
  const state = initialPubMedState(job)
  const range = state.current ?? state.ranges.pop()
  if (!range) return { seen: 0, written: 0, done: true, cursorState: {} }
  const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi')
  searchUrl.searchParams.set('db', 'pubmed')
  searchUrl.searchParams.set('term', topic.literature_query)
  searchUrl.searchParams.set('datetype', job.sync_mode === 'history' ? 'pdat' : 'edat')
  searchUrl.searchParams.set('mindate', range.from.replaceAll('-', '/'))
  searchUrl.searchParams.set('maxdate', range.to.replaceAll('-', '/'))
  searchUrl.searchParams.set('retstart', String(state.offset))
  searchUrl.searchParams.set('retmax', String(PUBMED_PAGE_SIZE))
  searchUrl.searchParams.set('sort', 'pub_date')
  searchUrl.searchParams.set('retmode', 'json')
  searchUrl.searchParams.set('tool', 'immortal_life')
  searchUrl.searchParams.set('email', 'research@immortal.life')
  const apiKey = Deno.env.get('NCBI_API_KEY')?.trim()
  if (apiKey) searchUrl.searchParams.set('api_key', apiKey)

  await throttleNcbi()
  const searchPayload = await fetchJson(searchUrl)
  const total = Math.max(0, Math.trunc(Number(searchPayload?.esearchresult?.count ?? 0)))
  if (total > 9999 && state.offset === 0) {
    const split = splitDateRange(range)
    if (!split) throw new Error(`PubMed result partition exceeds 9,999 records for ${range.from}`)
    // Stack order makes the newer half run first while preserving the older half.
    state.ranges.push(split[0], split[1])
    return { seen: 0, written: 0, done: false, cursorState: { ranges: state.ranges, current: null, offset: 0 }, totalAvailable: total }
  }
  const ids = uniqueStrings(searchPayload?.esearchresult?.idlist, PUBMED_PAGE_SIZE)
  if (!ids.length) {
    const done = state.ranges.length === 0
    return { seen: 0, written: 0, done, cursorState: done ? {} : { ranges: state.ranges, current: null, offset: 0 }, totalAvailable: total }
  }

  const fetchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi')
  fetchUrl.searchParams.set('db', 'pubmed')
  fetchUrl.searchParams.set('id', ids.join(','))
  fetchUrl.searchParams.set('rettype', 'abstract')
  fetchUrl.searchParams.set('retmode', 'xml')
  fetchUrl.searchParams.set('tool', 'immortal_life')
  fetchUrl.searchParams.set('email', 'research@immortal.life')
  if (apiKey) fetchUrl.searchParams.set('api_key', apiKey)
  await throttleNcbi()
  const xml = await fetchText(fetchUrl)
  const articles = xml.match(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/gi) ?? []
  const now = new Date().toISOString()
  const assessments = new Map<string, ReturnType<typeof assessTopicMatch>>()
  const records = articles.map((article) => {
    const externalId = xmlText(article, 'PMID')
    const title = xmlText(article, 'ArticleTitle')
    if (!externalId || !title) return null
    const abstractText = xmlTexts(article, 'AbstractText', 20).join(' ') || null
    const publicationTypes = xmlTexts(article, 'PublicationType', 20)
    const meshTerms = xmlTexts(article, 'DescriptorName', 60)
    const keywordTerms = xmlTexts(article, 'Keyword', 30)
    const controlledTerms = uniqueStrings([...meshTerms, ...keywordTerms], 80)
    const publicationType = publicationTypes.join('; ')
    const publishedOn = pubmedPublicationDate(article)
    const doi = cleanText(article.match(/<ArticleId[^>]+IdType=["']doi["'][^>]*>([\s\S]*?)<\/ArticleId>/i)?.[1], 240) || null
    const authors = [...article.matchAll(/<Author\b[^>]*>([\s\S]*?)<\/Author>/gi)].map((match) => {
      const collective = xmlText(match[1], 'CollectiveName')
      if (collective) return collective
      return [xmlText(match[1], 'ForeName'), xmlText(match[1], 'LastName')].filter(Boolean).join(' ')
    }).filter(Boolean).slice(0, 30).join(', ') || null
    const journal = xmlText(article, 'Title') || null
    const status = publicationTypes.some((value) => /retracted publication/i.test(value)) ? 'retracted' : 'published'
    const level = classifyEvidence(publicationType, title, 'pubmed')
    const assessment = assessTopicMatch(topic.slug, {
      title,
      abstract: abstractText,
      controlledTerms,
      studyType: publicationType,
      sourceId: 'pubmed',
      sourceDate: publishedOn,
    })
    assessments.set(externalId, assessment)
    return {
      source_id: 'pubmed',
      external_id: externalId,
      title,
      authors,
      journal,
      published_on: publishedOn,
      doi,
      publication_type: publicationType || null,
      abstract_text: abstractText,
      controlled_terms: controlledTerms,
      evidence_level: level,
      source_url: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(externalId)}/`,
      is_open_access: null,
      cited_by_count: null,
      editorial_summary: researchEditorialSummary(level, journal),
      source_updated_at: now,
      last_seen_at: now,
      status,
      relevance_confidence: assessment.relevanceScore,
      source_quality_score: assessment.sourceQualityScore,
      freshness_score: assessment.freshnessScore,
      publication_state: assessment.publish ? 'published' : 'quarantined',
      match_explanation: assessment.explanation,
      quality_checked_at: now,
      duplicate_cluster_key: duplicateClusterKey(title, doi),
      metadata: { pmid: externalId, mesh_terms: meshTerms, source: 'NCBI PubMed E-utilities' },
    }
  }).filter(Boolean)

  if (!records.length) {
    const nextOffset = state.offset + ids.length
    const rangeDone = nextOffset >= total
    const done = rangeDone && state.ranges.length === 0
    return { seen: articles.length, written: 0, done, cursorState: done ? {} : { ranges: state.ranges, current: rangeDone ? null : range, offset: rangeDone ? 0 : nextOffset }, totalAvailable: total }
  }
  const { data, error } = await supabase
    .from('research_items')
    .upsert(records, { onConflict: 'source_id,external_id', defaultToNull: false })
    .select('id,external_id')
  if (error) throw error
  const topicLinks = (data ?? []).map((record: { id: number; external_id: string }) => {
    const assessment = assessments.get(record.external_id) ?? assessTopicMatch(topic.slug, { title: '', sourceId: 'pubmed' })
    return {
      research_item_id: record.id,
      topic_slug: topic.slug,
      matched_by: 'source-query',
      relevance_score: assessment.relevanceScore,
      match_reasons: assessment.reasons,
      matched_fields: assessment.matchedFields,
      is_published: assessment.publish,
      evaluated_at: now,
    }
  })
  if (topicLinks.length) {
    const { error: linkError } = await supabase.from('research_item_topics')
      .upsert(topicLinks, { onConflict: 'research_item_id,topic_slug', defaultToNull: false })
    if (linkError) throw linkError
    const { error: qualityError } = await supabase.rpc('refresh_research_quality', { record_ids: topicLinks.map((link) => link.research_item_id) })
    if (qualityError) throw qualityError
  }
  const nextOffset = state.offset + ids.length
  const rangeDone = nextOffset >= total
  const done = rangeDone && state.ranges.length === 0
  return {
    seen: articles.length,
    written: records.length,
    done,
    cursorState: done ? {} : { ranges: state.ranges, current: rangeDone ? null : range, offset: rangeDone ? 0 : nextOffset },
    totalAvailable: total,
  }
}

async function syncEuropePmc(supabase: any, topic: Topic, job: Job): Promise<SyncOutcome> {
  const cursor = typeof job.cursor_state?.cursor === 'string' ? String(job.cursor_state.cursor) : '*'
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search')
  const incrementalWindow = sourceDateWindow(31)
  const query = job.sync_mode === 'history'
    ? `(${topic.literature_query}) sort_date:y`
    : `(${topic.literature_query}) AND (FIRST_PDATE:[${incrementalWindow.from} TO ${incrementalWindow.to}] OR FIRST_INDEX_DATE:[${incrementalWindow.from} TO ${incrementalWindow.to}]) sort_date:y`
  url.searchParams.set('query', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('resultType', 'core')
  url.searchParams.set('pageSize', String(EUROPE_PMC_PAGE_SIZE))
  url.searchParams.set('cursorMark', cursor)

  const payload = await fetchJson(url)
  const results = Array.isArray(payload?.resultList?.result) ? payload.resultList.result : []
  const now = new Date().toISOString()
  const assessments = new Map<string, ReturnType<typeof assessTopicMatch>>()
  const records = results
    .map((item: any) => {
      const externalId = cleanText(item?.id ?? item?.pmid ?? item?.pmcid, 120)
      const title = cleanText(item?.title, 500)
      if (!externalId || !title) return null
      const publicationType = cleanText(item?.pubType, 180)
      const level = classifyEvidence(publicationType, title, item?.source)
      const source = cleanText(item?.source, 20) || 'MED'
      const doi = cleanText(item?.doi, 240) || null
      const status = /(retraction of publication|retracted publication)/i.test(publicationType)
        ? 'retracted'
        : 'published'
      const abstractText = cleanText(item?.abstractText, 5000) || null
      const meshTerms = Array.isArray(item?.meshHeadingList?.meshHeading)
        ? item.meshHeadingList.meshHeading.flatMap((heading: any) => [heading?.descriptorName, ...(Array.isArray(heading?.qualifierName) ? heading.qualifierName : [])])
        : []
      const keywordTerms = Array.isArray(item?.keywordList?.keyword) ? item.keywordList.keyword : []
      const controlledTerms = uniqueStrings([...meshTerms, ...keywordTerms], 80)
      const assessment = assessTopicMatch(topic.slug, {
        title,
        abstract: abstractText,
        controlledTerms,
        studyType: publicationType,
        sourceId: 'europe-pmc',
        sourceDate: dateOnly(item?.firstPublicationDate ?? item?.electronicPublicationDate ?? item?.pubYear),
      })
      assessments.set(externalId, assessment)

      return {
        source_id: 'europe-pmc',
        external_id: externalId,
        title,
        authors: cleanText(item?.authorString, 600) || null,
        journal: cleanText(item?.journalTitle, 240) || null,
        published_on: dateOnly(item?.firstPublicationDate ?? item?.electronicPublicationDate ?? item?.pubYear),
        doi,
        publication_type: publicationType || null,
        abstract_text: abstractText,
        controlled_terms: controlledTerms,
        evidence_level: level,
        source_url: `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`,
        is_open_access: typeof item?.isOpenAccess === 'string'
          ? item.isOpenAccess === 'Y'
          : typeof item?.isOpenAccess === 'boolean' ? item.isOpenAccess : null,
        cited_by_count: item?.citedByCount != null && Number.isSafeInteger(Number(item.citedByCount))
          ? Number(item.citedByCount)
          : null,
        editorial_summary: researchEditorialSummary(level, item?.journalTitle),
        source_updated_at: now,
        last_seen_at: now,
        status,
        relevance_confidence: assessment.relevanceScore,
        source_quality_score: assessment.sourceQualityScore,
        freshness_score: assessment.freshnessScore,
        publication_state: assessment.publish ? 'published' : 'quarantined',
        match_explanation: assessment.explanation,
        quality_checked_at: now,
        duplicate_cluster_key: duplicateClusterKey(title, doi),
        metadata: {
          pmid: cleanText(item?.pmid, 40) || null,
          pmcid: cleanText(item?.pmcid, 40) || null,
          source,
          has_references: item?.hasReferences === 'Y',
        },
      }
    })
    .filter(Boolean)

  const nextCursor = cleanText(payload?.nextCursorMark, 2000)
  const total = Math.max(0, Math.trunc(Number(payload?.hitCount ?? 0)))
  const done = results.length === 0 || !nextCursor || nextCursor === cursor
  if (!records.length) return { seen: results.length, written: 0, done, cursorState: done ? {} : { cursor: nextCursor }, totalAvailable: total }
  const { data, error } = await supabase
    .from('research_items')
    .upsert(records, { onConflict: 'source_id,external_id', defaultToNull: false })
    .select('id,external_id')
  if (error) throw error

  const topicLinks = (data ?? []).map((record: { id: number; external_id: string }) => {
    const assessment = assessments.get(record.external_id) ?? assessTopicMatch(topic.slug, { title: '', sourceId: 'europe-pmc' })
    return {
      research_item_id: record.id,
      topic_slug: topic.slug,
      matched_by: 'source-query',
      relevance_score: assessment.relevanceScore,
      match_reasons: assessment.reasons,
      matched_fields: assessment.matchedFields,
      is_published: assessment.publish,
      evaluated_at: now,
    }
  })
  if (topicLinks.length) {
    const { error: linkError } = await supabase
      .from('research_item_topics')
      .upsert(topicLinks, { onConflict: 'research_item_id,topic_slug', defaultToNull: false })
    if (linkError) throw linkError
    const { error: qualityError } = await supabase.rpc('refresh_research_quality', { record_ids: topicLinks.map((link) => link.research_item_id) })
    if (qualityError) throw qualityError
  }
  return { seen: results.length, written: records.length, done, cursorState: done ? {} : { cursor: nextCursor }, totalAvailable: total }
}

function trialDate(value: any): string | null {
  return dateOnly(value?.date ?? value)
}

async function syncClinicalTrials(supabase: any, topic: Topic, job: Job): Promise<SyncOutcome> {
  const url = new URL('https://clinicaltrials.gov/api/v2/studies')
  url.searchParams.set('query.term', topic.trials_query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('pageSize', String(CLINICAL_TRIALS_PAGE_SIZE))
  url.searchParams.set('sort', 'LastUpdatePostDate:desc')
  if (typeof job.cursor_state?.pageToken === 'string' && job.cursor_state.pageToken) {
    url.searchParams.set('pageToken', String(job.cursor_state.pageToken))
  }

  const payload = await fetchJson(url)
  const studies = Array.isArray(payload?.studies) ? payload.studies : []
  const now = new Date().toISOString()
  const assessments = new Map<string, ReturnType<typeof assessTopicMatch>>()
  const records = studies
    .map((study: any) => {
      const protocol = study?.protocolSection ?? {}
      const identification = protocol?.identificationModule ?? {}
      const statusModule = protocol?.statusModule ?? {}
      const design = protocol?.designModule ?? {}
      const sponsors = protocol?.sponsorCollaboratorsModule ?? {}
      const locations = protocol?.contactsLocationsModule?.locations ?? []
      const description = protocol?.descriptionModule ?? {}
      const externalId = cleanText(identification?.nctId, 40)
      const title = cleanText(identification?.briefTitle ?? identification?.officialTitle, 500)
      if (!externalId || !title) return null
      const phases = uniqueStrings(design?.phases, 8).filter((phase) => phase !== 'NA')
      const rawStatus = cleanText(statusModule?.overallStatus, 80)
      const countries = uniqueStrings(locations.map((location: any) => location?.country), 40)
      const enrollment = Number(design?.enrollmentInfo?.count)
      const briefSummary = cleanText(description?.briefSummary, 3000) || null
      const conditions = uniqueStrings(protocol?.conditionsModule?.conditions, 40)
      const interventions = uniqueStrings((protocol?.armsInterventionsModule?.interventions ?? []).map((item: any) => item?.name), 40)
      const controlledTerms = uniqueStrings([...conditions, ...interventions], 80)
      const studyType = cleanText(design?.studyType, 100).replace(/_/g, ' ') || null
      const lastUpdateDate = trialDate(statusModule?.lastUpdatePostDateStruct ?? statusModule?.studyFirstPostDateStruct)
      const assessment = assessTopicMatch(topic.slug, {
        title,
        abstract: briefSummary,
        controlledTerms,
        studyType,
        sourceId: 'clinicaltrials-gov',
        sourceDate: lastUpdateDate,
      })
      assessments.set(externalId, assessment)

      return {
        source_id: 'clinicaltrials-gov',
        external_id: externalId,
        title,
        brief_summary: briefSummary,
        overall_status: normalizeTrialStatus(rawStatus),
        phases,
        study_type: studyType,
        controlled_terms: controlledTerms,
        sponsor: cleanText(sponsors?.leadSponsor?.name, 240) || null,
        enrollment: Number.isSafeInteger(enrollment) && enrollment >= 0 ? enrollment : null,
        countries,
        start_date: trialDate(statusModule?.startDateStruct),
        completion_date: trialDate(statusModule?.completionDateStruct),
        last_update_date: lastUpdateDate,
        source_url: `https://clinicaltrials.gov/study/${encodeURIComponent(externalId)}`,
        editorial_summary: trialEditorialSummary(rawStatus, phases),
        last_seen_at: now,
        relevance_confidence: assessment.relevanceScore,
        source_quality_score: assessment.sourceQualityScore,
        freshness_score: assessment.freshnessScore,
        publication_state: assessment.publish ? 'published' : 'quarantined',
        match_explanation: assessment.explanation,
        quality_checked_at: now,
        duplicate_cluster_key: duplicateClusterKey(title, externalId),
        metadata: {
          acronym: cleanText(identification?.acronym, 80) || null,
          organization: cleanText(identification?.organization?.fullName, 240) || null,
          source_has_results: Boolean(study?.hasResults),
        },
      }
    })
    .filter(Boolean)

  const nextPageToken = cleanText(payload?.nextPageToken, 4000)
  const total = Number.isFinite(Number(payload?.totalCount)) ? Math.max(0, Math.trunc(Number(payload.totalCount))) : null
  const incrementalFloor = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10)
  const oldestUpdate = records.map((record: any) => record?.last_update_date).filter(Boolean).sort()[0] ?? null
  const reachedIncrementalFloor = job.sync_mode === 'incremental' && oldestUpdate && oldestUpdate < incrementalFloor
  const done = !nextPageToken || studies.length === 0 || Boolean(reachedIncrementalFloor)
  if (!records.length) return { seen: studies.length, written: 0, done, cursorState: done ? {} : { pageToken: nextPageToken }, totalAvailable: total }
  const { data, error } = await supabase
    .from('clinical_trials')
    .upsert(records, { onConflict: 'source_id,external_id', defaultToNull: false })
    .select('id,external_id')
  if (error) throw error

  const topicLinks = (data ?? []).map((record: { id: number; external_id: string }) => {
    const assessment = assessments.get(record.external_id) ?? assessTopicMatch(topic.slug, { title: '', sourceId: 'clinicaltrials-gov' })
    return {
      clinical_trial_id: record.id,
      topic_slug: topic.slug,
      matched_by: 'source-query',
      relevance_score: assessment.relevanceScore,
      match_reasons: assessment.reasons,
      matched_fields: assessment.matchedFields,
      is_published: assessment.publish,
      evaluated_at: now,
    }
  })
  if (topicLinks.length) {
    const { error: linkError } = await supabase
      .from('clinical_trial_topics')
      .upsert(topicLinks, { onConflict: 'clinical_trial_id,topic_slug', defaultToNull: false })
    if (linkError) throw linkError
    const { error: qualityError } = await supabase.rpc('refresh_trial_quality', { record_ids: topicLinks.map((link) => link.clinical_trial_id) })
    if (qualityError) throw qualityError
  }
  return { seen: studies.length, written: records.length, done, cursorState: done ? {} : { pageToken: nextPageToken }, totalAvailable: total }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const runStartedAt = Date.now()
  if (!(await isAuthorized(req, supabase))) return jsonResponse(req, { error: 'Unauthorized' }, 401, 'POST')
  let requestedSource = 'all'
  let triggerKind = 'schedule'
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.source === 'string') requestedSource = body.source
    if (['schedule', 'manual', 'recovery'].includes(body?.trigger)) triggerKind = body.trigger
  } catch {
    // Empty bodies are valid scheduled requests.
  }

  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({ trigger_kind: triggerKind })
    .select('id')
    .single()
  if (runError) return jsonResponse(req, { error: 'Unable to create ingestion run' }, 500, 'POST')

  try {
    const { data: topics, error: topicsError } = await supabase
      .from('intelligence_topics')
      .select('slug,name,literature_query,trials_query')
      .eq('enabled', true)
      .order('sort_order')
    if (topicsError) throw topicsError

    let sourceQuery = supabase.from('content_sources').select('id').eq('enabled', true).in('id', [...GENERIC_SOURCE_IDS])
    if (requestedSource !== 'all') sourceQuery = sourceQuery.eq('id', requestedSource)
    const { data: sources, error: sourcesError } = await sourceQuery
    if (sourcesError) throw sourcesError
    if (!sources?.length) throw new Error('No enabled source matched the request')

    const slot = new Date(Math.floor(Date.now() / SIX_HOURS_MS) * SIX_HOURS_MS).toISOString()
    const queued = sources.flatMap((source: { id: string }) => {
      if (TOPIC_SOURCE_IDS.has(source.id)) {
        return (topics ?? []).map((topic: Topic) => ({ source_id: source.id, topic_slug: topic.slug, job_key: `${topic.slug}:incremental`, window_start: slot, sync_mode: 'incremental' }))
      }
      return [{ source_id: source.id, topic_slug: null, job_key: `${source.id === 'crossref' ? 'retractions' : 'official-feed'}:incremental`, window_start: slot, sync_mode: 'incremental' }]
    })
    const historical = sources.filter((source: { id: string }) => HISTORY_SOURCE_IDS.has(source.id)).flatMap((source: { id: string }) =>
      source.id === 'crossref' ? [{
        source_id: source.id,
        topic_slug: null,
        job_key: 'retractions:history',
        window_start: '1800-01-01T00:00:00.000Z',
        sync_mode: 'history',
      }] : (topics ?? []).map((topic: Topic) => ({
        source_id: source.id,
        topic_slug: topic.slug,
        job_key: `${topic.slug}:history`,
        window_start: '1800-01-01T00:00:00.000Z',
        sync_mode: 'history',
      })))
    const { error: queueError } = await supabase
      .from('ingestion_jobs')
      .upsert([...queued, ...historical], { onConflict: 'source_id,job_key,window_start', ignoreDuplicates: true })
    if (queueError) throw queueError

    const abandonedBefore = new Date(Date.now() - 45 * 60 * 1000).toISOString()
    await supabase
      .from('ingestion_jobs')
      .update({ status: 'retry', available_at: new Date().toISOString(), locked_at: null, last_error: 'Recovered abandoned job' })
      .eq('status', 'running')
      .lt('locked_at', abandonedBefore)

    const topicBySlug = new Map((topics ?? []).map((topic: Topic) => [topic.slug, topic]))
    let seen = 0
    let written = 0
    let errors = 0
    let processed = 0
    const errorSources = new Set<string>()
    const successfulSources = new Set<string>()

    while (Date.now() - runStartedAt < RUN_TIME_BUDGET_MS) {
      const { data: jobs, error: jobsError } = await supabase
        .from('ingestion_jobs')
        .select('id,source_id,topic_slug,job_key,attempts,sync_mode,cursor_state,pages_processed,items_seen,items_written,window_start')
        .in('status', ['pending', 'retry'])
        .lte('available_at', new Date().toISOString())
        .order('updated_at')
        .order('created_at')
        .limit(1)
      if (jobsError) throw jobsError
      if (!jobs?.length) break
      const job = jobs[0] as Job
      const topic = job.topic_slug ? topicBySlug.get(job.topic_slug) : null
      if (TOPIC_SOURCE_IDS.has(job.source_id) && !topic) {
        await supabase.from('ingestion_jobs').update({ status: 'dead', last_error: 'Enabled topic no longer exists', updated_at: new Date().toISOString() }).eq('id', job.id)
        continue
      }
      const attempt = job.attempts + 1
      const lockedAt = new Date().toISOString()
      const { data: locked } = await supabase
        .from('ingestion_jobs')
        .update({ status: 'running', locked_at: lockedAt, updated_at: lockedAt })
        .eq('id', job.id)
        .in('status', ['pending', 'retry'])
        .select('id')
        .maybeSingle()
      if (!locked) continue

      await supabase.from('content_sources').update({ last_attempt_at: lockedAt }).eq('id', job.source_id)
      try {
        let outcome: SyncOutcome
        if (job.source_id === 'europe-pmc') outcome = await syncEuropePmc(supabase, topic as Topic, job)
        else if (job.source_id === 'pubmed') outcome = await syncPubMed(supabase, topic as Topic, job)
        else if (job.source_id === 'clinicaltrials-gov') outcome = await syncClinicalTrials(supabase, topic as Topic, job)
        else if (job.source_id === 'crossref') outcome = await syncCrossref(supabase, job)
        else if (job.source_id in REGULATORY_FEEDS) outcome = { ...await syncRegulatoryFeed(supabase, job.source_id as RegulatorySourceId), done: true }
        else throw new Error(`Unsupported source ${job.source_id}`)
        seen += outcome.seen
        written += outcome.written
        processed += 1
        successfulSources.add(job.source_id)
        const completedAt = new Date().toISOString()
        await supabase.from('ingestion_jobs').update({
          status: outcome.done ? 'succeeded' : 'pending',
          completed_at: outcome.done ? completedAt : null,
          available_at: outcome.done ? completedAt : new Date(Date.now() + 1000).toISOString(),
          cursor_state: outcome.cursorState ?? {},
          pages_processed: Number(job.pages_processed ?? 0) + 1,
          total_available: outcome.totalAvailable ?? null,
          items_seen: Number(job.items_seen ?? 0) + outcome.seen,
          items_written: Number(job.items_written ?? 0) + outcome.written,
          attempts: 0,
          locked_at: null,
          last_error: null,
          updated_at: completedAt,
        }).eq('id', job.id)
        if (outcome.done) await supabase.from('content_sources').update({ last_success_at: completedAt, updated_at: completedAt }).eq('id', job.source_id)
      } catch (error) {
        processed += 1
        errors += 1
        errorSources.add(job.source_id)
        const message = cleanText(error instanceof Error ? error.message : String(error), 500)
        const isDead = attempt >= 5
        const retryDelayMs = Math.min(6 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.max(0, attempt - 1))
        await supabase.from('ingestion_jobs').update({
          status: isDead ? 'dead' : 'retry',
          attempts: attempt,
          available_at: new Date(Date.now() + retryDelayMs).toISOString(),
          locked_at: null,
          last_error: message,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
        const { data: sourceState } = await supabase
          .from('content_sources')
          .select('consecutive_failures')
          .eq('id', job.source_id)
          .single()
        await supabase.from('content_sources').update({
          last_error: message,
          consecutive_failures: Number(sourceState?.consecutive_failures ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', job.source_id)
      }
    }

    for (const sourceId of successfulSources) {
      if (errorSources.has(sourceId)) continue
      await supabase.from('content_sources').update({
        last_error: null,
        consecutive_failures: 0,
        updated_at: new Date().toISOString(),
      }).eq('id', sourceId)
    }

    const { error: entityRefreshError } = await supabase.rpc('refresh_intelligence_entities')
    if (entityRefreshError) throw entityRefreshError

    const finalStatus = errors === 0 ? 'succeeded' : errors < processed ? 'partial' : 'failed'
    await supabase.from('ingestion_runs').update({
      completed_at: new Date().toISOString(),
      status: finalStatus,
      jobs_processed: processed,
      items_seen: seen,
      items_written: written,
      errors,
      details: { requested_source: requestedSource, error_sources: [...errorSources] },
    }).eq('id', run.id)

    return jsonResponse(req, {
      ok: finalStatus !== 'failed',
      run_id: run.id,
      status: finalStatus,
      jobs_processed: processed,
      items_seen: seen,
      items_written: written,
      errors,
    }, finalStatus === 'failed' ? 502 : 200, 'POST')
  } catch (error) {
    const message = cleanText(error instanceof Error ? error.message : String(error), 500)
    await supabase.from('ingestion_runs').update({
      completed_at: new Date().toISOString(),
      status: 'failed',
      errors: 1,
      details: { error: message },
    }).eq('id', run.id)
    console.error('sync-intelligence error:', message)
    return jsonResponse(req, { error: 'sync_failed', run_id: run.id }, 500, 'POST')
  }
})

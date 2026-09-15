export type EvidenceLevel =
  | 'human-synthesis'
  | 'randomized-human'
  | 'human-study'
  | 'preclinical'
  | 'preprint'
  | 'research-record'

export type QualityAssessment = {
  relevanceScore: number
  sourceQualityScore: number
  freshnessScore: number
  publish: boolean
  matchedFields: string[]
  reasons: string[]
  explanation: string
}

type MatchInput = {
  title: unknown
  abstract?: unknown
  controlledTerms?: unknown
  studyType?: unknown
  sourceId: string
  sourceDate?: unknown
}

const TOPIC_TERMS: Record<string, { anchors: string[]; requiresAgeingContext?: boolean }> = {
  rapamycin: { anchors: ['rapamycin', 'sirolimus', 'everolimus', 'rapalog', 'mtor inhibitor'] },
  senolytics: { anchors: ['senolytic', 'senomorphic', 'cellular senescence', 'senescent cell'] },
  'partial-reprogramming': { anchors: ['partial reprogramming', 'epigenetic reprogramming', 'yamanaka factor', 'oskm'] },
  metformin: { anchors: ['metformin'] },
  'glp-1-therapies': { anchors: ['glp-1', 'glp1', 'semaglutide', 'tirzepatide', 'liraglutide'], requiresAgeingContext: true },
  exercise: { anchors: ['exercise', 'physical activity', 'cardiorespiratory fitness'], requiresAgeingContext: true },
  'caloric-restriction': { anchors: ['caloric restriction', 'calorie restriction', 'intermittent fasting', 'time-restricted eating'], requiresAgeingContext: true },
  sleep: { anchors: ['sleep', 'circadian'], requiresAgeingContext: true },
  'epigenetic-clocks': { anchors: ['epigenetic clock', 'dna methylation age', 'biological age clock', 'phenoage', 'grim age', 'grimage'] },
  'plasma-exchange': { anchors: ['plasma exchange', 'plasmapheresis', 'plasma dilution'], requiresAgeingContext: true },
  'stem-cells': { anchors: ['stem cell', 'progenitor cell'], requiresAgeingContext: true },
  'gene-therapy': { anchors: ['gene therapy', 'gene transfer', 'genome editing', 'crispr'], requiresAgeingContext: true },
}

const AGEING_TERMS = [
  'aging', 'ageing', 'longevity', 'lifespan', 'healthspan', 'rejuvenation', 'senescence',
  'frailty', 'biological age', 'age-related', 'age associated', 'geroscience',
]

function normaliseForMatch(value: unknown): string {
  return cleanText(value, 5000)
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsAny(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term))
}

export function sourceQualityScore(sourceId: string): number {
  const scores: Record<string, number> = {
    'clinicaltrials-gov': 100,
    ema: 100,
    sukl: 100,
    crossref: 95,
    'europe-pmc': 90,
  }
  return scores[sourceId] ?? 70
}

export function freshnessScore(value: unknown, now = new Date()): number {
  const date = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : null
  if (!date || Number.isNaN(date.getTime())) return 45
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / 86400000)
  if (ageDays <= 180) return 100
  if (ageDays <= 365) return 85
  if (ageDays <= 1095) return 65
  if (ageDays <= 3650) return 50
  return 35
}

export function assessTopicMatch(topicSlug: string, input: MatchInput): QualityAssessment {
  const definition = TOPIC_TERMS[topicSlug]
  const title = normaliseForMatch(input.title)
  const abstract = normaliseForMatch(input.abstract)
  const controlled = normaliseForMatch(Array.isArray(input.controlledTerms) ? input.controlledTerms.join(' ') : input.controlledTerms)
  const studyType = normaliseForMatch(input.studyType)
  const matchedFields: string[] = []
  const reasons: string[] = []
  let relevanceScore = 0

  if (!definition) {
    return {
      relevanceScore: 0,
      sourceQualityScore: sourceQualityScore(input.sourceId),
      freshnessScore: freshnessScore(input.sourceDate),
      publish: false,
      matchedFields,
      reasons: ['No controlled terminology profile exists for this topic.'],
      explanation: 'Quarantined because no controlled topic profile was available.',
    }
  }

  const titleAnchors = containsAny(title, definition.anchors)
  const abstractAnchors = containsAny(abstract, definition.anchors)
  const controlledAnchors = containsAny(controlled, definition.anchors)
  if (titleAnchors.length) {
    relevanceScore += 55
    matchedFields.push('title')
    reasons.push(`Title contains controlled term: ${titleAnchors.slice(0, 2).join(', ')}.`)
  }
  if (abstractAnchors.length) {
    relevanceScore += 32
    matchedFields.push('abstract')
    reasons.push(`Abstract contains controlled term: ${abstractAnchors.slice(0, 2).join(', ')}.`)
  }
  if (controlledAnchors.length) {
    relevanceScore += 45
    matchedFields.push('controlled terminology')
    reasons.push(`Source terminology contains: ${controlledAnchors.slice(0, 2).join(', ')}.`)
  }

  const titleContext = containsAny(title, AGEING_TERMS)
  const abstractContext = containsAny(abstract, AGEING_TERMS)
  const controlledContext = containsAny(controlled, AGEING_TERMS)
  const hasContext = titleContext.length + abstractContext.length + controlledContext.length > 0
  if (titleContext.length) {
    relevanceScore += 20
    matchedFields.push('title context')
    reasons.push(`Title supplies longevity context: ${titleContext.slice(0, 2).join(', ')}.`)
  } else if (abstractContext.length) {
    relevanceScore += 12
    matchedFields.push('abstract context')
    reasons.push(`Abstract supplies longevity context: ${abstractContext.slice(0, 2).join(', ')}.`)
  } else if (controlledContext.length) {
    relevanceScore += 10
    matchedFields.push('controlled context')
    reasons.push(`Source terminology supplies longevity context: ${controlledContext.slice(0, 2).join(', ')}.`)
  }

  if (/randomi[sz]ed|clinical trial|systematic review|meta-analysis|observational|cohort|interventional/.test(studyType)) {
    relevanceScore += 5
    matchedFields.push('study type')
    reasons.push(`Study type is explicitly identified as ${cleanText(input.studyType, 80)}.`)
  }
  if (matchedFields.filter((field) => ['title', 'abstract', 'controlled terminology'].includes(field)).length >= 2) relevanceScore += 8
  if (definition.requiresAgeingContext && !hasContext) {
    relevanceScore = Math.min(relevanceScore, 45)
    reasons.push('A broad topic term appeared without explicit ageing, longevity, healthspan, or frailty context.')
  }
  if (!titleAnchors.length && !abstractAnchors.length && !controlledAnchors.length) {
    relevanceScore = 0
    reasons.push('The source query matched, but no controlled topic term was present in the returned metadata.')
  }

  relevanceScore = Math.max(0, Math.min(100, Math.round(relevanceScore)))
  const publish = relevanceScore >= 60
  const explanation = publish
    ? `Published automatically with ${relevanceScore}% topic confidence. ${reasons.slice(0, 3).join(' ')}`
    : `Quarantined automatically with ${relevanceScore}% topic confidence. ${reasons.slice(0, 3).join(' ')}`
  return {
    relevanceScore,
    sourceQualityScore: sourceQualityScore(input.sourceId),
    freshnessScore: freshnessScore(input.sourceDate),
    publish,
    matchedFields: [...new Set(matchedFields)],
    reasons,
    explanation,
  }
}

export function duplicateClusterKey(title: unknown, identifier?: unknown): string {
  const id = normaliseForMatch(identifier)
  if (id) return `id:${id}`
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'using', 'study', 'effects', 'effect', 'analysis'])
  const tokens = normaliseForMatch(title).split(' ').filter((token) => token.length > 2 && !stop.has(token)).slice(0, 18)
  return `title:${tokens.join('-')}`.slice(0, 240)
}

export function cleanText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return ''
  const clean = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 4) return null
  const match = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/)
  if (!match) return null
  const month = match[2] ?? '01'
  const day = match[3] ?? '01'
  const candidate = `${match[1]}-${month}-${day}`
  const parsed = new Date(`${candidate}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : candidate
}

export function classifyEvidence(publicationType: unknown, title: unknown, source: unknown): EvidenceLevel {
  const haystack = `${String(publicationType ?? '')} ${String(title ?? '')}`.toLowerCase()
  const sourceName = String(source ?? '').toLowerCase()

  if (sourceName === 'ppr' || haystack.includes('preprint')) return 'preprint'
  if (/(systematic review|meta-analysis|meta analysis)/.test(haystack)) return 'human-synthesis'
  if (/(randomized controlled trial|randomised controlled trial|randomized trial|randomised trial)/.test(haystack)) {
    return 'randomized-human'
  }
  if (/(clinical trial|controlled clinical trial|cohort study|observational study|human study)/.test(haystack)) {
    return 'human-study'
  }
  if (/(in vitro|mouse|mice|murine|rat model|animal model|drosophila|c\. elegans|yeast)/.test(haystack)) {
    return 'preclinical'
  }
  return 'research-record'
}

export function evidenceLabel(level: EvidenceLevel): string {
  const labels: Record<EvidenceLevel, string> = {
    'human-synthesis': 'Evidence synthesis',
    'randomized-human': 'Randomized human study',
    'human-study': 'Human study',
    preclinical: 'Preclinical research',
    preprint: 'Preprint — not peer reviewed',
    'research-record': 'Research record',
  }
  return labels[level]
}

export function researchEditorialSummary(level: EvidenceLevel, journal: unknown): string {
  const venue = cleanText(journal, 120)
  const published = venue ? ` published by ${venue}` : ''
  return `${evidenceLabel(level)}${published}, indexed because it matched monitored longevity research terms. Inclusion in this index does not establish that an intervention is effective or safe.`
}

export function normalizeTrialStatus(value: unknown): string {
  const raw = cleanText(value, 80).replace(/_/g, ' ').toLowerCase()
  if (!raw) return 'Unknown'
  return raw.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

export function trialEditorialSummary(status: unknown, phases: unknown): string {
  const phaseList = Array.isArray(phases)
    ? phases.map((phase) => cleanText(phase, 40)).filter((phase) => phase && phase !== 'NA')
    : []
  const phaseText = phaseList.length ? `${phaseList.join(', ')} ` : ''
  return `A registered ${phaseText}study indexed because it matched monitored longevity research terms. Registry status: ${normalizeTrialStatus(status)}. Registration does not establish safety or effectiveness.`
}

export function uniqueStrings(values: unknown, maxItems = 30): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((value) => cleanText(value, 120)).filter(Boolean))].slice(0, maxItems)
}

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

export type EvidenceSnapshot = {
  version: 1
  status: 'structured' | 'metadata-only'
  evidence_stage: string
  study_design: string | null
  subject_scope: string
  participants: number | null
  population: string | null
  duration: string | null
  intervention: string[]
  comparator: string | null
  outcomes_measured: string[]
  reported_outcome: string | null
  main_limitation: string
  safety_context: string
  regulatory_context: string
  source_support: string
  confidence: 'structured-source' | 'metadata-limited'
  generated_at: string
  provenance: Record<string, string>
}

type MatchInput = {
  title: unknown
  abstract?: unknown
  controlledTerms?: unknown
  studyType?: unknown
  sourceId: string
  sourceDate?: unknown
}

export type TopicMatchDefinition = {
  anchors?: string[]
  matching_terms?: string[]
  requiresAgeingContext?: boolean
  requires_ageing_context?: boolean
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
  'genomic-instability': { anchors: ['genomic instability', 'dna damage', 'dna repair'], requiresAgeingContext: true },
  'telomeres-telomerase': { anchors: ['telomere', 'telomerase'], requiresAgeingContext: true },
  'epigenetic-alterations': { anchors: ['epigenetic alteration', 'chromatin', 'histone', 'dna methylation'], requiresAgeingContext: true },
  proteostasis: { anchors: ['proteostasis', 'protein homeostasis', 'protein aggregation'], requiresAgeingContext: true },
  autophagy: { anchors: ['autophagy', 'macroautophagy', 'lysosomal'], requiresAgeingContext: true },
  'nutrient-sensing': { anchors: ['nutrient sensing', 'ampk', 'igf-1', 'insulin signaling', 'insulin signalling'], requiresAgeingContext: true },
  'mitochondrial-function': { anchors: ['mitochondrial dysfunction', 'mitochondrial function', 'mitophagy'], requiresAgeingContext: true },
  'intercellular-communication': { anchors: ['intercellular communication', 'cell-cell communication', 'extracellular vesicle'], requiresAgeingContext: true },
  'chronic-inflammation': { anchors: ['inflammaging', 'inflammageing', 'chronic inflammation'], requiresAgeingContext: true },
  'microbiome-dysbiosis': { anchors: ['microbiome', 'dysbiosis', 'gut microbiota'], requiresAgeingContext: true },
  'nad-metabolism': { anchors: ['nad+', 'nad metabolism', 'nicotinamide riboside', 'nicotinamide mononucleotide', 'nmn'], requiresAgeingContext: true },
  sirtuins: { anchors: ['sirtuin', 'sirt1', 'sirt3', 'sirt6'], requiresAgeingContext: true },
  spermidine: { anchors: ['spermidine'], requiresAgeingContext: true },
  'urolithin-a': { anchors: ['urolithin a', 'urolithin-a'], requiresAgeingContext: true },
  taurine: { anchors: ['taurine'], requiresAgeingContext: true },
  'glycine-glynac': { anchors: ['glycine', 'glynac', 'glycine n-acetylcysteine'], requiresAgeingContext: true },
  'alpha-ketoglutarate': { anchors: ['alpha-ketoglutarate', 'alpha ketoglutarate', 'akg'], requiresAgeingContext: true },
  acarbose: { anchors: ['acarbose'], requiresAgeingContext: true },
  canagliflozin: { anchors: ['canagliflozin', 'sglt2 inhibitor', 'sglt-2 inhibitor'], requiresAgeingContext: true },
  '17alpha-estradiol': { anchors: ['17alpha-estradiol', '17-alpha estradiol', '17 estradiol'], requiresAgeingContext: true },
  'ketogenic-diets': { anchors: ['ketogenic diet', 'ketosis', 'ketone body'], requiresAgeingContext: true },
  'protein-restriction': { anchors: ['protein restriction', 'methionine restriction', 'amino acid restriction', 'bcaa restriction'], requiresAgeingContext: true },
  'young-blood-parabiosis': { anchors: ['parabiosis', 'young blood', 'young plasma', 'circulating factors'], requiresAgeingContext: true },
  'heat-cold-hormesis': { anchors: ['hormesis', 'sauna', 'heat exposure', 'cold exposure', 'heat shock protein'], requiresAgeingContext: true },
  frailty: { anchors: ['frailty', 'frailty index'], requiresAgeingContext: true },
  sarcopenia: { anchors: ['sarcopenia', 'muscle aging', 'muscle ageing'], requiresAgeingContext: true },
  'cognitive-aging': { anchors: ['cognitive aging', 'cognitive ageing', 'brain aging', 'brain ageing'], requiresAgeingContext: true },
  'cardiovascular-aging': { anchors: ['cardiovascular aging', 'cardiovascular ageing', 'vascular aging', 'vascular ageing', 'arterial stiffness'], requiresAgeingContext: true },
  'immune-aging': { anchors: ['immunosenescence', 'immune aging', 'immune ageing', 'immune resilience'], requiresAgeingContext: true },
  'ovarian-aging': { anchors: ['ovarian aging', 'ovarian ageing', 'reproductive longevity', 'ovarian reserve'], requiresAgeingContext: true },
  'longevity-genetics': { anchors: ['longevity gene', 'longevity genetics', 'exceptional longevity', 'lifespan genetics'], requiresAgeingContext: true },
  'centenarian-biology': { anchors: ['centenarian', 'supercentenarian', 'exceptional longevity'] },
  'biological-age-biomarkers': { anchors: ['biological age', 'aging biomarker', 'ageing biomarker', 'pace of aging', 'pace of ageing'], requiresAgeingContext: true },
  'proteomic-aging': { anchors: ['proteomic aging', 'proteomic ageing', 'proteomic clock', 'protein aging signature'] },
  'metabolomic-aging': { anchors: ['metabolomic aging', 'metabolomic ageing', 'metabolomic clock', 'metabolic age'] },
  'transcriptomic-aging': { anchors: ['transcriptomic aging', 'transcriptomic ageing', 'transcriptomic clock', 'gene expression age'] },
  'single-cell-aging': { anchors: ['single-cell aging', 'single cell aging', 'single-cell ageing', 'single cell ageing'] },
  'multi-omics-aging': { anchors: ['multi-omics aging', 'multiomics aging', 'multi-omics ageing', 'multiomic ageing'] },
  'rna-splicing-aging': { anchors: ['rna splicing', 'alternative splicing', 'spliceosome'], requiresAgeingContext: true },
  'clonal-hematopoiesis': { anchors: ['clonal hematopoiesis', 'clonal haematopoiesis', 'chip'], requiresAgeingContext: true },
  'extracellular-matrix-aging': { anchors: ['extracellular matrix', 'mechanobiology', 'tissue stiffness', 'fibrosis'], requiresAgeingContext: true },
  'glycation-ages': { anchors: ['advanced glycation end product', 'glycation', 'age crosslink'], requiresAgeingContext: true },
  'oxidative-stress': { anchors: ['oxidative stress', 'redox homeostasis', 'reactive oxygen species'], requiresAgeingContext: true },
  'ferroptosis-aging': { anchors: ['ferroptosis', 'iron-dependent cell death'], requiresAgeingContext: true },
  'cell-competition': { anchors: ['cell competition', 'fitness selection'], requiresAgeingContext: true },
  'senescence-sasp': { anchors: ['sasp', 'senescence-associated secretory phenotype', 'senomorphic'], requiresAgeingContext: true },
  'thymic-aging': { anchors: ['thymic aging', 'thymic ageing', 'thymic involution', 'thymic regeneration'] },
  'hematopoietic-stem-cell-aging': { anchors: ['hematopoietic stem cell aging', 'haematopoietic stem cell ageing', 'aged hematopoietic stem cell'] },
  neuroinflammation: { anchors: ['neuroinflammation'], requiresAgeingContext: true },
  'blood-brain-barrier-aging': { anchors: ['blood-brain barrier', 'neurovascular'], requiresAgeingContext: true },
  'glymphatic-clearance': { anchors: ['glymphatic', 'brain waste clearance'], requiresAgeingContext: true },
  'kidney-aging': { anchors: ['kidney aging', 'kidney ageing', 'renal aging', 'renal ageing'] },
  'liver-aging': { anchors: ['liver aging', 'liver ageing', 'hepatic aging', 'hepatic ageing'] },
  'lung-aging': { anchors: ['lung aging', 'lung ageing', 'pulmonary aging', 'pulmonary ageing'] },
  'skin-aging': { anchors: ['skin aging', 'skin ageing', 'photoaging', 'photoageing'], requiresAgeingContext: true },
  'bone-aging': { anchors: ['bone aging', 'bone ageing', 'osteoporosis', 'skeletal aging'], requiresAgeingContext: true },
  'joint-cartilage-aging': { anchors: ['cartilage aging', 'cartilage ageing', 'osteoarthritis', 'joint aging'], requiresAgeingContext: true },
  'vision-aging': { anchors: ['vision aging', 'vision ageing', 'retinal aging', 'ocular aging', 'age-related macular degeneration'] },
  'hearing-aging': { anchors: ['age-related hearing loss', 'presbycusis', 'hearing aging', 'hearing ageing'] },
  'oral-health-aging': { anchors: ['oral health', 'periodontitis', 'edentulism'], requiresAgeingContext: true },
  'cancer-and-aging': { anchors: ['cancer', 'tumor', 'tumour'], requiresAgeingContext: true },
  multimorbidity: { anchors: ['multimorbidity', 'multiple chronic conditions'], requiresAgeingContext: true },
  'physiological-resilience': { anchors: ['physiological resilience', 'physical resilience', 'recovery resilience'], requiresAgeingContext: true },
  'circadian-rhythms': { anchors: ['circadian rhythm', 'chronobiology', 'circadian clock'], requiresAgeingContext: true },
  'time-restricted-eating': { anchors: ['time-restricted eating', 'time restricted feeding', 'early time-restricted'], requiresAgeingContext: true },
  'mediterranean-diet': { anchors: ['mediterranean diet', 'mediterranean dietary pattern'], requiresAgeingContext: true },
  'resistance-training': { anchors: ['resistance training', 'strength training'], requiresAgeingContext: true },
  'aerobic-fitness': { anchors: ['cardiorespiratory fitness', 'aerobic fitness', 'vo2 max', 'vo2max'], requiresAgeingContext: true },
  'digital-biomarkers': { anchors: ['digital biomarker', 'wearable', 'passive sensing'], requiresAgeingContext: true },
  'regenerative-medicine': { anchors: ['regenerative medicine', 'tissue engineering', 'organoid', 'biomaterial'], requiresAgeingContext: true },
}

const AGEING_TERMS = [
  'aging', 'ageing', 'longevity', 'lifespan', 'healthspan', 'rejuvenation', 'senescence',
  'frailty', 'frail', 'biological age', 'age-related', 'age associated', 'geroscience',
  'older adult', 'older people', 'elderly', 'centenarian', 'geriatric', 'progeria',
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
    isrctn: 98,
    ema: 100,
    sukl: 100,
    'fda-medwatch': 100,
    mhra: 100,
    'health-canada-safety': 100,
    'tga-safety': 100,
    crossref: 95,
    pubmed: 95,
    doaj: 90,
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

export function assessTopicMatch(topicSlug: string, input: MatchInput, override?: TopicMatchDefinition): QualityAssessment {
  const overrideAnchors = (override?.anchors ?? override?.matching_terms ?? [])
    .map((term) => normaliseForMatch(term))
    .filter(Boolean)
  const definition = overrideAnchors.length
    ? {
        anchors: [...new Set(overrideAnchors)],
        requiresAgeingContext: override?.requiresAgeingContext ?? override?.requires_ageing_context ?? true,
      }
    : TOPIC_TERMS[topicSlug]
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
  const hasTitleContext = titleContext.length > 0
  const hasTitleAnchor = titleAnchors.length > 0
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
  if (definition.requiresAgeingContext && (!hasTitleContext || !hasTitleAnchor)) {
    relevanceScore = Math.min(relevanceScore, 45)
    reasons.push('A broad topic needs both its topic term and clear ageing, longevity, healthspan, older-adult, or frailty context in the title; summaries and source tags alone are not enough.')
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

function snapshotDateRange(start: unknown, end: unknown): string | null {
  const from = dateOnly(start)
  const to = dateOnly(end)
  if (from && to) return `${from} to ${to}`
  if (from) return `From ${from}`
  if (to) return `Until ${to}`
  return null
}

export function researchEvidenceSnapshot(record: Record<string, any>): EvidenceSnapshot {
  const level = (record.evidence_level || 'research-record') as EvidenceLevel
  const publicationType = cleanText(record.publication_type, 180) || null
  const subjectScope = level === 'preclinical'
    ? 'Preclinical (laboratory or animal research)'
    : ['human-synthesis', 'randomized-human', 'human-study'].includes(level)
      ? 'Human evidence'
      : level === 'preprint' ? 'Not established from reusable metadata' : 'Not reported in reusable metadata'
  const limitation = level === 'preclinical'
    ? 'Preclinical findings may not apply to people; the reusable source metadata does not provide enough detail to assess the result.'
    : level === 'preprint'
      ? 'This record has not completed peer review, and the reusable source metadata does not support a finding-level summary.'
      : 'Bibliographic metadata identifies the record but does not provide enough reusable detail to summarize its population, comparison, findings, or effect size.'
  return {
    version: 1,
    status: 'metadata-only',
    evidence_stage: evidenceLabel(level),
    study_design: publicationType,
    subject_scope: subjectScope,
    participants: null,
    population: null,
    duration: null,
    intervention: [],
    comparator: null,
    outcomes_measured: [],
    reported_outcome: null,
    main_limitation: limitation,
    safety_context: 'This index record does not establish safety, effectiveness, dose, or suitability for any person.',
    regulatory_context: 'A publication record is not a regulatory approval or treatment recommendation.',
    source_support: 'Bibliographic citation metadata and controlled indexing terms only. Read the linked source for methods and results.',
    confidence: 'metadata-limited',
    generated_at: new Date().toISOString(),
    provenance: {
      evidence_stage: 'evidence_level',
      study_design: 'publication_type',
      source_support: 'content source reuse policy',
    },
  }
}

export function trialEvidenceSnapshot(record: Record<string, any>): EvidenceSnapshot {
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {}
  const interventions = uniqueStrings(metadata.interventions ?? [], 20)
  const outcomes = uniqueStrings(metadata.outcome_measures ?? [], 20)
  const populationParts = uniqueStrings([
    cleanText(metadata.sex, 80),
    cleanText(metadata.age_range, 120),
    ...uniqueStrings(metadata.eligibility_summary ?? [], 4),
  ], 6)
  const resultsAvailable = Boolean(metadata.source_has_results && cleanText(metadata.result_summary, 1200))
  return {
    version: 1,
    status: 'structured',
    evidence_stage: Array.isArray(record.phases) && record.phases.length
      ? record.phases.map((phase: unknown) => cleanText(phase, 80).replace(/_/g, ' ').replace(/\bphase\s*([1-4])\b/gi, 'Phase $1')).join(', ')
      : 'Phase not reported',
    study_design: cleanText(metadata.design_description, 240) || cleanText(record.study_type, 120) || null,
    subject_scope: 'Human clinical study registration',
    participants: Number.isSafeInteger(Number(record.enrollment)) && Number(record.enrollment) >= 0 ? Number(record.enrollment) : null,
    population: populationParts.join(' · ') || null,
    duration: snapshotDateRange(record.start_date, record.completion_date),
    intervention: interventions,
    comparator: cleanText(metadata.comparator, 300) || null,
    outcomes_measured: outcomes,
    reported_outcome: resultsAvailable ? cleanText(metadata.result_summary, 1200) : null,
    main_limitation: resultsAvailable
      ? 'Registry results are sponsor-submitted and should be checked against the full source record and any peer-reviewed publication.'
      : 'This is a study registration. No reusable structured result is available here, so it cannot show whether the intervention worked or was safe.',
    safety_context: 'Eligibility, adverse-event details, and clinical decisions must be checked in the official registry and with qualified clinicians.',
    regulatory_context: 'Trial registration is not regulatory approval and does not establish that an intervention is available.',
    source_support: resultsAvailable
      ? 'Structured registry metadata with a source-supplied result summary.'
      : 'Structured registry protocol metadata; no finding-level conclusion is generated.',
    confidence: 'structured-source',
    generated_at: new Date().toISOString(),
    provenance: {
      evidence_stage: 'phases',
      study_design: 'study_type and registry design fields',
      participants: 'enrollment',
      population: 'registry eligibility fields',
      duration: 'start_date and completion_date',
      intervention: 'registry intervention fields',
      comparator: 'registry arm fields',
      outcomes_measured: 'registry outcome-measure fields',
      reported_outcome: resultsAvailable ? 'registry structured result summary' : 'not available',
    },
  }
}

export function uniqueStrings(values: unknown, maxItems = 30): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((value) => cleanText(value, 120)).filter(Boolean))].slice(0, maxItems)
}

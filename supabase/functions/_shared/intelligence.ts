export type EvidenceLevel =
  | 'human-synthesis'
  | 'randomized-human'
  | 'human-study'
  | 'preclinical'
  | 'preprint'
  | 'research-record'

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

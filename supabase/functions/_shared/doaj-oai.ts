export type DoajOaiRecord = {
  externalId: string
  datestamp: string
  title: string
  authors: string[]
  journal: string
  publishedOn: string
  doi: string
  keywords: string[]
  language: string
  publisher: string
}

export type DoajOaiPage = {
  records: DoajOaiRecord[]
  deletedIds: string[]
  resumptionToken: string
  completeListSize: number | null
  cursor: number | null
  errorCode: string
  lastDatestamp: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function localTagPattern(localName: string, global = false): RegExp {
  const name = escapeRegExp(localName)
  return new RegExp(`<(?:(?:[A-Za-z0-9_-]+):)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z0-9_-]+):)?${name}>`, global ? 'gi' : 'i')
}

function tagText(block: string, localName: string): string {
  return decodeXml(block.match(localTagPattern(localName))?.[1] ?? '')
}

function tagTexts(block: string, localName: string, limit = 80): string[] {
  const values = [...block.matchAll(localTagPattern(localName, true))]
    .map((match) => decodeXml(match[1] ?? ''))
    .filter(Boolean)
  return [...new Set(values)].slice(0, limit)
}

function attribute(openingTag: string, name: string): string {
  return decodeXml(openingTag.match(new RegExp(`\\b${escapeRegExp(name)}=["']([^"']+)["']`, 'i'))?.[1] ?? '')
}

function articleId(identifier: string): string {
  // DOAJ currently emits `oai:doaj.org/article:{uuid}`; accept the older
  // colon form as well so a provider-side prefix normalization is harmless.
  return identifier.replace(/^oai:doaj\.org(?:\/article:|:article:)/i, '').trim()
}

export function parseDoajOaiPage(xml: string): DoajOaiPage {
  const errorOpening = xml.match(/<error\b[^>]*>/i)?.[0] ?? ''
  const errorCode = attribute(errorOpening, 'code')
  const records: DoajOaiRecord[] = []
  const deletedIds: string[] = []
  const datestamps: string[] = []

  for (const match of xml.matchAll(/<record\b[^>]*>([\s\S]*?)<\/record>/gi)) {
    const block = match[1] ?? ''
    const headerOpening = block.match(/<header\b[^>]*>/i)?.[0] ?? ''
    const header = block.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1] ?? ''
    const externalId = articleId(tagText(header, 'identifier'))
    const datestamp = tagText(header, 'datestamp')
    if (datestamp) datestamps.push(datestamp)
    if (!externalId) continue
    if (attribute(headerOpening, 'status').toLowerCase() === 'deleted') {
      deletedIds.push(externalId)
      continue
    }

    const metadata = block.match(/<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i)?.[1] ?? ''
    const title = tagText(metadata, 'title')
    if (!title) continue
    records.push({
      externalId,
      datestamp,
      title,
      authors: tagTexts(metadata, 'name', 40),
      journal: tagText(metadata, 'journalTitle'),
      publishedOn: tagText(metadata, 'publicationDate'),
      doi: tagText(metadata, 'doi'),
      keywords: tagTexts(metadata, 'keyword', 80),
      language: tagText(metadata, 'language'),
      publisher: tagText(metadata, 'publisher'),
    })
  }

  const tokenOpening = xml.match(/<resumptionToken\b[^>]*>/i)?.[0] ?? ''
  const completeListSizeAttribute = attribute(tokenOpening, 'completeListSize')
  const cursorAttribute = attribute(tokenOpening, 'cursor')
  const completeListSize = completeListSizeAttribute ? Number(completeListSizeAttribute) : Number.NaN
  const cursor = cursorAttribute ? Number(cursorAttribute) : Number.NaN
  return {
    records,
    deletedIds: [...new Set(deletedIds)],
    resumptionToken: tagText(xml, 'resumptionToken'),
    completeListSize: Number.isFinite(completeListSize) && completeListSize >= 0 ? completeListSize : null,
    cursor: Number.isFinite(cursor) && cursor >= 0 ? cursor : null,
    errorCode,
    lastDatestamp: datestamps.sort().at(0) ?? '',
  }
}

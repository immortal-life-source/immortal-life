import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const WHO_COUNTRIES_URL = 'https://www.who.int/countries';
const WHO_AUTHORITIES_URL = 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts';
const UN_M49_URL = 'https://unstats.un.org/unsd/methodology/m49/overview';
const OUTPUT = resolve('supabase/migrations/20260924000300_complete_global_country_sources.sql');

const entities = {
  amp: '&', apos: "'", quot: '"', nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ', szlig: 'ß',
};

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => entities[name] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function text(value) {
  return decodeHtml(String(value || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function key(value) {
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

function sql(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function httpsUrl(value, fallback) {
  try {
    const url = new URL(String(value || '').trim());
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return fallback;
  }
}

async function load(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'immortal.life-source-directory-generator/1.0' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

const [whoCountriesHtml, whoAuthoritiesHtml, unM49Html] = await Promise.all([
  load(WHO_COUNTRIES_URL), load(WHO_AUTHORITIES_URL), load(UN_M49_URL),
]);

const countries = [...whoCountriesHtml.matchAll(/href="\/countries\/([a-z]{3})"[^>]*>([^<]+)<\/a>/gi)]
  .map((match) => ({ iso3: match[1].toUpperCase(), name: text(match[2]) }))
  .filter((country, index, rows) => rows.findIndex((candidate) => candidate.iso3 === country.iso3) === index)
  .filter((country) => !['COK', 'NIU'].includes(country.iso3));

const m49 = new Map();
for (const rowMatch of unM49Html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)) {
  const cells = [...rowMatch[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((match) => text(match[1]));
  if (
    cells.length < 12
    || cells[0] !== '001'
    || cells[1] !== 'World'
    || !['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'].includes(cells[3])
    || !/^[A-Z]{3}$/.test(cells[11])
    || !/^[A-Z]{2}$/.test(cells[10])
  ) continue;
  if (!m49.has(cells[11])) m49.set(cells[11], { region: cells[3], subregion: cells[5], iso2: cells[10], name: cells[8] });
}

const manualStates = [
  { iso3: 'LIE', name: 'Liechtenstein', iso2: 'LI', region: 'Europe', subregion: 'Western Europe', authority: 'Office of Health of Liechtenstein', url: 'https://www.llv.li/en/national-administration/office-of-health', kind: 'regulator' },
  { iso3: 'PSE', name: 'State of Palestine', iso2: 'PS', region: 'Asia', subregion: 'Western Asia', authority: 'Palestinian Ministry of Health', url: 'https://site.moh.ps/', kind: 'regulator' },
  { iso3: 'VAT', name: 'Holy See', iso2: 'VA', region: 'Europe', subregion: 'Southern Europe', authority: 'Directorate of Health and Hygiene of Vatican City State', url: 'https://www.vaticanstate.va/en/state-and-government/structure-of-the-government/directorates/tag-manager/directorate-of-health-and-hygiene.html', kind: 'regulator' },
];
countries.push(...manualStates.map(({ iso3, name }) => ({ iso3, name })));
for (const state of manualStates) m49.set(state.iso3, state);

const aliases = new Map(Object.entries({
  'bolivia': 'BOL', 'brunei darussalam': 'BRN', 'cabo verde': 'CPV', 'cape verde': 'CPV',
  'congo': 'COG', 'democratic republic of the congo': 'COD', 'democratic peoples republic of korea': 'PRK',
  'iran': 'IRN', 'ivory coast': 'CIV', 'cote divoire': 'CIV', 'lao peoples democratic republic': 'LAO',
  'micronesia federated states of': 'FSM', 'moldova': 'MDA', 'republic of korea': 'KOR',
  'russia': 'RUS', 'russian federation': 'RUS', 'swaziland': 'SWZ', 'syria': 'SYR',
  'taiwan china': 'TWN', 'tanzania': 'TZA', 'the former yugoslav republic of macedonia': 'MKD',
  'turkey': 'TUR', 'turkiye': 'TUR', 'united republic of tanzania': 'TZA', 'venezuela': 'VEN', 'viet nam': 'VNM',
}));
for (const country of countries) aliases.set(key(country.name), country.iso3);

const ignoredAuthorityLines = /^(products? for|human use|veterinary|see also|address|street address|city\b|postal\b|telephone|tel\.?\b|phone|fax|e-?mail|website|p\.?\s*o\.?\s*box|located|contact|back to top|different address)/i;
const authorityUrlOverrides = new Map([
  ['COL', 'https://www.invima.gov.co/'],
  ['USA', 'https://www.fda.gov/'],
]);
const countryNameOverrides = new Map([
  ['NRU', 'Nauru'],
]);
const contacts = new Map();
for (const match of whoAuthoritiesHtml.matchAll(/<h4>(.*?)<\/h4>(.*?)(?=<h4>|<div[^>]+id="[A-Z0-9]"|$)/gis)) {
  const heading = text(match[1]);
  const countryName = heading.replace(/\s*\(.*$/, '').replace(/\s+see\s+.*$/i, '').trim();
  if (!countryName) continue;
  const iso3 = aliases.get(key(countryName));
  if (!iso3) continue;
  const blocks = [...match[2].matchAll(/<(?:div|p)(?:\s[^>]*)?>(.*?)<\/(?:div|p)>/gis)]
    .map((block) => text(block[1]))
    .filter(Boolean);
  const authority = blocks.find((line) => !ignoredAuthorityLines.test(line) && line.length >= 5 && line.length <= 180)
    || `National medicines authority of ${countryName}`;
  const websiteSection = match[2].match(/Website:\s*(?:&nbsp;)?\s*<a[^>]+href="(https?:\/\/[^"#]+)"/is);
  const firstWebLink = match[2].match(/<a[^>]+href="(https?:\/\/[^"#]+)"/is);
  const officialUrl = authorityUrlOverrides.get(iso3) || httpsUrl(websiteSection?.[1] || firstWebLink?.[1], WHO_AUTHORITIES_URL);
  contacts.set(iso3, { authority, officialUrl });
}
[
  ['AUT', 'Austrian Agency for Health and Food Safety', 'https://www.ages.at/'],
  ['BRN', 'Department of Pharmaceutical Services, Ministry of Health', 'https://moh.gov.bn/'],
  ['IND', 'Central Drugs Standard Control Organisation (CDSCO)', 'https://cdsco.gov.in/opencms/opencms/en/Home/'],
  ['JAM', 'Pharmaceutical Services Division, Ministry of Health and Wellness', WHO_AUTHORITIES_URL],
  ['USA', 'Food and Drug Administration (FDA)', 'https://www.fda.gov/'],
  ['YEM', 'Supreme Board of Drugs and Medical Appliances', 'https://ysbda.com/'],
].forEach(([iso3, authority, officialUrl]) => contacts.set(iso3, { authority, officialUrl }));
// The legacy directory cross-reference for Eswatini currently resolves to Sweden.
// Until WHO publishes an unambiguous national contact, use the WHO country profile.
contacts.delete('SWZ');

function atlasRegion(meta) {
  if (meta.region === 'Africa') return 'Africa';
  if (meta.region === 'Americas') return 'Americas';
  if (meta.region === 'Europe') return 'Europe';
  if (meta.region === 'Oceania') return 'Asia-Pacific';
  if (['ARM', 'AZE', 'CYP', 'GEO'].includes(meta.iso3)) return 'Europe';
  if (meta.subregion === 'Western Asia' && !['ARM', 'AZE', 'CYP', 'GEO'].includes(meta.iso3)) return 'Middle East';
  if (meta.iso3 === 'TUR') return 'Middle East';
  return 'Asia-Pacific';
}

const rows = countries.map((country) => {
  const meta = m49.get(country.iso3);
  if (!meta?.iso2) throw new Error(`Missing UN M49 metadata for ${country.name} (${country.iso3})`);
  const manual = manualStates.find((state) => state.iso3 === country.iso3);
  const contact = manual ? { authority: manual.authority, officialUrl: manual.url } : contacts.get(country.iso3);
  const profileUrl = `https://www.who.int/countries/${country.iso3.toLowerCase()}`;
  const hasAuthority = Boolean(contact);
  const displayName = countryNameOverrides.get(country.iso3) || country.name.replace(/\s*\*+$/, '');
  return {
    code: meta.iso2,
    iso3: country.iso3,
    name: displayName,
    region: atlasRegion({ ...meta, iso3: country.iso3 }),
    sourceKind: hasAuthority ? 'regulator' : 'who_profile',
    authorityName: hasAuthority ? contact.authority : `WHO country profile — ${displayName}`,
    authorityUrl: hasAuthority ? httpsUrl(contact.officialUrl, WHO_AUTHORITIES_URL) : profileUrl,
    referenceUrl: hasAuthority && !manual ? WHO_AUTHORITIES_URL : (manual ? contact.officialUrl : profileUrl),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

if (rows.length !== 195) throw new Error(`Expected 195 sovereign states; generated ${rows.length}`);
if (new Set(rows.map((row) => row.code)).size !== 195) throw new Error('Country codes are not unique');

const rosterValues = rows.map((row) => `  (${[row.code, row.iso3, row.name, row.region, row.sourceKind, row.authorityName, row.authorityUrl, row.referenceUrl].map(sql).join(', ')})`).join(',\n');

const migration = `-- Complete worldwide country-source coverage for 195 sovereign states:
-- 193 United Nations members plus the Holy See and the State of Palestine.
-- Generated from the WHO country roster, WHO Certification Scheme competent-
-- authority contacts, and the UN M49 geographic classification on 2026-09-24.
-- A WHO directory listing is not the same as WHO Listed Authority designation.

create table if not exists public.global_country_roster (
  jurisdiction_code text primary key check (jurisdiction_code ~ '^[A-Z]{2}$'),
  iso3_code text not null unique check (iso3_code ~ '^[A-Z]{3}$'),
  jurisdiction_name text not null,
  region text not null check (region in ('Europe', 'Americas', 'Asia-Pacific', 'Africa', 'Middle East')),
  source_kind text not null check (source_kind in ('regulator', 'who_profile')),
  authority_name text not null,
  authority_url text not null check (authority_url ~ '^https://'),
  reference_url text not null check (reference_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

insert into public.global_country_roster
  (jurisdiction_code, iso3_code, jurisdiction_name, region, source_kind, authority_name, authority_url, reference_url)
values
${rosterValues}
on conflict (jurisdiction_code) do update set
  iso3_code = excluded.iso3_code,
  jurisdiction_name = excluded.jurisdiction_name,
  region = excluded.region,
  source_kind = excluded.source_kind,
  authority_name = excluded.authority_name,
  authority_url = excluded.authority_url,
  reference_url = excluded.reference_url,
  updated_at = now();

insert into public.global_resources
  (id, name, resource_type, geographic_scope, jurisdiction_code, jurisdiction_name,
   region, authority_tier, description, limitations, homepage_url, data_url,
   terms_url, access_mode, reuse_status, integration_status, update_cadence, healthcheck_url)
select
  case when roster.source_kind = 'regulator' then 'global-authority-' else 'who-country-' end || lower(roster.jurisdiction_code),
  roster.authority_name,
  case when roster.source_kind = 'regulator' then 'regulator' else 'international_organization' end,
  'national',
  roster.jurisdiction_code,
  roster.jurisdiction_name,
  roster.region,
  2,
  case when roster.source_kind = 'regulator'
    then 'The World Health Organization Certification Scheme directory identifies ' || roster.authority_name || ' as a competent pharmaceutical authority serving ' || roster.jurisdiction_name || '.'
    else 'Official World Health Organization country profile for ' || roster.jurisdiction_name || ', providing national health data, programmes, priorities, publications, and WHO country-office information.'
  end,
  case when roster.source_kind = 'regulator'
    then 'Directory participation does not mean WHO Listed Authority status. Information applies only in ' || roster.jurisdiction_name || '; the authority’s current national-language record and legal decision control.'
    else 'This is a WHO country profile, not a national medicines approval database. Use it for country context and follow its official links for current national regulatory decisions.'
  end,
  roster.authority_url,
  roster.authority_url,
  roster.reference_url,
  'search',
  'link-only',
  'directory',
  'WHO reference directory checked every 6 hours',
  roster.reference_url
from public.global_country_roster roster
where not exists (
  select 1 from public.global_resources existing
  where existing.jurisdiction_code = roster.jurisdiction_code
    and existing.geographic_scope = 'national'
    and existing.resource_type in ('regulator', 'international_organization')
    and existing.id <> (case when roster.source_kind = 'regulator' then 'global-authority-' else 'who-country-' end || lower(roster.jurisdiction_code))
)
on conflict (id) do update set
  name = excluded.name,
  resource_type = excluded.resource_type,
  geographic_scope = excluded.geographic_scope,
  jurisdiction_name = excluded.jurisdiction_name,
  region = excluded.region,
  authority_tier = excluded.authority_tier,
  description = excluded.description,
  limitations = excluded.limitations,
  homepage_url = excluded.homepage_url,
  data_url = excluded.data_url,
  terms_url = excluded.terms_url,
  access_mode = excluded.access_mode,
  reuse_status = excluded.reuse_status,
  integration_status = excluded.integration_status,
  update_cadence = excluded.update_cadence,
  healthcheck_url = excluded.healthcheck_url,
  updated_at = now();

select public.refresh_global_resource_eligibility();

do $$
declare roster_count integer;
declare covered_count integer;
begin
  select count(*) into roster_count from public.global_country_roster;
  select count(distinct roster.jurisdiction_code) into covered_count
  from public.global_country_roster roster
  join public.global_resources resource on resource.jurisdiction_code = roster.jurisdiction_code
    and resource.geographic_scope = 'national'
    and resource.is_eligible;
  if roster_count <> 195 or covered_count <> 195 then
    raise exception 'Global country coverage incomplete: roster %, covered %', roster_count, covered_count;
  end if;
end $$;

alter table public.global_country_roster enable row level security;
revoke all on table public.global_country_roster from public, anon, authenticated;
grant all on table public.global_country_roster to service_role;

select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/check-resource-health',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"global-country-expansion"}'::jsonb,
  timeout_milliseconds := 150000
);
`;

await writeFile(OUTPUT, migration, 'utf8');
console.log(JSON.stringify({ output: OUTPUT, countries: rows.length, regulators: rows.filter((row) => row.sourceKind === 'regulator').length, whoProfiles: rows.filter((row) => row.sourceKind === 'who_profile').length }, null, 2));

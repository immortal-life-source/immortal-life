'use strict';

const fs = require('fs');
const path = require('path');

function parseTuples(source) {
  const rows = [];
  let depth = 0;
  let quoted = false;
  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'") {
      if (quoted && source[index + 1] === "'") { index += 1; continue; }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === '(') {
      if (depth === 0) start = index + 1;
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0 && start >= 0) rows.push(parseValues(source.slice(start, index)));
    }
  }
  return rows;
}

function parseValues(tuple) {
  const values = [];
  let quoted = false;
  let current = '';
  for (let index = 0; index < tuple.length; index += 1) {
    const char = tuple[index];
    if (char === "'") {
      if (quoted && tuple[index + 1] === "'") { current += "'"; index += 1; continue; }
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      values.push(normalize(current));
      current = '';
    } else current += char;
  }
  values.push(normalize(current));
  return values;
}

function normalize(value) {
  const cleaned = value.trim();
  if (/^null$/i.test(cleaned)) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return cleaned;
}

const resourceColumns = [
  'id', 'name', 'resource_type', 'geographic_scope', 'jurisdiction_code', 'jurisdiction_name',
  'region', 'authority_tier', 'description', 'limitations', 'homepage_url', 'data_url',
  'terms_url', 'access_mode', 'reuse_status', 'integration_status', 'update_cadence', 'healthcheck_url',
];

function record(values) {
  return Object.fromEntries(resourceColumns.map((column, index) => [column, values[index] ?? null]));
}

function resourceBlocks(sql) {
  const rows = [];
  const expression = /insert into public\.global_resources[\s\S]*?\nvalues\s*([\s\S]*?)\non conflict \(id\)/g;
  for (const match of sql.matchAll(expression)) rows.push(...parseTuples(match[1]).filter((item) => item.length >= 18).map(record));
  return rows;
}

function finishResource(resource) {
  return {
    ...resource,
    eligibility_reason: 'Included as an official, public, jurisdiction-labelled source.',
    last_checked_at: null,
    last_healthy_at: null,
    health: 'pending',
    health_basis: resource.integration_status === 'live' ? 'ingestion' : 'availability',
  };
}

function buildResourceDirectory(rootDirectory) {
  const read = (name) => fs.readFileSync(path.join(rootDirectory, 'supabase', 'migrations', name), 'utf8');
  const resources = new Map();
  for (const name of [
    '20260915000300_global_resource_atlas.sql',
    '20260916000300_global_resource_atlas_expansion.sql',
  ]) for (const item of resourceBlocks(read(name))) resources.set(item.id, item);

  const euSql = read('20260924000100_complete_eu_regulatory_sources.sql');
  const euValues = euSql.match(/with eu_authorities[\s\S]*?as \(\s*values\s*([\s\S]*?)\n\)\s*insert into public\.global_resources/i)?.[1] || '';
  for (const [id, name, code, country, homepage, dataUrl] of parseTuples(euValues)) {
    const existing = resources.get(id);
    resources.set(id, {
      id, name, resource_type: 'regulator', geographic_scope: 'national', jurisdiction_code: code,
      jurisdiction_name: country, region: 'Europe', authority_tier: 1,
      description: `${name} is the official national authority identified by the European Medicines Agency for human-medicine authorisation or oversight in ${country}.`,
      limitations: `Information applies in ${country} and to the exact medicine, indication, procedure, population, and date. The national authority record and current legal decision control.`,
      homepage_url: homepage, data_url: dataUrl, terms_url: null, access_mode: 'search', reuse_status: 'link-only',
      integration_status: existing?.integration_status === 'live' ? 'live' : 'directory',
      update_cadence: existing?.integration_status === 'live' ? existing.update_cadence : 'Official link checked every 6 hours',
      healthcheck_url: homepage,
    });
  }

  const countrySql = read('20260924000300_complete_global_country_sources.sql');
  const countryValues = countrySql.match(/insert into public\.global_country_roster[\s\S]*?\nvalues\s*([\s\S]*?)\non conflict/i)?.[1] || '';
  const countries = parseTuples(countryValues).map(([code, iso3, name, region, sourceKind, authorityName, authorityUrl, referenceUrl]) => ({
    jurisdiction_code: code, iso3_code: iso3, jurisdiction_name: name, region, source_kind: sourceKind,
    authority_name: authorityName, authority_url: authorityUrl, reference_url: referenceUrl,
  }));
  for (const country of countries) {
    const represented = [...resources.values()].some((item) => item.jurisdiction_code === country.jurisdiction_code
      && item.geographic_scope === 'national' && ['regulator', 'international_organization'].includes(item.resource_type));
    if (represented) continue;
    const regulator = country.source_kind === 'regulator';
    const id = `${regulator ? 'global-authority' : 'who-country'}-${country.jurisdiction_code.toLowerCase()}`;
    resources.set(id, {
      id, name: country.authority_name, resource_type: regulator ? 'regulator' : 'international_organization',
      geographic_scope: 'national', jurisdiction_code: country.jurisdiction_code, jurisdiction_name: country.jurisdiction_name,
      region: country.region, authority_tier: 2,
      description: regulator
        ? `Official pharmaceutical authority serving ${country.jurisdiction_name}, listed in the World Health Organization reference directory.`
        : `Official World Health Organization country profile for ${country.jurisdiction_name}, with national health data and programme context.`,
      limitations: regulator
        ? `Information applies only in ${country.jurisdiction_name}; the authority's current official record and legal decision control.`
        : 'This is a WHO country profile, not a national medicines approval database.',
      homepage_url: country.authority_url, data_url: country.authority_url, terms_url: country.reference_url,
      access_mode: 'search', reuse_status: 'link-only', integration_status: 'directory',
      update_cadence: 'WHO reference directory checked every 6 hours', healthcheck_url: country.reference_url,
    });
  }

  const output = [...resources.values()].map(finishResource).sort((left, right) => left.authority_tier - right.authority_tier || left.name.localeCompare(right.name));
  const countBy = (key) => output.reduce((counts, item) => ({ ...counts, [item[key]]: (counts[item[key]] || 0) + 1 }), {});
  const countriesByRegion = countries.reduce((groups, country) => {
    groups[country.region] = (groups[country.region] || 0) + 1;
    return groups;
  }, {});
  return {
    generated_at: '2026-09-25T00:00:00.000Z', resources: output, country_directory: countries,
    coverage: {
      total: output.length, countries: countries.length, regions: Object.keys(countBy('region')).length,
      jurisdictions: new Set(output.map((item) => item.jurisdiction_code)).size,
      live_integrations: output.filter((item) => item.integration_status === 'live').length,
      healthy: 0, by_region: countBy('region'), by_region_jurisdictions: countriesByRegion, by_type: countBy('resource_type'),
    },
    scope_notice: 'Coverage is authority-based. A resource applies only in its stated jurisdiction; directory inclusion is not endorsement or evidence of treatment approval.',
  };
}

module.exports = { buildResourceDirectory };

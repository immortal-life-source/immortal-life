'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('quality engine scores controlled terminology and quarantines weak matches', () => {
  const shared = read('supabase/functions/_shared/intelligence.ts');
  const sync = read('supabase/functions/sync-intelligence/index.ts');
  assert.match(shared, /assessTopicMatch/);
  assert.match(shared, /relevanceScore >= 60/);
  assert.match(shared, /requiresAgeingContext/);
  assert.match(sync, /publication_state: assessment\.publish \? 'published' : 'quarantined'/);
  assert.match(sync, /match_reasons: assessment\.reasons/);
  assert.match(sync, /duplicateClusterKey/);
});

test('broad-topic false positives require explicit longevity context', async () => {
  const { assessTopicMatch } = await import('../supabase/functions/_shared/intelligence.ts');
  const weak = assessTopicMatch('gene-therapy', {
    title: 'CRISPR biosensor for graphene oxide detection',
    abstract: 'A materials-science assay for industrial sensing.',
    sourceId: 'europe-pmc',
    sourceDate: '2026-09-15',
  });
  const strong = assessTopicMatch('gene-therapy', {
    title: 'CRISPR gene therapy for age-related cellular senescence',
    abstract: 'A preclinical longevity study.',
    sourceId: 'europe-pmc',
    sourceDate: '2026-09-15',
  });
  assert.equal(weak.publish, false);
  assert.ok(weak.relevanceScore < 60);
  assert.equal(strong.publish, true);
  assert.ok(strong.relevanceScore >= 60);
});

test('broad topics cannot publish from source tags alone', async () => {
  const { assessTopicMatch } = await import('../supabase/functions/_shared/intelligence.ts');
  const metadataOnly = assessTopicMatch('exercise', {
    title: 'Family study of affective and anxiety spectrum disorders',
    abstract: 'A registry study of families and mood outcomes.',
    controlledTerms: ['exercise', 'ageing'],
    studyType: 'observational study',
    sourceId: 'clinicaltrials-gov',
  });
  assert.equal(metadataOnly.publish, false);
  assert.ok(metadataOnly.relevanceScore < 60);

  const summaryOnly = assessTopicMatch('exercise', {
    title: 'Exercise during intensive treatment in pediatric oncology',
    abstract: 'The study mentions cellular ageing as a secondary laboratory measure.',
    controlledTerms: ['exercise'],
    studyType: 'clinical trial',
    sourceId: 'clinicaltrials-gov',
  });
  assert.equal(summaryOnly.publish, false);
  assert.ok(summaryOnly.relevanceScore < 60);

  const explicit = assessTopicMatch('exercise', {
    title: 'Exercise for healthy ageing and frailty prevention',
    abstract: 'Physical activity in older adults with frailty.',
    controlledTerms: ['exercise'],
    studyType: 'clinical trial',
    sourceId: 'clinicaltrials-gov',
  });
  assert.equal(explicit.publish, true);
});

test('all public discovery surfaces exclude quarantined records', () => {
  const publicApi = read('supabase/functions/public-intelligence/index.ts');
  const pages = read('supabase/functions/public-pages/index.ts');
  const briefings = read('supabase/functions/generate-public-briefing/index.ts');
  const indexNow = read('supabase/functions/notify-indexnow/index.ts');
  for (const source of [publicApi, pages, briefings, indexNow]) assert.match(source, /publication_state/);
  assert.match(pages, /Why this record appears here/);
  assert.match(publicApi, /get_intelligence_quality_telemetry/);
});

test('entity pages, automated social cards, and briefing distribution are wired', () => {
  const config = read('vercel.json');
  const pages = read('supabase/functions/public-pages/index.ts');
  const distribution = read('supabase/functions/distribute-public-briefing/index.ts');
  assert.match(config, /entities\/:kind\/:slug/);
  assert.match(config, /social-card\/:kind\/:key\.png/);
  assert.match(read('supabase/functions/social-card/index.ts'), /ImageResponse/);
  assert.match(distribution, /websub-rss/);
  assert.match(distribution, /briefing\.published/);
  assert.match(distribution, /SOCIAL_DISTRIBUTION_ENDPOINT/);
  assert.match(distribution, /X-Distribution-Signature/);
  assert.doesNotMatch(distribution, /api\.linkedin\.com\/rest\/posts|api\.x\.com\/2\/tweets/);
});

test('canonical discovery URLs use the deployed www host', () => {
  assert.match(read('robots.txt'), /https:\/\/www\.immortal\.life\/sitemap\.xml/);
  assert.match(read('supabase/functions/public-pages/index.ts'), /const SITE = 'https:\/\/www\.immortal\.life'/);
  assert.doesNotMatch(read('build.js'), /https:\/\/immortal\.life\/(research|trials|topics|quality|entities)/);
});

test('global resource atlas is authority-based, jurisdiction-aware, and automatically monitored', () => {
  const migration = read('supabase/migrations/20260915000300_global_resource_atlas.sql');
  const api = read('supabase/functions/public-intelligence/index.ts');
  const monitor = read('supabase/functions/check-resource-health/index.ts');
  const template = read('intelligence-template.html');
  assert.match(migration, /authority_tier/);
  assert.match(migration, /jurisdiction_name/);
  assert.match(migration, /consecutive_failures < 6/);
  assert.match(migration, /having count\(\*\) >= 3/);
  assert.match(api, /view === 'resources'/);
  assert.match(monitor, /refresh_global_resource_eligibility/);
  assert.match(template, /Coverage map/);
  assert.match(template, /Regulatory information applies only to the country or region/);
});

test('global source directory covers all 195 sovereign states without inventing missing regulators', () => {
  const migration = read('supabase/migrations/20260924000300_complete_global_country_sources.sql');
  const generator = read('scripts/generate-global-country-sources.mjs');
  const api = read('supabase/functions/public-intelligence/index.ts');
  const portal = read('intelligence.js');
  const rosterRows = migration.match(/\n  \('[A-Z]{2}', '[A-Z]{3}',/g) ?? [];
  assert.equal(rosterRows.length, 195);
  assert.match(migration, /create table if not exists public\.global_country_roster/);
  assert.match(migration, /source_kind in \('regulator', 'who_profile'\)/);
  assert.match(migration, /roster_count <> 195 or covered_count <> 195/);
  assert.match(generator, /WHO country profile/);
  assert.match(generator, /cells\[0\] !== '001'/);
  assert.match(api, /Math\.min\(Math\.max\(parsedLimit, 1\), 500\)/);
  assert.match(api, /by_region_jurisdictions/);
  assert.match(api, /country_directory: countryDirectory/);
  assert.match(portal, /request\('resources', 500\)/);
  assert.match(portal, /Worldwide country coverage/);
});

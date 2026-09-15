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

test('all public discovery surfaces exclude quarantined records', () => {
  const publicApi = read('supabase/functions/public-intelligence/index.ts');
  const pages = read('supabase/functions/public-pages/index.ts');
  const briefings = read('supabase/functions/generate-public-briefing/index.ts');
  const indexNow = read('supabase/functions/notify-indexnow/index.ts');
  for (const source of [publicApi, pages, briefings, indexNow]) assert.match(source, /publication_state/);
  assert.match(pages, /Why this record matched/);
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
});

test('canonical discovery URLs use the deployed www host', () => {
  assert.match(read('robots.txt'), /https:\/\/www\.immortal\.life\/sitemap\.xml/);
  assert.match(read('supabase/functions/public-pages/index.ts'), /const SITE = 'https:\/\/www\.immortal\.life'/);
  assert.doesNotMatch(read('build.js'), /https:\/\/immortal\.life\/(research|trials|topics|quality|entities)/);
});

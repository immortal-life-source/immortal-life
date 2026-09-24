import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public pages permanently disclose the absence of human review', () => {
  const templates = `${read('intelligence-template.html')}\n${read('content-template.html')}`;
  assert.match(templates, /No scientist, clinician, researcher, editor, or human reviewer/i);
  assert.match(read('supabase/functions/public-pages/index.ts'), /No scientist, clinician, researcher, editor, or human reviewer/i);
});

test('permanent records, discovery feeds, API, and briefings have clean routes', () => {
  const config = JSON.parse(read('vercel.json'));
  const sources = new Set(config.rewrites.map((rewrite) => rewrite.source));
  for (const route of ['/research/:id', '/trials/:id', '/regulatory/:id', '/integrity/:id', '/briefings', '/briefings/:slug', '/api/intelligence/:kind/:id', '/sitemap.xml', '/feed.xml', '/feed.atom', '/feed.json']) {
    assert.ok(sources.has(route), `missing ${route}`);
  }
});

test('weekly public briefings and IndexNow notifications are scheduled', () => {
  const migration = read('supabase/migrations/20260915000100_publication_and_discovery.sql');
  assert.match(migration, /immortal-life-public-weekly-briefing/);
  assert.match(migration, /immortal-life-indexnow/);
  assert.match(read('supabase/functions/notify-indexnow/index.ts'), /api\.indexnow\.org\/indexnow/);
});

test('topic dossiers expose evidence state, limitations, and regulatory context', () => {
  const topics = JSON.parse(read('intelligence-topics.json'));
  assert.equal(topics.length, 12);
  for (const topic of topics) {
    assert.ok(topic.question && topic.state && topic.limits && topic.regulatory, `incomplete dossier: ${topic.slug}`);
  }
});

test('record cards link to indexable first-party detail pages', () => {
  const script = read('intelligence.js');
  assert.match(script, /`\/research\/\$\{encodeURIComponent\(record\.id\)\}`/);
  assert.match(script, /`\/trials\/\$\{encodeURIComponent\(record\.id\)\}`/);
  assert.match(script, /`\/regulatory\/\$\{encodeURIComponent\(record\.id\)\}`/);
  assert.match(script, /`\/integrity\/\$\{encodeURIComponent\(record\.id\)\}`/);
});

test('search-demand utility pages, segmented sitemaps, topic feeds, and datasets are routed', () => {
  const config = JSON.parse(read('vercel.json'));
  const sources = new Set(config.rewrites.map((rewrite) => rewrite.source));
  for (const route of ['/discover', '/discover/regulatory-status', '/discover/research-integrity', '/reports', '/sitemaps/:type.xml', '/feeds/topics/:topic.xml', '/datasets/:kind.csv', '/api/subscribe']) {
    assert.ok(sources.has(route), `missing ${route}`);
  }
  const pages = read('supabase/functions/public-pages/index.ts');
  assert.match(pages, /noindex,follow/);
  assert.match(pages, /selectedTrials\.length >= 3/);
  assert.match(pages, /sitemapindex/);
});

test('Search Console and consent-based briefing delivery are automated and private', () => {
  const migration = read('supabase/migrations/20260915000700_search_demand_and_utility.sql');
  assert.match(migration, /immortal-life-search-console-sync/);
  assert.match(migration, /immortal-life-subscriber-briefing-delivery/);
  assert.match(migration, /revoke all on table public\.search_console_daily/);
  assert.match(read('supabase/functions/sync-search-console/index.ts'), /searchAnalytics\/query/);
  assert.match(read('supabase/functions/subscribe-briefing/index.ts'), /status: 'pending'/);
  assert.match(read('supabase/functions/deliver-briefings/index.ts'), /RESEND_API_KEY/);
});

test('public intelligence UI explains empty states and reports quality zeros accurately', () => {
  const script = read('intelligence.js');
  const template = read('intelligence-template.html');
  assert.match(script, /countParts\.join\(' · '\) \|\| 'Index building'/);
  assert.match(script, /node\.kind === 'topic' && Number\(node\.weight \|\| 0\) > 0/);
  assert.match(script, /typeof value === 'number' \? numberFormatter\.format\(value\)/);
  assert.doesNotMatch(template, /id="(?:research|trial|topic)Count">0</);
});

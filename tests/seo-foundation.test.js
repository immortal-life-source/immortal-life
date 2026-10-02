import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('research discovery expands through dynamic segmented sitemaps', () => {
  const config = JSON.parse(read('vercel.json'));
  const routes = new Map(config.rewrites.map((route) => [route.source, route.destination]));
  assert.equal(routes.get('/sitemap.xml'), '/api/sitemap?type=index');
  assert.equal(routes.get('/sitemaps/research-:segment.xml'), '/api/sitemap?type=research-:segment');
  const proxy = read('api/sitemap.js');
  assert.match(proxy, /recordTypePattern = \/\^\(research\|trials\|regulatory\|integrity\)/);
  assert.match(proxy, /directoryTypes = new Set\(\['index'/);
  const pages = read('supabase/functions/public-pages/index.ts');
  assert.match(pages, /SITEMAP_SEGMENT_SIZE = 25_000/);
  assert.match(pages, /Math\.ceil\(count \/ SITEMAP_SEGMENT_SIZE\)/);
});

test('topic indexing fails closed and follows verified evidence readiness', () => {
  const template = read('intelligence-template.html');
  const build = read('build.js');
  const renderer = read('api/_topic-funding-ssr.js');
  const page = read('api/topic-page.js');
  const migration = read('supabase/migrations/20261002001100_search_readiness_and_complete_sitemaps.sql');
  assert.match(template, /meta name="robots" content="\{\{ROBOTS_CONTENT\}\}"/);
  assert.match(build, /PAGE_VIEW === 'topic' \? 'noindex, follow'/);
  assert.match(renderer, /evidenceRecordCount >= 5/);
  assert.match(page, /X-Robots-Tag/);
  assert.match(page, /cacheable: false, indexable: false/);
  assert.match(migration, /research_count bigint/);
  assert.match(migration, /trial_count bigint/);
});

test('major hubs and dynamic profiles use cacheable first-party HTML', () => {
  const config = JSON.parse(read('vercel.json'));
  const routes = new Map(config.rewrites.map((route) => [route.source, route.destination]));
  assert.equal(routes.get('/research'), '/api/hub-page?view=research');
  assert.equal(routes.get('/trials'), '/api/hub-page?view=trials');
  assert.equal(routes.get('/universities'), '/api/hub-page?view=universities');
  assert.equal(routes.get('/funding'), '/api/hub-page?view=funding');
  assert.equal(routes.get('/funders/:slug'), '/api/public-page?mode=funder&slug=:slug');
  const hubs = read('api/hub-page.js');
  const build = read('build.js');
  const pages = read('api/public-page.js');
  assert.match(build, /const serverRenderedHubs = new Set\(\['research', 'trials', 'universities', 'funding'\]\)/);
  assert.match(hubs, /dist', '_hub-templates'/);
  assert.match(hubs, /data-prerendered="true"/);
  assert.match(hubs, /stale-while-revalidate=86400/);
  assert.match(pages, /Vercel-CDN-Cache-Control/);
  assert.match(pages, /controller\.abort\(\), 22_000/);
  assert.match(pages, /const contentType = 'text\/html; charset=utf-8'/);
  assert.match(pages, /response\.redirect\(308, canonical\)/);
});

test('the complete topic directory is present before JavaScript runs', () => {
  const build = read('build.js');
  const template = read('intelligence-template.html');
  assert.match(build, /function renderTopicDirectoryMarkup\(\)/);
  assert.match(build, /TOPIC_GRID_HTML: resolved\.PAGE_VIEW === 'topics'/);
  assert.match(template, /id="topicGrid">\{\{TOPIC_GRID_HTML\}\}/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('personal radar supports useful private watches without a forum', () => {
  const migration = read('supabase/migrations/20260916000100_reader_growth_loops.sql');
  const endpoint = read('supabase/functions/member-intelligence/index.ts');
  assert.match(migration, /member_radar_watches/);
  assert.match(migration, /'topic', 'entity', 'country', 'trial'/);
  assert.match(endpoint, /mark_radar_seen/);
  assert.match(endpoint, /intelligence_change_events/);
  assert.doesNotMatch(migration, /create table[^;]*(forum|comment|post)/i);
});

test('personal radar and weekly briefings exclude routine record noise', () => {
  const member = read('supabase/functions/member-intelligence/index.ts');
  const briefing = read('supabase/functions/generate-briefings/index.ts');
  for (const source of [member, briefing]) {
    assert.match(source, /MEANINGFUL_EVENT_TYPES/);
    assert.match(source, /trial_status_changed/);
    assert.match(source, /new_regulatory_notice/);
    assert.match(source, /new_integrity_event/);
    assert.match(source, /isMeaningfulEvent\(event\)/);
  }
  assert.doesNotMatch(member.match(/MEANINGFUL_EVENT_TYPES[^\n]+/)?.[0] || '', /new_research|new_trial/);
  assert.doesNotMatch(briefing.match(/MEANINGFUL_EVENT_TYPES[^\n]+/)?.[0] || '', /new_research|new_trial/);
});

test('meaningful changes have public pages, feeds, social cards, and navigation', () => {
  const config = JSON.parse(read('vercel.json'));
  const sources = new Set(config.rewrites.map((rewrite) => rewrite.source));
  for (const route of ['/changes', '/changes/feed.xml', '/changes/feed.json']) assert.ok(sources.has(route), `missing ${route}`);
  const pages = read('supabase/functions/public-pages/index.ts');
  assert.match(pages, /mode === 'changes'/);
  assert.match(pages, /Living change log/);
  assert.match(read('supabase/functions/social-card/index.ts'), /kind === 'changes'/);
});

test('social publishing is delegated using signed idempotent events', () => {
  const distribution = read('supabase/functions/distribute-public-briefing/index.ts');
  assert.match(distribution, /SOCIAL_DISTRIBUTION_ENDPOINT/);
  assert.match(distribution, /X-Distribution-Signature/);
  assert.match(distribution, /Idempotency-Key/);
  assert.match(distribution, /sourceDigest/);
  assert.doesNotMatch(distribution, /LINKEDIN_PAGE_ACCESS_TOKEN|X_USER_ACCESS_TOKEN|api\.linkedin\.com\/rest\/posts|api\.x\.com\/2\/tweets/);
});

test('datasets are described for discovery and widgets accept useful filters', () => {
  const build = read('build.js');
  assert.match(build, /'@type': 'DataCatalog'/);
  assert.match(build, /'@type': 'Dataset'/);
  assert.match(build, /'@type': 'DataDownload'/);
  const widget = read('widget.js');
  assert.match(widget, /getAttribute\('topic'\)/);
  assert.match(widget, /getAttribute\('kind'\)/);
  assert.match(widget, /getAttribute\('country'\)/);
});

test('utility measurement is aggregate and identifier-free', () => {
  const migration = read('supabase/migrations/20260916000100_reader_growth_loops.sql');
  const endpoint = read('supabase/functions/record-utility-event/index.ts');
  assert.match(migration, /utility_event_daily/);
  assert.match(endpoint, /increment_utility_event/);
  assert.doesNotMatch(endpoint, /cookie|user_agent|ip_address|member_id/i);
});

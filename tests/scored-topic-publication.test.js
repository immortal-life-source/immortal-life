const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('zero-score topic relations can never be published', () => {
  const migration = read('supabase/migrations/20260927000500_enforce_published_topic_scores.sql');
  const api = read('supabase/functions/public-intelligence/index.ts');
  assert.match(migration, /not is_published or relevance_score >= 60/);
  assert.match(migration, /set is_published = false/);
  assert.match(api, /relevance_score \?\? 0\) < 60/);
});

test('temporary source search results are never called zero-percent matches', () => {
  const proxy = read('api/intelligence.js');
  const browser = read('intelligence.js');
  assert.match(proxy, /source-search-unscored/);
  assert.match(proxy, /Unscored source-search results are not substituted/);
  assert.match(proxy, /Cache-Control', 'no-store'/);
  assert.match(browser, /match score unavailable/);
  assert.match(browser, /no zero counts or unscored records are substituted/);
});

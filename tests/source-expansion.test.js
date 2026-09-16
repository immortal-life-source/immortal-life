'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('expanded sources are registered as autonomous live integrations', () => {
  const migration = read('supabase/migrations/20260916000200_expand_live_sources.sql');
  for (const source of ['pubmed', 'fda-medwatch', 'mhra', 'health-canada-safety', 'tga-safety']) {
    assert.match(migration, new RegExp(`'${source}'`));
  }
  assert.match(migration, /content_source_id = 'pubmed'/);
  assert.match(migration, /content_source_id = 'mhra'/);
  assert.match(migration, /select public\.refresh_global_resource_eligibility\(\)/);
});

test('PubMed ingestion uses official E-utilities and existing quality controls', () => {
  const sync = read('supabase/functions/sync-intelligence/index.ts');
  assert.match(sync, /eutils\.ncbi\.nlm\.nih\.gov\/entrez\/eutils\/esearch\.fcgi/);
  assert.match(sync, /eutils\.ncbi\.nlm\.nih\.gov\/entrez\/eutils\/efetch\.fcgi/);
  assert.match(sync, /throttleNcbi/);
  assert.match(sync, /source_id: 'pubmed'/);
  assert.match(sync, /publication_state: assessment\.publish \? 'published' : 'quarantined'/);
  assert.match(sync, /duplicate_cluster_key: duplicateClusterKey\(title, doi\)/);
});

test('new regulator feeds use the shared relevance quarantine path', () => {
  const sync = read('supabase/functions/sync-intelligence/index.ts');
  for (const endpoint of ['medwatch/rss.xml', 'drug-safety-update.atom', 'health-products-alerts-recalls', 'safety-alerts.xml']) {
    assert.match(sync, new RegExp(endpoint.replaceAll('.', '\\.')));
  }
  assert.match(sync, /job\.source_id in REGULATORY_FEEDS/);
  assert.match(sync, /matchedTopics\.length \? 'published' : 'quarantined'/);
});

test('expanded sources have explicit trust scores', async () => {
  const { sourceQualityScore } = await import('../supabase/functions/_shared/intelligence.ts');
  assert.equal(sourceQualityScore('pubmed'), 95);
  for (const source of ['fda-medwatch', 'mhra', 'health-canada-safety', 'tga-safety']) {
    assert.equal(sourceQualityScore(source), 100);
  }
});

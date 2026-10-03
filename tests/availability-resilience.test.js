const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('independent availability workflow checks the critical public experience every five minutes', () => {
  const workflow = read('.github/workflows/public-availability.yml');
  const monitor = read('scripts/check-public-availability.mjs');
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /availability-incident/);
  assert.match(workflow, /steps\.availability\.outcome != 'success'/);
  for (const route of ['/', '/topics/frailty', '/universities', '/research', '/trials', '/funding', '/sitemap.xml', '/institutional-pilot', '/api/intelligence?view=topic-dossier&topic=exercise&limit=12']) {
    assert.ok(monitor.includes(`path: '${route}'`), `missing monitored route ${route}`);
  }
  assert.match(monitor, /static-fallback\|official-source-fallback/);
  assert.match(monitor, /attempts 3|attempts\)/);
});

test('verified browser data survives a temporary live-source outage without caching fallback payloads', () => {
  const portal = read('intelligence.js');
  assert.match(portal, /publicCacheFallbackMaxAgeMs = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(portal, /!data\?\.fallback && !data\?\.unavailable/);
  assert.match(portal, /Showing the last verified snapshot from/);
});

test('availability runbook preserves billing controls and records the shared Vercel team risk', () => {
  const runbook = read('docs/availability-runbook.md');
  assert.match(runbook, /Supabase spending controls remain capped/);
  assert.match(runbook, /live\.im and immortal\.life share a Vercel team/i);
  assert.match(runbook, /must not be changed by code or automation/);
});


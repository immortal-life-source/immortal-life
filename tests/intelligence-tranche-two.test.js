import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260914000600_intelligence_tranche_two.sql', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../supabase/functions/sync-intelligence/index.ts', import.meta.url), 'utf8');
const member = readFileSync(new URL('../supabase/functions/member-intelligence/index.ts', import.meta.url), 'utf8');
const briefings = readFileSync(new URL('../supabase/functions/generate-briefings/index.ts', import.meta.url), 'utf8');
const news = readFileSync(new URL('../news-modal.js', import.meta.url), 'utf8');

test('tranche two registers official and integrity sources as autonomous jobs', () => {
  for (const source of ['crossref', 'ema', 'sukl']) {
    assert.match(migration, new RegExp(`'${source}'`));
    assert.match(sync, new RegExp(`source_id === '${source}'|sourceId: '${source}'|sourceId === '${source}'|\\b${source}\\s*:`));
  }
  assert.match(sync, /SIX_HOURS_MS/);
  assert.match(sync, /source_id,job_key,window_start/);
});

test('watchlists only use the verified signed member session', () => {
  assert.match(member, /sessionFromRequest\(req\)/);
  assert.match(member, /member_id: session\.member_id/);
  assert.doesNotMatch(member, /body\?\.member_id/);
});

test('weekly briefing generation is scheduled and idempotent', () => {
  assert.match(migration, /immortal-life-weekly-briefings/);
  assert.match(migration, /12 6 \* \* 1/);
  assert.match(briefings, /onConflict: 'member_id,period_start'/);
});

test('project news treats database content as text, never markup', () => {
  assert.match(news, /contentNode\.textContent = item\.content/);
  assert.doesNotMatch(news, /item\.content\s*\+\s*'<\/span>'/);
  assert.match(migration, /Autonomous evidence intelligence is live/);
});

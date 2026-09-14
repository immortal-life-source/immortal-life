import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyEvidence,
  cleanText,
  dateOnly,
  normalizeTrialStatus,
  researchEditorialSummary,
  trialEditorialSummary,
  uniqueStrings,
} from '../supabase/functions/_shared/intelligence.ts';

test('cleanText removes markup, normalizes space, and truncates', () => {
  assert.equal(cleanText(' <b>Hello</b>   world ', 100), 'Hello world');
  assert.equal(cleanText('123456789', 6), '12345…');
  assert.equal(cleanText(null), '');
});

test('dateOnly safely normalizes partial source dates', () => {
  assert.equal(dateOnly('2026-09-14'), '2026-09-14');
  assert.equal(dateOnly('2026-09'), '2026-09-01');
  assert.equal(dateOnly('2026'), '2026-01-01');
  assert.equal(dateOnly('not-a-date'), null);
});

test('evidence classification avoids treating unknown records as human evidence', () => {
  assert.equal(classifyEvidence('Systematic Review; Meta-Analysis', 'A review', 'MED'), 'human-synthesis');
  assert.equal(classifyEvidence('Journal Article', 'Randomized controlled trial of exercise', 'MED'), 'randomized-human');
  assert.equal(classifyEvidence('Journal Article', 'Rapamycin in a mouse model', 'MED'), 'preclinical');
  assert.equal(classifyEvidence('Journal Article', 'Aging pathways', 'MED'), 'research-record');
  assert.equal(classifyEvidence('Journal Article', 'Early findings', 'PPR'), 'preprint');
});

test('automated summaries retain explicit non-endorsement language', () => {
  const research = researchEditorialSummary('human-study', 'Metformin', 'Example Journal');
  const trial = trialEditorialSummary('Rapamycin', 'RECRUITING', ['PHASE2']);
  assert.match(research, /does not establish.*effective or safe/i);
  assert.match(trial, /registration does not establish safety or effectiveness/i);
  assert.equal(normalizeTrialStatus('ACTIVE_NOT_RECRUITING'), 'Active Not Recruiting');
});

test('uniqueStrings removes empty and duplicate source values', () => {
  assert.deepEqual(uniqueStrings(['Czechia', 'Czechia', '', null, 'Germany']), ['Czechia', 'Germany']);
});

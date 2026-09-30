const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'institutional-pilot.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'institutional-pilot.js'), 'utf8');
const playbook = fs.readFileSync(path.join(root, 'docs', 'institutional-pilot-playbook.md'), 'utf8');
const build = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'api', 'intelligence.js'), 'utf8');

test('institutional pilot is unlisted and excluded from indexing', () => {
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.match(build, /institutional-pilot\.html/);
  assert.match(build, /'institutional-pilot\.html'\]\s*\.includes\(name\)/);
});

test('institutional pilot uses the live exercise dossier', () => {
  assert.match(script, /view', 'topic-dossier'/);
  assert.match(script, /topic', 'exercise'/);
  assert.match(script, /source_url/);
  assert.match(html, /One of our 180 longevity topics/);
});

test('institutional pilot explains the product and asks a concrete demo question', () => {
  assert.match(html, /Immortal\.life watches longevity research/i);
  assert.match(html, /Question to monitor: “What changed in exercise research for healthy ageing in the last six weeks/i);
  assert.match(html, /Every number is linked to its sources/i);
  assert.match(html, /This is not a data dump/i);
});

test('institutional pilot never presents an incomplete zero-filled snapshot as a successful example', () => {
  assert.match(script, /requiredCounts/);
  assert.match(script, /Number\(evidence\[field\]\) <= 0/);
  assert.match(script, /searchParams\.set\('q', 'exercise'\)/);
  assert.match(script, /exerciseTrials\.length/);
  assert.match(script, /listedParticipants/);
  assert.match(script, /\/trials\?search=exercise/);
  assert.match(script, /status=active/);
  assert.match(script, /The live pilot snapshot is incomplete/);
});

test('trial metric destinations open visibly filtered results', () => {
  assert.match(script, /Exercise-related trials'[\s\S]*\/trials\?search=exercise/);
  assert.match(script, /Active trials'[\s\S]*\/trials\?search=exercise&status=active/);
  assert.match(script, /People listed in trials'[\s\S]*\/trials\?search=exercise&metric=enrollment/);
});

test('research metric destinations open the matching evidence set', () => {
  assert.match(script, /Indexed research'[\s\S]*\/research\?topic=exercise/);
  assert.match(script, /Human studies'[\s\S]*\/research\?topic=exercise&evidence=human/);
  assert.match(proxy, /'evidence', 'access'/);
  assert.match(proxy, /view === 'research' && \(query\.evidence \|\| query\.access\)\) return null/);
  assert.match(proxy, /filteredResearch/);
});

test('institutional pilot states commercial and medical boundaries', () => {
  assert.match(html, /only sources explicitly approved for paid distribution/i);
  assert.match(html, /does not diagnose, prescribe, recommend treatment/i);
  assert.match(html, /Coverage stated/);
  assert.match(playbook, /must not be copied into paid reports/i);
  assert.match(playbook, /Do not call the work a systematic review/i);
});

test('institutional offer is specific and measurable', () => {
  assert.match(html, /€2,500–€5,000/);
  assert.match(html, /Six-week structure/);
  assert.match(html, /Closing summary/);
  assert.match(playbook, /Build a shortlist of 15 organisations/);
  assert.match(playbook, /Close one paid founding pilot/);
});

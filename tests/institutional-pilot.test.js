const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'institutional-pilot.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'institutional-pilot.js'), 'utf8');
const playbook = fs.readFileSync(path.join(root, 'docs', 'institutional-pilot-playbook.md'), 'utf8');
const build = fs.readFileSync(path.join(root, 'build.js'), 'utf8');

test('institutional pilot is unlisted and excluded from indexing', () => {
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.match(build, /institutional-pilot\.html/);
  assert.match(build, /'institutional-pilot\.html'\]\s*\.includes\(name\)/);
});

test('institutional pilot uses the live exercise dossier', () => {
  assert.match(script, /view', 'topic-dossier'/);
  assert.match(script, /topic', 'exercise'/);
  assert.match(script, /source_url/);
  assert.match(html, /Live example · Exercise and healthy ageing/);
});

test('institutional pilot explains the product and asks a concrete demo question', () => {
  assert.match(html, /Immortal\.life watches longevity research/i);
  assert.match(html, /What changed in exercise research for healthy ageing/i);
  assert.match(html, /Every number opens its sources/i);
  assert.match(html, /This is not a data dump/i);
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

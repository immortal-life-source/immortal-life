const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'institutional-pilot.html'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'institutional-pilot.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'institutional-pilot.js'), 'utf8');
const playbook = fs.readFileSync(path.join(root, 'docs', 'institutional-pilot-playbook.md'), 'utf8');
const build = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'api', 'intelligence.js'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'intelligence.js'), 'utf8');
const intelligenceTemplate = fs.readFileSync(path.join(root, 'intelligence-template.html'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'supabase', 'functions', 'public-pages', 'index.ts'), 'utf8');
const intelligence = fs.readFileSync(path.join(root, 'supabase', 'functions', 'public-intelligence', 'index.ts'), 'utf8');

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

test('decision views remain source-linked and use the same Exercise cohorts as their destinations', () => {
  for (const id of ['pilotMaturity', 'pilotChangePulse', 'pilotTrialLandscape', 'pilotTrialGeography', 'pilotEvidenceMix', 'pilotOutcomeThemes', 'pilotFieldDrivers', 'pilotUniversityHeatmap', 'pilotResultsGap']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /view', 'trial-results-gap'/);
  assert.match(script, /gapUrl\.searchParams\.set\('q', 'exercise'\)/);
  assert.match(script, /quality_rules', '20260930-field-context'/);
  assert.match(script, /renderMaturity/);
  assert.match(script, /renderPulse/);
  assert.match(script, /renderTrialLandscape/);
  assert.match(script, /renderTrialGeography/);
  assert.match(script, /renderEvidenceMix/);
  assert.match(script, /renderOutcomeThemes/);
  assert.match(script, /renderFieldDrivers/);
  assert.match(script, /renderUniversityConnections/);
  assert.match(script, /renderResultsGap/);
  assert.match(script, /\/trials\/results-gap\?search=exercise&status=possible-gap/);
  assert.match(script, /\/universities\/\$\{encodeURIComponent\(university\.slug\)\}\?topic=/);
  assert.match(intelligence, /university_connections: universityConnections/);
  assert.match(intelligence, /previous_by_record_type/);
  assert.match(intelligence, /baseline_ready: previousPulse\.length > 0/);
  assert.match(intelligence, /const gapSearch = publicSearchTerm/);
});

test('new field-context views link every aggregate to its matching source cohort', () => {
  assert.match(script, /status=active&country=\$\{encodeURIComponent\(country\)\}/);
  assert.match(script, /evidence=\$\{encodeURIComponent\(evidenceType\)\}/);
  assert.match(script, /focus=\$\{encodeURIComponent\(theme\.slug\)\}/);
  assert.match(script, /sponsor=\$\{encodeURIComponent\(sponsor\)\}/);
  assert.match(portal, /trialFocusPatterns/);
  assert.match(portal, /trialSponsorFilter/);
  assert.match(portal, /trialStructuredText/);
  assert.match(portal, /Study theme:/);
  assert.match(portal, /Sponsor:/);
  assert.match(intelligenceTemplate, /intelligence\.js\?v=20261001-pilot-field-filters/);
});

test('decision views state their limits rather than turning activity into efficacy claims', () => {
  assert.match(html, /Distinct record categories—not a conversion funnel/);
  assert.match(html, /Activity is not a ranking of research quality/);
  assert.match(script, /not whether the scientific conclusion improved/);
  assert.match(script, /baseline is not mature enough for an acceleration claim/);
  assert.match(script, /listed enrollment is not proof of completed participation/);
  assert.match(script, /not an allegation of misconduct/);
  assert.match(script, /not effectiveness scores/);
  assert.match(script, /is not allocated between countries/);
  assert.match(html, /indexed activity, not a ranking of scientific quality/);
});

test('institutional pilot explains the product and asks a concrete demo question', () => {
  assert.match(html, /Immortal\.life watches longevity research/i);
  assert.match(html, /Question to monitor: “What changed in exercise research for healthy ageing in the last six weeks/i);
  assert.match(html, /Every number is linked to its sources/i);
  assert.match(html, /This is not a data dump/i);
});

test('pilot hero fits the first screen and uses one display scale for its key questions', () => {
  assert.match(stylesheet, /--pilot-display-size:clamp\(28px,3\.2vw,44px\)/);
  assert.match(stylesheet, /\.pilot-hero\{[^}]*min-height:calc\(100svh - 72px\)[^}]*align-items:center/);
  assert.match(stylesheet, /\.pilot-hero h1\{[^}]*font-size:var\(--pilot-display-size\)/);
  assert.match(stylesheet, /#demoTitle\{font-size:var\(--pilot-display-size\)\}/);
  assert.match(stylesheet, /\.decision-story-heading h3\{[^}]*font-size:var\(--pilot-display-size\)/);
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

test('university examples open topic profiles without advertising unverified work-link totals', () => {
  assert.match(script, /universities\/\$\{encodeURIComponent\(record\.slug\)\}\?topic=exercise/);
  assert.match(script, /record\.city/);
  assert.doesNotMatch(script, /works_all_time \|\| 0\).*work links/);
  assert.match(script, /universityTotal/);
  assert.match(script, /Showing 3 leading profiles/);
});

test('pilot changes are explicitly a six-week topic window with a visible preview count', () => {
  assert.match(html, /What changed in the last six weeks/);
  assert.match(script, /newest of/);
  assert.match(script, /does not necessarily change the scientific conclusion/);
  assert.match(intelligence, /42 \* 86400000/);
  assert.match(intelligence, /contains\('topic_slugs', \[topic\]\)\.gte\('occurred_at', sixWeeksAgo\)/);
  assert.match(intelligence, /total_matching: timelineResult\.count/);
  assert.match(pages, /query = query\.contains\('topic_slugs', \[topic\]\)/);
  assert.match(pages, /changesPage\(supabase, url\)/);
});

test('legacy q trial links and current search links both remain filtered', () => {
  assert.match(portal, /trialParameters\.get\('search'\).*trialParameters\.get\('q'\)/);
  assert.match(portal, /params\.get\('search'\).*params\.get\('q'\)/);
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

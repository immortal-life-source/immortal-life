const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'institutional-pilot.html'), 'utf8');
const pilotTwoHtml = fs.readFileSync(path.join(root, 'institutional-pilot2.html'), 'utf8');
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
  assert.match(pilotTwoHtml, /noindex, nofollow, noarchive/);
  assert.match(build, /institutional-pilot\.html/);
  assert.match(build, /'institutional-pilot\.html', 'institutional-pilot2\.html'\]\s*\.includes\(name\)/);
});

test('institutional pilots use one topic-configurable live dossier renderer', () => {
  assert.match(script, /view', 'topic-dossier'/);
  assert.match(script, /topic', pilotTopic/);
  assert.match(script, /source_url/);
  assert.match(html, /One of our 180 longevity topics/);
  assert.match(html, /data-pilot-topic="exercise"/);
  assert.match(pilotTwoHtml, /data-pilot-topic="cognitive-training"/);
  assert.match(pilotTwoHtml, /is the field producing decision-ready human evidence/);
});

test('decision views remain source-linked and use the same Exercise cohorts as their destinations', () => {
  for (const id of ['pilotMaturity', 'pilotChangePulse', 'pilotTrialLandscape', 'pilotTrialGeography', 'pilotEvidenceMix', 'pilotOutcomeThemes', 'pilotFieldDrivers', 'pilotUniversityHeatmap', 'pilotResultsGap']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /view', 'trial-results-gap'/);
  assert.match(script, /gapUrl\.searchParams\.set\(trialApiCohortKey, pilotTopic\)/);
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
  assert.match(script, /gapRoute\('&status=possible-gap'\)/);
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
  assert.match(intelligenceTemplate, /intelligence\.js\?v=20261003-number-integrity-v6/);
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
  assert.match(script, /trialsUrl\.searchParams\.set\(trialApiCohortKey, pilotTopic\)/);
  assert.match(script, /pilotTopic === 'exercise' \? 'q' : 'topic'/);
  assert.match(script, /topicTrials\.length/);
  assert.match(script, /listedParticipants/);
  assert.match(script, /trialRoute/);
  assert.match(script, /status=active/);
  assert.match(script, /The live pilot snapshot is incomplete/);
});

test('trial metric destinations open visibly filtered results', () => {
  assert.match(script, /metric\(`\$\{pilotTopicName\}-related trials`[\s\S]*trialRoute\(\)/);
  assert.match(script, /Active trials'[\s\S]*trialRoute\('&status=active'\)/);
  assert.match(script, /People listed in trials'[\s\S]*trialRoute\('&metric=enrollment'\)/);
});

test('research metric destinations open the matching evidence set', () => {
  assert.match(script, /Indexed research'[\s\S]*researchRoute\(\)/);
  assert.match(script, /Human studies'[\s\S]*researchRoute\('&evidence=human'\)/);
  assert.match(proxy, /'evidence', 'access'/);
  assert.match(proxy, /view === 'research' && \(query\.evidence \|\| query\.access \|\| query\.published_from \|\| query\.published_to\)\) return null/);
  assert.match(proxy, /filteredResearch/);
});

test('university examples show verified topic work-link totals and open matching profiles', () => {
  assert.match(script, /universities\/\$\{encodeURIComponent\(record\.slug\)\}\?topic=\$\{pilotTopicEncoded\}/);
  assert.match(script, /record\.city/);
  assert.match(script, /record\.works_all_time/);
  assert.match(script, /pilotTopicName} work link/);
  assert.match(script, /live-item-count/);
  assert.match(script, /universityTotal/);
  assert.match(script, /Showing 3 leading profiles/);
});

test('sponsor visibility explains what a registration represents', () => {
  assert.match(script, /Sponsors with the most \$\{pilotTopicName\}-related clinical-trial registrations/);
  assert.match(script, /One registration is one clinical-study record matched to \$\{pilotTopicName\}/);
  assert.match(script, /not a paper, participant, or completed-study claim/);
});

test('pilot cache keys publish the sponsor and university count layout together', () => {
  assert.match(html, /institutional-pilot\.css\?v=20261001-driver-clarity/);
  assert.match(html, /institutional-pilot\.js\?v=20261001-exercise-recovery/);
  assert.match(pilotTwoHtml, /institutional-pilot\.js\?v=20261001-exercise-recovery/);
});

test('pilot two is a complete cognitive-training example with topic-filtered destinations', () => {
  assert.match(pilotTwoHtml, /Cognitive Training Intelligence Pilot/);
  assert.match(pilotTwoHtml, /What changed in cognitive-training research for healthy ageing in the last six weeks/);
  assert.match(pilotTwoHtml, /\/trials\?topic=cognitive-training/);
  assert.match(pilotTwoHtml, /\/trials\/results-gap\?topic=cognitive-training/);
  assert.match(script, /#resultsGapControls/);
  assert.match(pilotTwoHtml, /\/research\?topic=cognitive-training/);
  assert.match(pilotTwoHtml, /\/universities\?topic=cognitive-training/);
  assert.match(pilotTwoHtml, /\/changes\?topic=cognitive-training/);
  assert.doesNotMatch(pilotTwoHtml, /search=exercise|topic=exercise/);
});

test('cognitive-training outcome links map to supported portal filters', () => {
  for (const slug of ['memory-cognition', 'daily-function', 'dementia-risk', 'brain-signals', 'mood-wellbeing', 'feasibility-safety']) {
    assert.match(script, new RegExp(`slug: '${slug}'`));
    assert.match(portal, new RegExp(`'${slug}'`));
  }
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

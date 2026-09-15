const fs = require('fs');
const path = require('path');

const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!key) {
  console.error('Missing SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_ANON_KEY).');
  process.exit(1);
}

const outputDir = path.join(__dirname, 'dist');
const staticAssets = [
  'index.html',
  'join.html',
  'auth-x.html',
  'auth-linkedin.html',
  'dashboard.html',
  'leaderboard.html',
  'confirmed.html',
  'unsubscribed.html',
  'privacy.html',
  'style.css',
  'members.css',
  'main.js',
  'join.js',
  'auth-x.js',
  'auth-linkedin.js',
  'dashboard.js',
  'leaderboard.js',
  'news-modal.js',
  'spread-copy.js',
  'widget.js',
  'intelligence.css',
  'intelligence.js',
  'favicon.ico',
  'favicon.svg',
  'og-image.png',
  'linkedin-app-logo.png',
  'robots.txt',
  '9f2c4a7e61d84b73a5c901e8f426bd10.txt',
];

const intelligenceTemplate = fs.readFileSync(path.join(__dirname, 'intelligence-template.html'), 'utf8');
const contentTemplate = fs.readFileSync(path.join(__dirname, 'content-template.html'), 'utf8');
const intelligenceTopics = JSON.parse(fs.readFileSync(path.join(__dirname, 'intelligence-topics.json'), 'utf8'));

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplate(template, values, rawValues = {}) {
  let output = Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, htmlEscape(value)),
    template
  );
  output = Object.entries(rawValues).reduce((html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value)), output);
  return output;
}

function pageSchema(page) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': page.PAGE_VIEW === 'topic' ? 'CollectionPage' : 'WebPage',
    name: page.PAGE_TITLE,
    description: page.PAGE_DESCRIPTION,
    url: page.CANONICAL_URL,
    publisher: { '@type': 'Organization', name: 'immortal.life', url: 'https://immortal.life' },
    isAccessibleForFree: true,
  }).replace(/</g, '\\u003c');
}

function intelligencePage(values, topicDossierHtml = '') {
  return renderTemplate(intelligenceTemplate, values, {
    SCHEMA_JSON: pageSchema(values),
    TOPIC_DOSSIER_HTML: topicDossierHtml,
  });
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const asset of staticAssets) {
  fs.copyFileSync(path.join(__dirname, asset), path.join(outputDir, asset));
}

const intelligencePages = [
  {
    filename: 'research.html',
    PAGE_TITLE: 'Longevity Research Intelligence — immortal.life',
    PAGE_DESCRIPTION: 'Continuously updated longevity research, clinical trials, and evidence records with direct source provenance.',
    CANONICAL_URL: 'https://immortal.life/research',
    PAGE_VIEW: 'overview',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Autonomous evidence intelligence',
    PAGE_HEADING: 'The science, continuously updated.',
  },
  {
    filename: 'trials.html',
    PAGE_TITLE: 'Longevity Trial Radar — immortal.life',
    PAGE_DESCRIPTION: 'Automatically tracked clinical studies relevant to longevity and ageing, sourced from official trial registries.',
    CANONICAL_URL: 'https://immortal.life/trials',
    PAGE_VIEW: 'trials',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Clinical trial registry intelligence',
    PAGE_HEADING: 'Trial Radar.',
  },
  {
    filename: 'topics.html',
    PAGE_TITLE: 'Longevity Evidence Topics — immortal.life',
    PAGE_DESCRIPTION: 'A continuously updated index of longevity interventions, mechanisms, trials, and research topics.',
    CANONICAL_URL: 'https://immortal.life/topics',
    PAGE_VIEW: 'topics',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Immortal Index',
    PAGE_HEADING: 'Follow the evidence, not the noise.',
  },
  {
    filename: 'regulatory.html',
    PAGE_TITLE: 'EU & Czech Regulatory Watch — immortal.life',
    PAGE_DESCRIPTION: 'Automatically monitored official notices from European and Czech medicines regulators, with source provenance and topic matching.',
    CANONICAL_URL: 'https://immortal.life/regulatory',
    PAGE_VIEW: 'regulatory',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'EU and Czech official-source monitoring',
    PAGE_HEADING: 'Regulatory watch.',
  },
  {
    filename: 'integrity.html',
    PAGE_TITLE: 'Retractions & Research Integrity — immortal.life',
    PAGE_DESCRIPTION: 'Crossref and Retraction Watch-linked integrity signals for research indexed by immortal.life.',
    CANONICAL_URL: 'https://immortal.life/integrity',
    PAGE_VIEW: 'integrity',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Crossref-linked post-publication updates',
    PAGE_HEADING: 'Evidence changes. We track it.',
  },
  {
    filename: 'evidence-graph.html',
    PAGE_TITLE: 'Visual Longevity Evidence Graph — immortal.life',
    PAGE_DESCRIPTION: 'An automatically updated visual map connecting longevity topics, research, trials, regulatory notices, and integrity events.',
    CANONICAL_URL: 'https://immortal.life/evidence-graph',
    PAGE_VIEW: 'graph',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'A living map of the evidence',
    PAGE_HEADING: 'See how the field connects.',
  },
];

for (const page of intelligencePages) {
  fs.writeFileSync(path.join(outputDir, page.filename), intelligencePage(page));
}

const topicOutputDir = path.join(outputDir, 'topics');
fs.mkdirSync(topicOutputDir, { recursive: true });
for (const topic of intelligenceTopics) {
  const dossier = `<section class="intel-section topic-primer" aria-labelledby="topic-question">
    <div class="section-heading"><div><span class="section-index">Automated evidence frame</span><h2 id="topic-question">${htmlEscape(topic.question)}</h2></div><a class="section-link" href="/methodology">How this is generated</a></div>
    <div class="dossier-grid"><article><h3>Current evidence state</h3><p>${htmlEscape(topic.state)}</p></article><article><h3>Known limits</h3><p>${htmlEscape(topic.limits)}</p></article><article><h3>Regulatory context</h3><p>${htmlEscape(topic.regulatory)}</p></article></div>
    <aside class="automation-notice"><strong>Automated dossier</strong><p>This page is assembled from live source metadata. No scientist, clinician, researcher, editor, or human reviewer evaluates it before publication. Verify consequential details at the cited source.</p></aside>
  </section>`;
  fs.writeFileSync(
    path.join(topicOutputDir, `${topic.slug}.html`),
    intelligencePage({
      PAGE_TITLE: `${topic.name} Research & Trials — immortal.life`,
      PAGE_DESCRIPTION: topic.description,
      CANONICAL_URL: `https://immortal.life/topics/${topic.slug}`,
      PAGE_VIEW: 'topic',
      TOPIC_SLUG: topic.slug,
      PAGE_KICKER: 'Continuously updated topic dossier',
      PAGE_HEADING: topic.name,
    }, dossier)
  );
}

const contentPages = [
  {
    filename: 'methodology.html', title: 'Methodology — immortal.life', heading: 'How the index works.', kicker: 'Transparent automated methodology',
    description: 'How immortal.life automatically discovers, classifies, links, updates, and publishes longevity intelligence without human review.',
    body: `<h2>What the system does</h2><p>immortal.life retrieves public metadata from named literature databases, trial registries, Crossref-linked integrity records, and official regulatory feeds. Automated matching rules connect records to tracked topics, normalize dates and identifiers, and publish the resulting index.</p><h2>What the system does not do</h2><p>No scientist, clinician, researcher, editor, or human reviewer screens individual records before publication. The system does not reproduce a peer-review process, judge clinical suitability, or provide personal medical advice.</p><h2>Evidence labels</h2><p>Labels describe source metadata and study design signals: synthesis, randomized human study, human study, preclinical research, preprint, or general research record. They are navigation aids, not quality scores or treatment recommendations.</p><h2>Topic matching</h2><p>Records are matched using transparent topic queries and normalized keywords. A match means relevance to a tracked query, not support for a claim. False positives and omissions are possible.</p><h2>Freshness and provenance</h2><p>Each record retains a direct source URL and update timestamps. Feed health is shown publicly. If live data cannot be retrieved, the interface does not substitute uncited claims.</p><h2>Known limitations</h2><p>Source metadata can be incomplete, delayed, duplicated, corrected, or wrong. Automated summaries may omit context. Registration does not establish trial quality, safety, effectiveness, completion, or approval.</p>`
  },
  {
    filename: 'automation.html', title: 'Automation disclosure — immortal.life', heading: 'Built by systems, not a newsroom.', kicker: 'Permanent publication disclosure',
    description: 'A clear disclosure of how immortal.life operates as a fully automated longevity intelligence website.',
    body: `<div class="automation-notice automation-notice--large"><strong>There is no human review layer.</strong><p>immortal.life does not employ scientists, clinicians, researchers, editors, fact-checkers, or human reviewers to evaluate individual records or briefings before publication.</p></div><h2>Automated outputs</h2><p>Ingestion, classification, source synopses, topic pages, record pages, weekly briefings, feeds, graphs, and indexing notifications are produced automatically from configured source data and deterministic publication rules.</p><h2>What that means for readers</h2><p>Use immortal.life to discover and navigate source records. Do not rely on it as the sole basis for a health, medical, legal, financial, or research decision. Verify material facts at the linked original source and consult an appropriately qualified professional when needed.</p><h2>Accountability</h2><p>Automation does not remove responsibility for correcting the service. Reports can be sent to <a href="mailto:research@immortal.life">research@immortal.life</a>; source updates and integrity signals are also ingested automatically.</p>`
  },
  {
    filename: 'publication-policy.html', title: 'Automated publication policy — immortal.life', heading: 'Rules for publishing without reviewers.', kicker: 'Publication policy',
    description: 'The automated publication, sourcing, corrections, conflicts, and medical-safety rules used by immortal.life.',
    body: `<h2>Source-first publication</h2><p>Every intelligence record must retain a direct link to a named source. The system does not invent missing study outcomes or replace unavailable feeds with uncited material.</p><h2>Neutrality</h2><p>Indexing does not imply endorsement. Commercial popularity, social engagement, and promotional claims do not determine evidence labels. Sponsored ranking is not part of the intelligence index.</p><h2>Medical safety</h2><p>The service publishes research information, not diagnosis, treatment, dosing, prescribing, or individualized recommendations. Trial entries and regulatory notices must not be represented as proof of safety, effectiveness, or approval beyond the cited official record.</p><h2>Automation and conflicts</h2><p>No human author or reviewer is assigned to automated records. Machine-produced synopses are identified as such. Any future commercial relationship affecting display or ranking must be labelled separately.</p><h2>Corrections</h2><p>Updated source metadata can replace earlier fields automatically. Retractions, withdrawals, corrections, and expressions of concern remain visible as integrity events rather than being silently erased.</p>`
  },
  {
    filename: 'corrections.html', title: 'Corrections — immortal.life', heading: 'Evidence changes. The record should show it.', kicker: 'Corrections and integrity',
    description: 'How immortal.life automatically processes source corrections and accepts reports about indexed records.',
    body: `<h2>Automatic corrections</h2><p>Repeated source synchronization updates changed metadata. Crossref-linked retractions, withdrawals, corrections, expressions of concern, and updates are published in the research integrity feed and linked where possible.</p><h2>Report a problem</h2><p>Email <a href="mailto:research@immortal.life?subject=Correction%20report">research@immortal.life</a> with the immortal.life URL, original source URL, and the field you believe is wrong. Reports are operational input, not a promise of expert or medical review.</p><h2>Preserving context</h2><p>Material integrity events remain visible. A corrected source may update the current record while the related event continues to document that the evidence changed.</p>`
  },
  {
    filename: 'data.html', title: 'Open discovery feeds and API — immortal.life', heading: 'Build from the living index.', kicker: 'Machine-readable access',
    description: 'RSS, JSON Feed, sitemap, record JSON, and citation-ready source identifiers from immortal.life.',
    body: `<h2>Public feeds</h2><p><a href="/feed.xml">RSS 2.0</a>, <a href="/feed.atom">Atom</a>, and <a href="/feed.json">JSON Feed</a> publish the newest research, trial, regulatory, and integrity records automatically.</p><h2>Record JSON and citations</h2><p>Every permanent record URL has a machine-readable counterpart: <code>/api/intelligence/{type}/{id}</code>, where type is research, trials, regulatory, or integrity. Research records also offer BibTeX and RIS exports from their detail page.</p><h2>Embeddable latest-records widget</h2><p>Partners can add <code>&lt;script src=&quot;https://immortal.life/widget.js&quot; defer&gt;&lt;/script&gt;</code> and <code>&lt;immortal-life-feed limit=&quot;5&quot;&gt;&lt;/immortal-life-feed&gt;</code>. The widget links every item back to its permanent source-backed record.</p><h2>Discovery</h2><p><a href="/sitemap.xml">The dynamic sitemap</a> is generated from current database records. Search-engine notifications are submitted automatically when records change.</p><h2>Responsible reuse</h2><p>Source metadata remains subject to the originating source's terms. Attribute the primary source, preserve integrity and regulatory context, and do not imply that automated inclusion is expert endorsement.</p>`
  }
];

for (const page of contentPages) {
  const values = { PAGE_TITLE: page.title, PAGE_DESCRIPTION: page.description, CANONICAL_URL: `https://immortal.life/${page.filename.replace(/\.html$/, '')}`, PAGE_KICKER: page.kicker, PAGE_HEADING: page.heading };
  fs.writeFileSync(path.join(outputDir, page.filename), renderTemplate(contentTemplate, values, { BODY_HTML: page.body, SCHEMA_JSON: pageSchema({ ...values, PAGE_VIEW: 'page' }) }));
}

fs.writeFileSync(
  path.join(outputDir, 'il-config.js'),
  `window.IL_SUPABASE_ANON_KEY = ${JSON.stringify(key)};
window.IL_FN_BASE = 'https://nifbuyoghesveotugday.supabase.co/functions/v1';
window.ilFnHeaders = function ilFnHeaders() {
  var h = { 'Content-Type': 'application/json' };
  var k = window.IL_SUPABASE_ANON_KEY;
  if (k) {
    h.apikey = k;
  }
  return h;
};
`
);

console.log(`Static site written to ${outputDir}`);

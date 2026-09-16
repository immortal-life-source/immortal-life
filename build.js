const fs = require('fs');
const path = require('path');

const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const site = 'https://www.immortal.life';

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
  'telemetry.js',
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
  if (page.PAGE_VIEW === 'dataset') {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'DataCatalog',
      name: 'immortal.life longevity intelligence datasets',
      description: page.PAGE_DESCRIPTION,
      url: page.CANONICAL_URL,
      creator: { '@type': 'Organization', name: 'immortal.life', url: site },
      dataset: ['research', 'trials', 'regulatory', 'integrity'].map((kind) => ({
        '@type': 'Dataset',
        name: `immortal.life ${kind} dataset`,
        description: `Automatically updated, source-linked ${kind} records that passed the immortal.life publication-quality checks.`,
        url: `${site}/datasets/${kind}.json`,
        isAccessibleForFree: true,
        distribution: [
          { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${site}/datasets/${kind}.json` },
          { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${site}/datasets/${kind}.csv` },
        ],
      })),
    }).replace(/</g, '\\u003c');
  }
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': page.PAGE_VIEW === 'topic' ? 'CollectionPage' : 'WebPage',
    name: page.PAGE_TITLE,
    description: page.PAGE_DESCRIPTION,
    url: page.CANONICAL_URL,
    publisher: { '@type': 'Organization', name: 'immortal.life', url: site },
    isAccessibleForFree: true,
  }).replace(/</g, '\\u003c');
}

function intelligencePage(values, topicDossierHtml = '') {
  const resolved = { SOCIAL_IMAGE_URL: `${site}/og-image.png`, ...values };
  return renderTemplate(intelligenceTemplate, resolved, {
    SCHEMA_JSON: pageSchema(resolved),
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
    PAGE_DESCRIPTION: 'Explore automatically updated longevity research and clinical trials, with a direct link to every original source.',
    CANONICAL_URL: `${site}/research`,
    PAGE_VIEW: 'overview',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Longevity research, updated automatically',
    PAGE_HEADING: 'See what is changing in longevity research.',
  },
  {
    filename: 'trials.html',
    PAGE_TITLE: 'Longevity Trial Radar — immortal.life',
    PAGE_DESCRIPTION: 'Find clinical studies connected to longevity and healthy ageing, sourced from official trial registries.',
    CANONICAL_URL: `${site}/trials`,
    PAGE_VIEW: 'trials',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Clinical studies from official registries',
    PAGE_HEADING: 'Find longevity-related clinical trials.',
  },
  {
    filename: 'topics.html',
    PAGE_TITLE: 'Longevity Evidence Topics — immortal.life',
    PAGE_DESCRIPTION: 'Choose a topic to see its latest research, clinical trials, limitations, and regulatory context.',
    CANONICAL_URL: `${site}/topics`,
    PAGE_VIEW: 'topics',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Topic guides',
    PAGE_HEADING: 'Explore longevity one question at a time.',
  },
  {
    filename: 'regulatory.html',
    PAGE_TITLE: 'EU & Czech Regulatory Watch — immortal.life',
    PAGE_DESCRIPTION: 'Official notices from European and Czech medicines regulators, monitored automatically and linked to their original sources.',
    CANONICAL_URL: `${site}/regulatory`,
    PAGE_VIEW: 'regulatory',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Official EU and Czech notices',
    PAGE_HEADING: 'See when regulatory information changes.',
  },
  {
    filename: 'integrity.html',
    PAGE_TITLE: 'Retractions & Research Integrity — immortal.life',
    PAGE_DESCRIPTION: 'Crossref and Retraction Watch-linked integrity signals for research indexed by immortal.life.',
    CANONICAL_URL: `${site}/integrity`,
    PAGE_VIEW: 'integrity',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Corrections and retractions',
    PAGE_HEADING: 'When evidence changes, see the change.',
  },
  {
    filename: 'evidence-graph.html',
    PAGE_TITLE: 'Visual Longevity Evidence Graph — immortal.life',
    PAGE_DESCRIPTION: 'An automatically updated visual map connecting longevity topics, research, trials, regulatory notices, and integrity events.',
    CANONICAL_URL: `${site}/evidence-graph`,
    PAGE_VIEW: 'graph',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Evidence connections',
    PAGE_HEADING: 'See how topics and sources connect.',
  },
  {
    filename: 'entities.html',
    PAGE_TITLE: 'Longevity Entity Index — immortal.life',
    PAGE_DESCRIPTION: 'Automatically generated pages for longevity topics, journals, trial sponsors, and source organizations.',
    CANONICAL_URL: `${site}/entities`,
    PAGE_VIEW: 'entities',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Evidence directory',
    PAGE_HEADING: 'Explore the topics and sources in the index.',
  },
  {
    filename: 'resources.html',
    PAGE_TITLE: 'Global Longevity Resource Atlas — immortal.life',
    PAGE_DESCRIPTION: 'Find official global research databases, trial registries, and medicines regulators, with clear notes about geographic coverage.',
    CANONICAL_URL: `${site}/resources`,
    PAGE_VIEW: 'resources',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Global source directory',
    PAGE_HEADING: 'Know the source and where it applies.',
  },
  {
    filename: 'quality.html',
    PAGE_TITLE: 'Automated Quality Checks — immortal.life',
    PAGE_DESCRIPTION: 'See how many records were shown, withheld, grouped as duplicates, or delayed by the automated quality checks.',
    CANONICAL_URL: `${site}/quality`,
    PAGE_VIEW: 'quality',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Quality checks you can see',
    PAGE_HEADING: 'See what the system published—and what it held back.',
  },
];

for (const page of intelligencePages) {
  fs.writeFileSync(path.join(outputDir, page.filename), intelligencePage(page));
}

const topicOutputDir = path.join(outputDir, 'topics');
fs.mkdirSync(topicOutputDir, { recursive: true });
for (const topic of intelligenceTopics) {
  const dossier = `<section class="intel-section topic-primer" aria-labelledby="topic-question">
    <div class="section-heading"><div><span class="section-index">The question we track</span><h2 id="topic-question">${htmlEscape(topic.question)}</h2></div><a class="section-link" href="/methodology">How records are chosen</a></div>
    <div class="dossier-grid"><article><h3>What the records show</h3><p>${htmlEscape(topic.state)}</p></article><article><h3>What is still uncertain</h3><p>${htmlEscape(topic.limits)}</p></article><article><h3>Regulatory position</h3><p>${htmlEscape(topic.regulatory)}</p></article></div>
    <aside class="automation-notice"><strong>Built automatically from source records</strong><p>No scientist, clinician, researcher, editor, or human reviewer evaluates this page before publication. Check important details at the linked original source.</p><p><a class="section-link" href="/feeds/topics/${topic.slug}.xml">Follow this topic by RSS</a> · <a class="section-link" href="/feeds/topics/${topic.slug}.json">Use the JSON feed</a> · <a class="section-link" href="/dashboard">Add it to your private radar</a></p></aside>
  </section>`;
  fs.writeFileSync(
    path.join(topicOutputDir, `${topic.slug}.html`),
    intelligencePage({
      PAGE_TITLE: `${topic.name} Research & Trials — immortal.life`,
      PAGE_DESCRIPTION: topic.description,
      CANONICAL_URL: `${site}/topics/${topic.slug}`,
      PAGE_VIEW: 'topic',
      TOPIC_SLUG: topic.slug,
      PAGE_KICKER: 'Automatically updated topic guide',
      PAGE_HEADING: topic.name,
      SOCIAL_IMAGE_URL: `${site}/social-card/entity/topic-${topic.slug}.png`,
    }, dossier)
  );
}

const contentPages = [
  {
    filename: 'methodology.html', title: 'How immortal.life works', heading: 'How records reach the website.', kicker: 'A transparent automatic process',
    description: 'How immortal.life automatically discovers, classifies, links, updates, and publishes longevity intelligence without human review.',
    body: `<h2>1. Records are collected</h2><p>immortal.life reads public information from named research databases, trial registries, correction services, and official regulatory feeds. Every published item keeps a direct link to its original source.</p><h2>2. Topic relevance is checked</h2><p>The system looks for topic terms in titles, summaries, source keywords, and study types. Broad subjects such as sleep, exercise, stem cells, or gene therapy must also mention ageing, longevity, healthspan, or frailty in the title or summary.</p><h2>3. Weak matches are held back</h2><p>A record needs a topic-match score of at least 60% to appear publicly. Lower-scoring records are withheld from pages, counts, feeds, briefings, graphs, search notifications, and the sitemap.</p><h2>4. Repeated records are grouped</h2><p>DOIs, trial identifiers, and simplified titles help identify duplicate or near-duplicate entries. One main record is shown; the repeated versions are withheld.</p><h2>5. Readers can inspect the result</h2><p>Each record explains why it appeared, shows its topic-match percentage, and links to the source. These figures help organise information; they do not rate safety, effectiveness, or scientific quality. Overall results appear on the <a href="/quality">quality checks page</a>.</p><h2>No human review before publication</h2><p>No scientist, clinician, researcher, editor, or human reviewer screens individual records before they appear. The website is a discovery tool, not a peer-review service or a source of personal medical advice.</p><h2>Known limitations</h2><p>Source information can be incomplete, delayed, duplicated, corrected, or wrong. A registered trial is not proof of quality, safety, effectiveness, completion, or regulatory approval. Always check important details at the original source.</p>`
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
    view: 'dataset',
    body: `<h2>Public feeds</h2><p><a href="/feed.xml">RSS 2.0</a>, <a href="/feed.atom">Atom</a>, and <a href="/feed.json">JSON Feed</a> publish the newest eligible research, trial, regulatory, and integrity records automatically. Every topic page also provides its own RSS, Atom, and JSON feed.</p><h2>Download current datasets</h2><p><a data-il-event="download_dataset" href="/datasets/research.csv">Research CSV</a> · <a data-il-event="download_dataset" href="/datasets/trials.csv">Trials CSV</a> · <a data-il-event="download_dataset" href="/datasets/regulatory.csv">Regulatory CSV</a> · <a data-il-event="download_dataset" href="/datasets/integrity.csv">Integrity CSV</a></p><p>The same datasets are available as JSON by replacing <code>.csv</code> with <code>.json</code>. Downloads contain published, quality-eligible records only and refresh automatically.</p><h2>Record JSON and citations</h2><p>Every permanent record URL has a machine-readable counterpart: <code>/api/intelligence/{type}/{id}</code>, where type is research, trials, regulatory, or integrity. Research records also offer BibTeX and RIS exports from their detail page.</p><h2>Embeddable live widgets</h2><p>Add <code>&lt;script src=&quot;${site}/widget.js&quot; defer&gt;&lt;/script&gt;</code> once, followed by <code>&lt;immortal-life-feed limit=&quot;5&quot;&gt;&lt;/immortal-life-feed&gt;</code>. Add a topic with <code>topic=&quot;rapamycin&quot;</code>, or show a dataset with <code>kind=&quot;trials&quot;</code> and an optional <code>country=&quot;Czechia&quot;</code>. Every item links to its permanent source-backed record.</p><h2>Discovery and indexing</h2><p><a href="/sitemap.xml">The sitemap index</a> separates topics, research, trials, regulatory records, integrity records, briefings, entities and static pages so discovery health can be measured independently.</p><h2>Responsible reuse</h2><p>Source metadata remains subject to the originating source's terms. Attribute the primary source, preserve integrity and regulatory context, and do not imply that automated inclusion is expert endorsement.</p>`
  }
];

for (const page of contentPages) {
  const values = { PAGE_TITLE: page.title, PAGE_DESCRIPTION: page.description, CANONICAL_URL: `${site}/${page.filename.replace(/\.html$/, '')}`, PAGE_KICKER: page.kicker, PAGE_HEADING: page.heading };
  fs.writeFileSync(path.join(outputDir, page.filename), renderTemplate(contentTemplate, values, { BODY_HTML: page.body, SCHEMA_JSON: pageSchema({ ...values, PAGE_VIEW: page.view || 'page' }) }));
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

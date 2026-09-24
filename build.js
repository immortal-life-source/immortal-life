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
  'members-nav.js',
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
      dataset: ['research', 'trials', 'regulatory', 'integrity', 'universities'].map((kind) => ({
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
    PAGE_DESCRIPTION: 'A plain map of new longevity papers and clinical studies. Every item links to the original source so you can check the details yourself.',
    CANONICAL_URL: `${site}/research`,
    PAGE_VIEW: 'overview',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Longevity research, updated automatically',
    PAGE_HEADING: 'Follow new longevity research without getting lost.',
  },
  {
    filename: 'trials.html',
    PAGE_TITLE: 'Longevity Trial Radar — immortal.life',
    PAGE_DESCRIPTION: 'Find longevity-related clinical studies from official registries, then open the source record for eligibility, phase, status, and locations.',
    CANONICAL_URL: `${site}/trials`,
    PAGE_VIEW: 'trials',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Clinical studies from official registries',
    PAGE_HEADING: 'See which longevity trials are being registered.',
  },
  {
    filename: 'topics.html',
    PAGE_TITLE: 'Longevity Evidence Topics — immortal.life',
    PAGE_DESCRIPTION: 'Choose one longevity question at a time and see the latest source-linked papers, trials, uncertainties, and regulatory notes.',
    CANONICAL_URL: `${site}/topics`,
    PAGE_VIEW: 'topics',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Topic guides',
    PAGE_HEADING: 'Explore longevity one question at a time.',
  },
  {
    filename: 'regulatory.html',
    PAGE_TITLE: 'Global Regulatory Watch — immortal.life',
    PAGE_DESCRIPTION: 'Official medicines authorities, regulatory notices, approval databases, and safety sources from around the world, monitored automatically and linked to their original records.',
    CANONICAL_URL: `${site}/regulatory`,
    PAGE_VIEW: 'regulatory',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Official regulatory sources worldwide',
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
    PAGE_DESCRIPTION: 'A visual map showing how longevity topics connect to papers, trials, regulatory notices, and corrections.',
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
    filename: 'universities.html',
    PAGE_TITLE: 'Global University Longevity Research Index — immortal.life',
    PAGE_DESCRIPTION: 'Explore which universities appear most often in source-matched longevity research, with filters by topic, country, and region.',
    CANONICAL_URL: `${site}/universities`,
    PAGE_VIEW: 'universities',
    TOPIC_SLUG: '',
    PAGE_KICKER: 'Global University Research Index',
    PAGE_HEADING: 'Where can you learn from university research?',
  },
  {
    filename: 'resources.html',
    PAGE_TITLE: 'Global Longevity Resource Atlas — immortal.life',
    PAGE_DESCRIPTION: 'Find official databases, trial registries, regulators, reviews, and ageing datasets. Each source explains what region or task it covers.',
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
    <aside class="automation-notice"><strong>Built automatically from source records</strong><p>No scientist, clinician, researcher, editor, or human reviewer evaluates this page before publication. Check important details at the linked original source.</p><div class="topic-follow-actions"><button class="section-link save-topic-button" type="button" data-save-topic="${topic.slug}" data-topic-name="${htmlEscape(topic.name)}">☆ Save this topic</button><a class="section-link" href="/feeds/topics/${topic.slug}.xml">Follow by RSS</a><a class="section-link" href="/dashboard">Add to My Radar</a></div></aside>
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
    filename: 'learn.html', title: 'Longevity 101 — immortal.life', heading: 'Start learning longevity here.', kicker: 'A student guide to the field',
    description: 'A plain-language route through longevity science, evidence, clinical trials, universities, safety signals, and official sources.',
    body: `<section class="learn-path"><div class="learn-intro"><span class="section-index">New to the field</span><h2>Use immortal.life as a map, not as medical advice.</h2><div class="learn-intro-copy"><p>Longevity research asks whether ageing biology can be measured, slowed, repaired, or made less harmful. The field is exciting, but it is also full of early results, animal work, incomplete trials, and claims that can sound stronger than the evidence. This page gives you a calm route through the website.</p><div class="learn-silhouette" aria-hidden="true"><span class="learn-silhouette__halo"></span><span class="learn-silhouette__head"></span><span class="learn-silhouette__torso"></span><span class="learn-silhouette__arm learn-silhouette__arm--left"></span><span class="learn-silhouette__arm learn-silhouette__arm--right"></span><span class="learn-silhouette__leg learn-silhouette__leg--left"></span><span class="learn-silhouette__leg learn-silhouette__leg--right"></span><span class="learn-silhouette__node learn-silhouette__node--one"></span><span class="learn-silhouette__node learn-silhouette__node--two"></span><span class="learn-silhouette__node learn-silhouette__node--three"></span></div></div></div><div class="learn-steps"><article><span>01</span><h3>Understand the basic question</h3><p>Start with the idea that ageing is a set of biological processes: inflammation, cellular senescence, DNA damage, protein quality control, metabolism, stem-cell exhaustion, and tissue repair. No single topic explains everything.</p><a class="section-link" href="/topics">Explore topic guides</a></article><article><span>02</span><h3>Learn how evidence levels differ</h3><p>A mouse study, a cell study, an observational human study, and a randomized human trial do not answer the same question. Look for population, study design, endpoints, duration, and whether the record is peer reviewed.</p><a class="section-link" href="/research">Read research records</a></article><article><span>03</span><h3>Use trials carefully</h3><p>A registered trial means someone planned or ran a study. It does not prove that a treatment works, is safe, is complete, or is approved. Always open the registry source for eligibility, intervention, location, and status.</p><a class="section-link" href="/trials">Open Trial Radar</a></article><article><span>04</span><h3>See where universities are active</h3><p>The university index helps you discover institutions publishing in longevity topics. Treat it as a landscape map, not a ranking of teaching quality, clinical care, or scientific truth.</p><a class="section-link" href="/universities">Compare universities</a></article><article><span>05</span><h3>Check safety and regulation</h3><p>Regulatory pages point to official notices and authorities. A therapy may be studied in one setting and still not be approved for longevity use. The original authority is the source that matters.</p><a class="section-link" href="/regulatory">Check regulatory updates</a></article><article><span>06</span><h3>Follow changes over time</h3><p>Research changes: trials are updated, papers are corrected, and weak matches are held back. Use the change log, quality page, and weekly briefings to see what moved recently.</p><a class="section-link" href="/changes">See what changed</a></article></div><section class="learning-quiz" data-learning-quiz><span class="section-index">Quick check</span><h3>Can you read the evidence signal?</h3><div class="quiz-question" data-answer="false"><p>A registered clinical trial proves a treatment works.</p><button type="button" data-choice="true">True</button><button type="button" data-choice="false">False</button><small>Registration shows that a study was planned or run; it does not prove safety or effectiveness.</small></div><div class="quiz-question" data-answer="true"><p>A randomized human study usually answers a different question from a mouse study.</p><button type="button" data-choice="true">True</button><button type="button" data-choice="false">False</button><small>Study design and population determine what a result can support.</small></div><div class="quiz-question" data-answer="true"><p>You should open the original source before relying on a record.</p><button type="button" data-choice="true">True</button><button type="button" data-choice="false">False</button><small>immortal.life is a discovery map; consequential details belong to the original source.</small></div></section><aside class="automation-notice"><strong>How this website works</strong><p>immortal.life is fully automated. It collects and organises source-linked records without scientists, clinicians, editors, or human reviewers approving individual items. That is why every important page asks you to open the original source.</p></aside></section><section class="intel-section"><div class="section-heading"><div><span class="section-index">Suggested first session</span><h2>A 30-minute route through the site</h2></div><a class="section-link" href="/resources">Find official sources</a></div><ol class="student-route"><li><strong>5 minutes:</strong> pick one topic that interests you, such as rapamycin, senolytics, exercise, or epigenetic clocks.</li><li><strong>10 minutes:</strong> open three research records and compare study type, population, and uncertainty.</li><li><strong>5 minutes:</strong> check whether any related trials are recruiting and what the registry actually says.</li><li><strong>5 minutes:</strong> open the university index to see which institutions appear in that topic.</li><li><strong>5 minutes:</strong> look at regulation, corrections, and source limitations before forming an opinion.</li></ol></section><section class="intel-section color-routes"><div><span>Biology</span><p>Mechanisms, cells, repair, metabolism, ageing clocks.</p></div><div><span>Evidence</span><p>Papers, trials, systematic reviews, uncertainty.</p></div><div><span>Safety</span><p>Regulation, corrections, retractions, limitations.</p></div><div><span>Landscape</span><p>Universities, sources, datasets, briefings.</p></div></section>`
  },
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
    body: `<h2>Public feeds</h2><p><a href="/feed.xml">RSS 2.0</a>, <a href="/feed.atom">Atom</a>, and <a href="/feed.json">JSON Feed</a> publish the newest eligible research, trial, regulatory, and integrity records automatically. Every topic page also provides its own RSS, Atom, and JSON feed.</p><h2>Download current datasets</h2><p><a data-il-event="download_dataset" href="/datasets/research.csv">Research CSV</a> · <a data-il-event="download_dataset" href="/datasets/trials.csv">Trials CSV</a> · <a data-il-event="download_dataset" href="/datasets/regulatory.csv">Regulatory CSV</a> · <a data-il-event="download_dataset" href="/datasets/integrity.csv">Integrity CSV</a></p><p>The same datasets are available as JSON by replacing <code>.csv</code> with <code>.json</code>. Downloads contain published, quality-eligible records only and refresh automatically.</p><h2 id="university-data">Global University Research Index</h2><p><a data-il-event="download_dataset" href="/datasets/universities.csv">University index CSV</a> · <a data-il-event="download_dataset" href="/datasets/universities.json">University index JSON</a></p><p>The university export includes source identifiers, location, five-year activity, topic breadth, recent momentum, open-access sample, citation context, and the transparent composite score. These are bibliometric discovery signals, not ratings of institutional or research quality.</p><h2>Record JSON and citations</h2><p>Every permanent record URL has a machine-readable counterpart: <code>/api/intelligence/{type}/{id}</code>, where type is research, trials, regulatory, or integrity. Research records also offer BibTeX and RIS exports from their detail page.</p><h2>Embeddable live widgets</h2><p>Add <code>&lt;script src=&quot;${site}/widget.js&quot; defer&gt;&lt;/script&gt;</code> once, followed by <code>&lt;immortal-life-feed limit=&quot;5&quot;&gt;&lt;/immortal-life-feed&gt;</code>. Add a topic with <code>topic=&quot;rapamycin&quot;</code>, or show a dataset with <code>kind=&quot;trials&quot;</code> and an optional <code>country=&quot;Czechia&quot;</code>. Every item links to its permanent source-backed record.</p><h2>Discovery and indexing</h2><p><a href="/sitemap.xml">The sitemap index</a> separates topics, research, trials, regulatory records, integrity records, briefings, universities, entities and static pages so discovery health can be measured independently.</p><h2>Responsible reuse</h2><p>Source metadata remains subject to the originating source's terms. Attribute the primary source, preserve integrity and regulatory context, and do not imply that automated inclusion is expert endorsement.</p>`
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

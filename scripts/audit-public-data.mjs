#!/usr/bin/env node

const origin = String(process.argv[2] || 'https://www.immortal.life').replace(/\/$/, '');
const pageConcurrency = 24;
const dossierConcurrency = 4;
const timeoutMs = 15_000;

function locations(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

async function request(url, { json = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { headers: { Accept: json ? 'application/json' : 'text/html,application/xhtml+xml' }, signal: controller.signal });
    const body = await response.text();
    const elapsedMs = Math.round(performance.now() - startedAt);
    let data = null;
    if (json) {
      try { data = JSON.parse(body); } catch { /* reported by caller */ }
    }
    return { url, status: response.status, ok: response.ok, elapsedMs, body, data };
  } catch (error) {
    return { url, status: 0, ok: false, elapsedMs: Math.round(performance.now() - startedAt), error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

const sitemapIndex = await request(`${origin}/sitemap.xml`);
if (!sitemapIndex.ok) throw new Error(`Unable to load sitemap index: ${sitemapIndex.status || sitemapIndex.error}`);
const sitemapUrls = locations(sitemapIndex.body);
const sitemapResults = await mapConcurrent(sitemapUrls, 6, (url) => request(url));
const pageUrls = [...new Set(sitemapResults.flatMap((result) => result.ok ? locations(result.body) : []))];
const failurePhrases = [
  'The intelligence feed is temporarily unavailable',
  'The verified evidence snapshot is temporarily unavailable',
  'The complete university index is reconnecting',
  'Loading the latest source records',
];
const pageResults = await mapConcurrent(pageUrls, pageConcurrency, async (url, index) => {
  const result = await request(url);
  if (index > 0 && index % 1000 === 0) console.error(`Checked ${index.toLocaleString()} of ${pageUrls.length.toLocaleString()} sitemap pages`);
  return {
    url: result.url, status: result.status, ok: result.ok, elapsedMs: result.elapsedMs, error: result.error,
    warnings: failurePhrases.filter((phrase) => result.body?.includes(phrase)),
  };
});
const rawPageFailures = pageResults.filter((result) => !result.ok);
// Ingestion and taxonomy reindexing can legitimately quarantine a record
// while this multi-minute audit is traversing tens of thousands of URLs. A
// 404 is only a broken sitemap URL if a fresh end-of-run sitemap still lists
// it. This prevents a healthy publication-state transition from being
// reported as a loading failure.
const refreshedSitemapResults = rawPageFailures.some((result) => result.status === 404)
  ? await mapConcurrent(sitemapUrls, 6, (url) => request(`${url}${url.includes('?') ? '&' : '?'}audit=${Date.now()}`))
  : sitemapResults;
const refreshedPageUrls = new Set(refreshedSitemapResults.flatMap((result) => result.ok ? locations(result.body) : []));
const retiredDuringAudit = rawPageFailures.filter((result) => result.status === 404 && !refreshedPageUrls.has(result.url));
const retiredUrls = new Set(retiredDuringAudit.map((result) => result.url));
const pageFailures = rawPageFailures.filter((result) => !retiredUrls.has(result.url));
// Static application shells contain hidden recovery copy which becomes
// visible only when a data request fails. Its presence in raw HTML is not a
// live failure; the data-view and dossier checks below verify the requests
// that decide whether that recovery state is shown.
const embeddedRecoveryCopy = pageResults.flatMap((result) => result.warnings.map((phrase) => ({ url: result.url, phrase })));

const views = [
  ['overview', 'view=overview&limit=12'],
  ['topics', 'view=topics'],
  ['research', 'view=research&limit=12'],
  ['trials', 'view=trials&limit=12'],
  ['universities', 'view=universities&limit=24'],
  ['funding', 'view=funding&limit=12'],
  ['regulatory', 'view=regulatory&limit=12'],
  ['integrity', 'view=integrity&limit=12'],
  ['graph', 'view=graph'],
  ['entities', 'view=entities&limit=12'],
  ['quality', 'view=quality'],
  ['trial-results-gap', 'view=trial-results-gap&limit=12'],
  ['resources', 'view=resources&limit=500'],
];
const viewResults = await mapConcurrent(views, 3, async ([name, query]) => {
  const result = await request(`${origin}/api/intelligence?${query}`, { json: true });
  return {
    name, url: result.url, status: result.status, elapsedMs: result.elapsedMs,
    ok: result.ok && Boolean(result.data) && !result.data?.fallback && !result.data?.unavailable && !result.data?.error,
    fallback: Boolean(result.data?.fallback), unavailable: Boolean(result.data?.unavailable), error: result.data?.error || result.error || (!result.data ? 'invalid_json' : null),
  };
});

const topicsResult = await request(`${origin}/api/intelligence?view=topics`, { json: true });
const topics = Array.isArray(topicsResult.data?.topics) ? topicsResult.data.topics : [];
const dossierResults = await mapConcurrent(topics, dossierConcurrency, async (topic) => {
  const url = `${origin}/api/intelligence?view=topic-dossier&limit=12&topic=${encodeURIComponent(topic.slug)}&quality_rules=20260930-audited-pilot-metrics-b`;
  const result = await request(url, { json: true });
  const evidence = result.data?.evidence;
  return {
    slug: topic.slug, status: result.status, elapsedMs: result.elapsedMs,
    ok: result.ok && Boolean(result.data) && !result.data?.fallback && !result.data?.unavailable && !result.data?.error && evidence && Number.isFinite(Number(evidence.research_total)) && Number.isFinite(Number(evidence.trial_total)),
    fallback: Boolean(result.data?.fallback), unavailable: Boolean(result.data?.unavailable), error: result.data?.error || result.error || (!result.data ? 'invalid_json' : null),
    researchTotal: evidence?.research_total ?? null, trialTotal: evidence?.trial_total ?? null,
  };
});

const report = {
  generatedAt: new Date().toISOString(), origin,
  sitemaps: { discovered: sitemapUrls.length, failed: sitemapResults.filter((result) => !result.ok).map(({ url, status, error }) => ({ url, status, error })) },
  pages: {
    discovered: pageUrls.length, checked: pageResults.length,
    failed: pageFailures.map(({ url, status, error, elapsedMs }) => ({ url, status, error, elapsedMs })),
    retiredDuringAudit: retiredDuringAudit.map(({ url, status, elapsedMs }) => ({ url, status, elapsedMs })),
    embeddedRecoveryCopyCount: embeddedRecoveryCopy.length,
    slowest: [...pageResults].sort((left, right) => right.elapsedMs - left.elapsedMs).slice(0, 20).map(({ url, status, elapsedMs }) => ({ url, status, elapsedMs })),
  },
  dataViews: viewResults,
  dossiers: {
    discovered: topics.length, checked: dossierResults.length,
    failed: dossierResults.filter((result) => !result.ok),
    slowest: [...dossierResults].sort((left, right) => right.elapsedMs - left.elapsedMs).slice(0, 20),
    p95Ms: dossierResults.length ? [...dossierResults].sort((a, b) => a.elapsedMs - b.elapsedMs)[Math.floor((dossierResults.length - 1) * 0.95)].elapsedMs : null,
  },
};

console.log(JSON.stringify(report, null, 2));
if (report.sitemaps.failed.length || report.pages.failed.length || report.dataViews.some((item) => !item.ok) || report.dossiers.failed.length) process.exitCode = 1;

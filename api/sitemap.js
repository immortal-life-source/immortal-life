'use strict';

const upstreamBase = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/public-pages';
const restBase = 'https://nifbuyoghesveotugday.supabase.co/rest/v1/rpc/get_public_topic_sitemap';
const allowedTypes = new Set(['research', 'trials', 'regulatory', 'integrity', 'topics', 'briefings', 'universities', 'entities', 'funders']);

const emptyUrlset = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';
const escapeXml = (value) => String(value ?? '').replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));

module.exports = async function sitemapProxy(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).send('Method not allowed');
  }
  const type = String(request.query?.type || 'research');
  if (!allowedTypes.has(type)) return response.status(404).send('Not found');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (type === 'topics') {
    try {
      if (!key) throw new Error('missing_publishable_key');
      const result = await fetch(restBase, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!result.ok) throw new Error(`topic_sitemap_${result.status}`);
      const rows = await result.json();
      const urls = (Array.isArray(rows) ? rows : []).map((row) => `<url><loc>${escapeXml(`https://www.immortal.life/topics/${row.topic_slug}`)}</loc>${row.content_updated_at ? `<lastmod>${escapeXml(String(row.content_updated_at).slice(0, 10))}</lastmod>` : ''}</url>`).join('');
      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
      return response.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`);
    } catch (_) {
      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
      response.setHeader('X-Immortal-Source', 'topic-sitemap-fallback');
      return response.status(200).send(emptyUrlset);
    }
  }
  const upstream = new URL(upstreamBase);
  upstream.searchParams.set('mode', 'sitemap');
  upstream.searchParams.set('type', type);
  const controller = new AbortController();
  // Sitemaps traverse thousands of retained records. They refresh behind the CDN,
  // so a slower crawler-only origin budget preserves completeness without
  // affecting visitor-facing page latency.
  // A cold sitemap may need to traverse several thousand public records. The
  // database indexes keep this normally well below the limit; the larger
  // crawler-only budget prevents a transient cold start from being converted
  // into a misleading empty sitemap.
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const result = await fetch(upstream, {
      headers: key ? { apikey: key, Authorization: `Bearer ${key}` } : {},
      signal: controller.signal,
    });
    if (!result.ok) throw new Error(`sitemap_${result.status}`);
    const body = await result.text();
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // Publication state changes continuously while the historical taxonomy
    // pass is running. A six-hour sitemap snapshot could therefore keep URLs
    // for records that had since been quarantined. Refresh the crawler view
    // every five minutes so sitemap membership tracks public visibility.
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400');
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400');
    return response.status(200).send(body);
  } catch (_) {
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('X-Immortal-Source', 'sitemap-fallback');
    return response.status(200).send(emptyUrlset);
  } finally {
    clearTimeout(timeout);
  }
};

'use strict';

const upstreamBase = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/public-pages';
const allowedTypes = new Set(['research', 'trials', 'regulatory', 'integrity', 'briefings', 'universities', 'entities']);

const emptyUrlset = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';

module.exports = async function sitemapProxy(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).send('Method not allowed');
  }
  const type = String(request.query?.type || 'research');
  if (!allowedTypes.has(type)) return response.status(404).send('Not found');
  const upstream = new URL(upstreamBase);
  upstream.searchParams.set('mode', 'sitemap');
  upstream.searchParams.set('type', type);
  const controller = new AbortController();
  // Sitemaps traverse thousands of retained records. They refresh behind the CDN,
  // so a slower crawler-only origin budget preserves completeness without
  // affecting visitor-facing page latency.
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    const result = await fetch(upstream, {
      headers: key ? { apikey: key, Authorization: `Bearer ${key}` } : {},
      signal: controller.signal,
    });
    if (!result.ok) throw new Error(`sitemap_${result.status}`);
    const body = await result.text();
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
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

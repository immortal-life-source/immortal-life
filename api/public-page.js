'use strict';

const upstreamBase = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/public-pages';
const allowedModes = new Set(['record', 'briefings', 'changes', 'reports', 'entity', 'university', 'funder', 'funders']);
const allowedKinds = new Set(['research', 'trials', 'regulatory', 'integrity', 'topic', 'source', 'journal', 'sponsor']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const idPattern = /^[a-zA-Z0-9._:-]+$/;

function canonicalPath(html) {
  const match = String(html || '').match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!match) return '';
  try { return new URL(match[1]).pathname; } catch (_) { return '';
  }
}

function expectedPath(query) {
  if (query.mode === 'university') return `/universities/${query.slug}`;
  if (query.mode === 'funder') return `/funders/${query.slug}`;
  if (query.mode === 'entity') return `/entities/${query.kind}/${query.slug}`;
  return '';
}

function append(upstream, name, value, validator) {
  const clean = String(value || '').trim();
  if (clean && validator.test(clean)) upstream.searchParams.set(name, clean);
}

module.exports = async function publicPageProxy(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).send('Method not allowed');
  }

  const mode = String(request.query?.mode || '').trim();
  const kind = String(request.query?.kind || '').trim();
  if (!allowedModes.has(mode) || (kind && !allowedKinds.has(kind))) return response.status(404).send('Not found');

  const upstream = new URL(upstreamBase);
  upstream.searchParams.set('mode', mode);
  if (kind) upstream.searchParams.set('kind', kind);
  append(upstream, 'id', request.query?.id, idPattern);
  append(upstream, 'slug', request.query?.slug, slugPattern);
  append(upstream, 'topic', request.query?.topic, slugPattern);
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const controller = new AbortController();
  // Cold database-backed pages can briefly exceed the warm response time when
  // several crawler requests arrive together. Give the origin enough bounded
  // time to produce one cacheable response instead of caching an error-shaped
  // visitor experience; subsequent requests are served by the CDN.
  const timeout = setTimeout(() => controller.abort(), 22_000);
  try {
    const result = await fetch(upstream, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'immortal.life/1.0 research@immortal.life',
        ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}),
      },
      signal: controller.signal,
    });
    const body = request.method === 'HEAD' ? '' : await result.text();
    const contentType = result.headers.get('content-type') || 'text/html; charset=utf-8';
    if (!result.ok) {
      response.setHeader('Cache-Control', 'no-store');
      return response.status(result.status).type(contentType).send(body);
    }

    const expected = expectedPath({ mode, kind, slug: String(request.query?.slug || '') });
    const canonical = canonicalPath(body);
    if (request.method === 'GET' && expected && canonical && canonical !== expected) {
      response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
      return response.redirect(308, canonical);
    }

    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
    response.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    response.setHeader('X-Immortal-Page-Source', 'cached-public-page');
    return response.status(200).send(body);
  } catch (error) {
    console.warn('Public page proxy failed:', error instanceof Error ? error.message : String(error));
    response.setHeader('Cache-Control', 'no-store');
    return response.status(503).send('The source-linked page is temporarily unavailable. Please try again shortly.');
  } finally {
    clearTimeout(timeout);
  }
};

module.exports.canonicalPath = canonicalPath;
module.exports.expectedPath = expectedPath;

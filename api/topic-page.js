'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { injectFundingSnapshot } = require('./_topic-funding-ssr');

const upstreamBase = 'https://nifbuyoghesveotugday.supabase.co/rest/v1/rpc/get_public_topic_funding_seo';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const topicDirectory = path.join(process.cwd(), 'dist', '_topic-templates');

function sendHtml(response, status, html, source) {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
  response.setHeader('CDN-Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=604800');
  response.setHeader('X-Immortal-Topic-Page', source);
  return response.status(status).send(html);
}

async function loadFundingSnapshot(slug, timeoutMs = 2400) {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!key) throw new Error('missing_publishable_key');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(upstreamBase, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_topic: slug }),
      signal: controller.signal,
    });
    if (!result.ok) throw new Error(`topic_funding_seo_${result.status}`);
    return await result.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function topicPage(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).send('Method not allowed');
  }
  const slug = String(request.query?.slug || '').trim().toLowerCase();
  if (!slugPattern.test(slug)) return response.status(404).send('Not found');
  const filePath = path.join(topicDirectory, `${slug}.html`);
  if (!filePath.startsWith(`${topicDirectory}${path.sep}`) || !fs.existsSync(filePath)) return response.status(404).send('Not found');

  const staticHtml = fs.readFileSync(filePath, 'utf8');
  if (request.method === 'HEAD') return sendHtml(response, 200, '', 'head');
  try {
    const snapshot = await loadFundingSnapshot(slug);
    return sendHtml(response, 200, injectFundingSnapshot(staticHtml, snapshot), 'funding-prerender');
  } catch (error) {
    console.warn('Topic funding prerender fallback:', error instanceof Error ? error.message : String(error));
    return sendHtml(response, 200, staticHtml, 'static-fallback');
  }
};

module.exports.loadFundingSnapshot = loadFundingSnapshot;

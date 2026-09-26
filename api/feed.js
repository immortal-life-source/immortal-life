'use strict';

const { sourceFallback } = require('./intelligence.js');

const site = 'https://www.immortal.life';

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isoDate(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function records(topic) {
  const query = topic ? { topic } : {};
  const [researchResult, trialResult] = await Promise.allSettled([
    sourceFallback({ ...query, view: 'research', limit: '25' }),
    sourceFallback({ ...query, view: 'trials', limit: '25' }),
  ]);
  const research = researchResult.status === 'fulfilled' ? researchResult.value.research || [] : [];
  const trials = trialResult.status === 'fulfilled' ? trialResult.value.trials || [] : [];
  return [
    ...research.map((record) => ({ id: record.doi || record.external_id || record.id, title: record.title, url: record.source_url, date: record.published_on, kind: 'Research' })),
    ...trials.map((record) => ({ id: record.external_id || record.id, title: record.title, url: record.source_url, date: record.last_update_date || record.start_date, kind: 'Clinical trial' })),
  ].filter((record) => record.title && record.url).sort((left, right) => String(right.date || '').localeCompare(String(left.date || ''))).slice(0, 40);
}

module.exports = async function publicFeed(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).send('Method not allowed');
  }
  const format = String(request.query?.format || 'rss').toLowerCase();
  const topic = String(request.query?.topic || '').slice(0, 100);
  const items = await records(topic);
  const title = topic ? `immortal.life — ${topic.replace(/-/g, ' ')}` : 'immortal.life — longevity updates';
  const description = 'New source-linked longevity research and clinical trial records.';
  const now = new Date().toISOString();
  response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400, stale-if-error=604800');
  response.setHeader('CDN-Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400, stale-if-error=604800');

  if (format === 'json') {
    response.setHeader('Content-Type', 'application/feed+json; charset=utf-8');
    return response.status(200).json({
      version: 'https://jsonfeed.org/version/1.1', title, home_page_url: site, feed_url: `${site}${topic ? `/feeds/topics/${topic}.json` : '/feed.json'}`,
      items: items.map((item) => ({ id: String(item.id), url: item.url, title: item.title, content_text: `${item.kind} source record. Open the original source for details and limitations.`, date_published: isoDate(item.date) })),
    });
  }
  if (format === 'atom') {
    response.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    const entries = items.map((item) => `<entry><id>${xml(item.url)}</id><title>${xml(item.title)}</title><link href="${xml(item.url)}"/><updated>${isoDate(item.date)}</updated><summary>${xml(`${item.kind} source record. Open the original source for details and limitations.`)}</summary></entry>`).join('');
    return response.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${site}/</id><title>${xml(title)}</title><updated>${now}</updated><link href="${site}"/>${entries}</feed>`);
  }
  response.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  const entries = items.map((item) => `<item><guid isPermaLink="true">${xml(item.url)}</guid><title>${xml(item.title)}</title><link>${xml(item.url)}</link><pubDate>${new Date(isoDate(item.date)).toUTCString()}</pubDate><description>${xml(`${item.kind} source record. Open the original source for details and limitations.`)}</description></item>`).join('');
  return response.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(title)}</title><link>${site}</link><description>${xml(description)}</description><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${entries}</channel></rss>`);
};

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.argv[2] || 'https://www.immortal.life';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9334 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'immortal-life-uat-'));
const artifacts = join(tmpdir(), 'immortal-life-uat-artifacts');
mkdirSync(artifacts, { recursive: true });

const defaultRoutes = [
  '/', '/learn', '/research', '/trials', '/topics', '/topics/rapamycin',
  '/discover', '/changes', '/discover/recruiting-trials', '/discover/regulatory-status', '/discover/research-integrity', '/reports',
  '/regulatory', '/integrity', '/evidence-graph', '/briefings', '/methodology',
  '/resources', '/universities', '/entities', '/entities/topic/rapamycin', '/quality', '/automation', '/publication-policy', '/corrections', '/data', '/dashboard', '/join',
  '/privacy', '/confirmed', '/unsubscribed',
];
const routes = process.env.UAT_ROUTES ? process.env.UAT_ROUTES.split(',').map((route) => route.trim()).filter(Boolean) : defaultRoutes;
if (!process.env.UAT_ROUTES) {
  try {
    const sitemap = await (await fetch(`${baseUrl}/sitemaps/research.xml`)).text();
    const sample = sitemap.match(/<loc>https?:\/\/[^<]+(\/research\/\d+)<\/loc>/)?.[1];
    if (sample) routes.splice(2, 0, sample);
    const universities = await (await fetch(`${baseUrl}/sitemaps/universities.xml`)).text();
    const universitySample = universities.match(/<loc>https?:\/\/[^<]+(\/universities\/[^<]+)<\/loc>/)?.[1];
    if (universitySample) routes.splice(routes.indexOf('/universities') + 1, 0, universitySample);
  } catch (_) { /* Dynamic record discovery is best-effort for local previews. */ }
}

const browser = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--remote-allow-origins=*', '--no-first-run', '--disable-gpu', '--disable-gpu-compositing',
  '--disable-3d-apis', '--disable-webgl', '--disable-webgl2',
  '--disable-features=Vulkan,SkiaGraphite,Dawn,WebGPU', '--hide-scrollbars', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let chromeError = '';
browser.stderr?.on('data', (chunk) => { chromeError = (chromeError + chunk.toString()).slice(-12000); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(fn, attempts = 40) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try { return await fn(); } catch (error) { lastError = error; await sleep(125); }
  }
  throw lastError;
}

class Cdp {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
  }
  async open() {
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        this.events.push(message);
      }
    };
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error(`Browser connection closed during ${pending.method}`));
      this.pending.clear();
    });
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
      this.socket.addEventListener('close', () => reject(new Error('Browser connection closed before opening')), { once: true });
    });
  }
  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timeoutMs = method === 'Page.navigate' ? 30000 : 15000;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result.value;
}

async function waitForReady(cdp) {
  await retry(async () => {
    const ready = await evaluate(cdp, 'document.readyState === "complete"');
    if (!ready) throw new Error('not ready');
  });
  await sleep(500);
  await retry(async () => {
    const ready = await evaluate(cdp, `(() => { const loading=document.getElementById('loadingState'); return !loading || loading.hidden || getComputedStyle(loading).display === 'none'; })()`);
    if (!ready) throw new Error('live data is still loading');
  }, 120);
}

async function capture(cdp, name, fullPage = false) {
  const metrics = fullPage ? await cdp.call('Page.getLayoutMetrics') : null;
  const size = metrics?.cssContentSize || metrics?.contentSize;
  const shot = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage,
    fromSurface: true,
    ...(size ? { clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 } } : {}),
  });
  const target = join(artifacts, name);
  writeFileSync(target, Buffer.from(shot.data, 'base64'));
  return target;
}

const navButtonSelector = '.mobile-nav-toggle, .intel-nav-toggle, .m-member-nav-toggle';
const navLookupExpression = `document.getElementById('primaryNav') || document.getElementById('intelNav') || document.querySelector('.m-member-nav')`;

async function runViewport(cdp, profileName, width, height, mobile) {
  await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const results = [];
  for (const route of routes) {
    const eventStart = cdp.events.length;
    await cdp.call('Page.navigate', { url: `${baseUrl}${route}` });
    await waitForReady(cdp);
    const state = await evaluate(cdp, `(() => ({
      url: location.href,
      title: document.title,
      h1: Boolean(document.querySelector('h1')),
      bodyText: (document.body?.innerText || '').trim().length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages: [...document.images].filter(img => img.loading !== 'lazy' && img.complete && img.naturalWidth === 0).map(img => img.src),
      logoLoaded: [...document.images].filter(img => img.src.includes('linkedin-app-logo.png') && img.loading !== 'lazy').every(img => img.complete && img.naturalWidth > 0),
      overflowing: [...document.querySelectorAll('body *')].map(el => { const r = el.getBoundingClientRect(); return { element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().replace(/\\s+/g,'.') : ''), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; }).filter(item => item.right > innerWidth + 2 || item.left < -2).slice(0, 12),
      internalOverflow: [document.documentElement, document.body, ...document.querySelectorAll('body *')].map(el => ({ element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().replace(/\\s+/g,'.') : ''), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })).filter(item => item.scrollWidth > item.clientWidth + 2).sort((a,b) => (b.scrollWidth-b.clientWidth) - (a.scrollWidth-a.clientWidth)).slice(0,12),
      menuButtonVisible: (() => { const el = document.querySelector('${navButtonSelector}'); return el ? getComputedStyle(el).display !== 'none' : null; })(),
      menuVisible: (() => { const el = ${navLookupExpression}; return el ? getComputedStyle(el).display !== 'none' : null; })()
      ,mainLandmark: Boolean(document.querySelector('main'))
      ,unlabelledInputs: [...document.querySelectorAll('input,select,textarea')].filter(el => !el.closest('label') && !(el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length
      ,genericLinks: [...document.querySelectorAll('a')].filter(a => /^(click here|learn more|read more)$/i.test((a.textContent || '').trim())).length
      ,smallControls: [...document.querySelectorAll('button,a,input,select')].filter(el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0 && r.height>0 && (el.tagName==='BUTTON' || el.tagName==='INPUT' || el.tagName==='SELECT') && r.height<40 && s.position!=='absolute'; }).slice(0,8).map(el => ({tag:el.tagName,id:el.id,className:el.className,height:Math.round(el.getBoundingClientRect().height)}))
      ,todayCards: document.querySelectorAll('#todayGrid .today-card').length
      ,systemMapLower: Boolean(document.querySelector('.home-explorer .hero-orbit'))
      ,timelineVisible: (() => { const el=document.getElementById('timelineSection'); return el ? !el.hidden : null; })()
      ,timelineEvents: document.querySelectorAll('#evidenceTimeline .timeline-event').length
      ,graphMechanisms: document.querySelectorAll('#evidenceGraph .graph-node--mechanism').length
      ,graphUniversities: document.querySelectorAll('#evidenceGraph .graph-node--university').length
      ,trialWorldMapNodes: document.querySelectorAll('.trial-world-map .trial-map-node').length
      ,recordGuideLabels: [...document.querySelectorAll('.record-meaning dt')].map(el => el.textContent.trim())
      ,portalIntroBottom: (() => { const el=document.querySelector('.reader-mode') || document.querySelector('.intel-hero'); return el ? Math.round(el.getBoundingClientRect().bottom) : null; })()
      ,regulatoryGuides: document.querySelectorAll('#regulatoryGuideGrid .regulatory-guide-card').length
      ,plainCopies: document.querySelectorAll('.plain-record-copy').length
      ,heroDiscoveries: document.querySelectorAll('#heroDiscoveriesList .hero-discovery').length
      ,topicCards: document.querySelectorAll('#topicGrid .topic-card').length
      ,resourceRegionCards: document.querySelectorAll('#resourceRegionGrid .resource-region-card').length
      ,universityRegionCards: document.querySelectorAll('#universityRegionGrid .university-region-card').length
      ,legacyMapCount: document.querySelectorAll('.resource-map,.university-map').length
      ,qualityPrivateText: /Google impressions|Google visits|Search pages to improve|Weekly briefing delivery/.test(document.body?.innerText || '')
      ,qualitySourceDirectory: (() => { const el=document.getElementById('sourceSection'); return el ? !el.hidden : false; })()
      ,completePrimaryNav: (() => { const nav=${navLookupExpression}; if (!nav) return false; const expected=['/changes','/topics','/trials','/universities','/research','/discover','/learn','/regulatory','/resources','/briefings','/methodology']; const hrefs=[...nav.querySelectorAll('a')].map(a => a.getAttribute('href')); return expected.every(href => hrefs.includes(href)) && !nav.querySelector('.s1-nav-more-toggle,.intel-nav-more'); })()
    }))()`);
    const recentEvents = cdp.events.slice(eventStart);
    const exceptions = recentEvents.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params?.exceptionDetails?.text || 'runtime exception');
    const consoleErrors = recentEvents.filter((event) => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error').map((event) => event.params?.args?.map((arg) => arg.value || arg.description).join(' ') || 'console error');
    const failures = [];
    if (!state.title) failures.push('missing title');
    if (!state.h1) failures.push('missing h1');
    if (!state.mainLandmark) failures.push('missing main landmark');
    if (state.unlabelledInputs) failures.push(`${state.unlabelledInputs} unlabelled form controls`);
    if (state.genericLinks) failures.push(`${state.genericLinks} generic link labels`);
    if (state.bodyText < 80) failures.push('insufficient visible content');
    if (state.overflow > 2) failures.push(`horizontal overflow ${state.overflow}px: ${JSON.stringify({ outside: state.overflowing, internal: state.internalOverflow })}`);
    if (state.brokenImages.length) failures.push(`broken images: ${state.brokenImages.join(', ')}`);
    if (!state.logoLoaded) failures.push('brand mark failed to load');
    if (!state.completePrimaryNav) failures.push('complete primary navigation is not exposed without a More dropdown');
    if (mobile && state.menuButtonVisible !== true) failures.push('mobile menu button hidden or missing');
    if (route === '/' && !mobile && state.menuButtonVisible !== false) failures.push('desktop menu button visible');
    if (route === '/' && state.todayCards !== 6) failures.push(`daily briefing has ${state.todayCards} cards instead of 6`);
    if (route === '/' && !state.systemMapLower) failures.push('interactive system map is not below the hero');
    if (route === '/' && state.heroDiscoveries !== 6) failures.push(`homepage newest-discoveries rail has ${state.heroDiscoveries} records instead of 6`);
    if (!mobile && ['/research','/trials','/universities','/discover','/changes','/regulatory'].includes(route) && state.portalIntroBottom > 390) failures.push(`portal introduction ends too low at ${state.portalIntroBottom}px`);
    if (route === '/regulatory' && state.regulatoryGuides < 20) failures.push(`regulatory library has only ${state.regulatoryGuides} guides`);
    if (route === '/regulatory' && state.plainCopies < 3) failures.push('regulatory plain-language explanations did not render');
    if ((route === '/dashboard' || route === '/join') && !state.url.endsWith('/topics')) failures.push(`${route} did not redirect to /topics`);
    if (route === '/topics' && state.topicCards < 82) failures.push(`topic directory has only ${state.topicCards} topic cards`);
    if (route === '/resources' && state.resourceRegionCards < 5) failures.push(`resource directory has only ${state.resourceRegionCards} regional cards`);
    if (route === '/universities' && state.universityRegionCards < 1) failures.push('university regional navigator did not render');
    if ((route === '/resources' || route === '/universities') && state.legacyMapCount) failures.push('obsolete decorative map is still visible');
    if (route === '/quality' && (state.qualityPrivateText || state.qualitySourceDirectory)) failures.push('quality page exposes private analytics or duplicate source directory');
    if (route === '/topics/rapamycin' && (!state.timelineVisible || state.timelineEvents < 1)) failures.push('topic evidence timeline did not render');
    if (route === '/evidence-graph' && (state.graphMechanisms < 1 || state.graphUniversities < 1)) failures.push(`graph missing layers: ${state.graphMechanisms} mechanisms, ${state.graphUniversities} universities`);
    if (route === '/discover/recruiting-trials' && !state.url.endsWith('/trials')) failures.push('legacy recruiting-trials route did not redirect to Trial Radar');
    if (/^\/research\/\d+$/.test(route) && !['What this is','Why it may matter','Evidence','Main limitation','What changed','Where to verify'].every(label => state.recordGuideLabels.includes(label))) failures.push('research record plain-language guide is incomplete');
    if (route === '/research' || route === '/trials') {
      const prefix = route === '/research' ? 'research' : 'trial';
      const interaction = await evaluate(cdp, `(async() => {
        const controls=document.getElementById('${route === '/research' ? 'researchControls' : 'trialControls'}');
        const input=document.getElementById('${route === '/research' ? 'researchSearch' : 'trialSearch'}');
        const result=document.getElementById('${route === '/research' ? 'researchResult' : 'trialResult'}');
        const list=document.getElementById('${route === '/research' ? 'researchList' : 'trialList'}');
        const clear=document.getElementById('${route === '/research' ? 'researchClear' : 'trialClear'}');
        const initial={visible:controls ? !controls.hidden && getComputedStyle(controls).display !== 'none' : false,result:result?.textContent||'',cards:list?.querySelectorAll('.record-card').length||0,topics:document.getElementById('${route === '/research' ? 'researchTopic' : 'trialTopic'}')?.options.length||0};
        if (input) { input.value='uat-no-match-7f8e9d'; input.dispatchEvent(new Event('input',{bubbles:true})); }
        await new Promise(resolve => setTimeout(resolve, 1800));
        const empty={result:result?.textContent||'',message:list?.textContent||'',cards:list?.querySelectorAll('.record-card').length||0};
        clear?.click();
        await new Promise(resolve => setTimeout(resolve, 1800));
        return {initial,empty,cleared:{value:input?.value||'',result:result?.textContent||'',cards:list?.querySelectorAll('.record-card').length||0}};
      })()`);
      if (!interaction.initial.visible) failures.push(`${prefix} search controls are hidden`);
      if (interaction.initial.cards < 1 || interaction.initial.cards > 100) failures.push(`${prefix} initial result renders ${interaction.initial.cards} cards`);
      if (interaction.initial.topics < 2) failures.push(`${prefix} topic filter has no choices`);
      if (interaction.empty.cards !== 0 || !/showing 0/i.test(interaction.empty.result)) failures.push(`${prefix} text search did not filter to zero results`);
      if (interaction.cleared.value || interaction.cleared.cards < 1) failures.push(`${prefix} clear-filters action did not restore results`);
    }
    failures.push(...exceptions, ...consoleErrors);
    results.push({ profile: profileName, route, resolvedUrl: state.url, failures });

    const routeName = route === '/' ? 'home' : route.slice(1).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    await capture(cdp, `${profileName}-${routeName}.png`, false);

    if (state.menuButtonVisible === true) {
      if (mobile) {
        const menu = await evaluate(cdp, `(() => { const button = document.querySelector('${navButtonSelector}'); button?.click(); const nav = ${navLookupExpression}; return { expanded: button?.getAttribute('aria-expanded'), visible: nav ? getComputedStyle(nav).display !== 'none' : false, links: nav ? [...nav.querySelectorAll('a')].filter(a => { const r=a.getBoundingClientRect(); return r.width >= 1 && r.height >= 40; }).length : 0 }; })()`);
        if (menu.expanded !== 'true' || !menu.visible || menu.links < 3) results.at(-1).failures.push('mobile menu interaction failed');
        if (route === '/' || route === '/universities' || route === '/resources' || route === '/privacy') {
          await capture(cdp, route === '/' ? 'mobile-home-menu.png' : `mobile-${routeName}-menu.png`, false);
        }
      } else {
        if (route === '/') await capture(cdp, 'desktop-home.png', false);
      }
    }
  }
  return results;
}

let cdp;
try {
  const targets = await retry(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) throw new Error(`CDP returned ${response.status}`);
    return response.json();
  });
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No headless Chrome page target');
  cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Network.enable');
  const desktop = await runViewport(cdp, 'desktop', 1440, 1000, false);
  const mobile = await runViewport(cdp, 'mobile', 390, 844, true);
  const endpointChecks = await Promise.all(['/sitemap.xml', '/sitemaps/static.xml', '/sitemaps/research.xml', '/sitemaps/universities.xml', '/feed.xml', '/feed.atom', '/feed.json', '/changes/feed.xml', '/changes/feed.json', '/feeds/topics/rapamycin.xml', '/datasets/trials.csv', '/datasets/research.json', '/datasets/universities.csv', '/datasets/universities.json', '/api/subscribe?action=confirm&token=bad', '/social-card/entity/topic-rapamycin.png', '/social-card/changes/latest.png', '/social-card/university/harvard-university-i136199984.png'].map(async (route) => {
    const response = await fetch(`${baseUrl}${route}`);
    return { route, status: response.status, contentType: response.headers.get('content-type'), ok: response.ok };
  }));
  const results = [...desktop, ...mobile];
  const failures = results.filter((result) => result.failures.length);
  console.log(JSON.stringify({ baseUrl, testedPages: results.length, failures, endpointChecks, artifacts: { desktop: join(artifacts, 'desktop-home.png'), mobile: join(artifacts, 'mobile-home-menu.png'), resourcesDesktop: join(artifacts, 'desktop-resources.png'), resourcesMobile: join(artifacts, 'mobile-resources.png') } }, null, 2));
  if (failures.length || endpointChecks.some((check) => !check.ok)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (browser.exitCode == null) browser.kill();
  await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), sleep(2000)]);
  browser.unref();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (_) { /* OS cleanup will remove the disposable profile. */ }
}

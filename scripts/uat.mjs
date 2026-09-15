import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.argv[2] || 'https://www.immortal.life';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9334;
const profile = mkdtempSync(join(tmpdir(), 'immortal-life-uat-'));
const artifacts = join(tmpdir(), 'immortal-life-uat-artifacts');
mkdirSync(artifacts, { recursive: true });

const defaultRoutes = [
  '/', '/research', '/trials', '/topics', '/topics/rapamycin',
  '/discover', '/discover/recruiting-trials', '/discover/regulatory-status', '/discover/research-integrity', '/reports',
  '/regulatory', '/integrity', '/evidence-graph', '/briefings', '/methodology',
  '/resources', '/entities', '/entities/topic/rapamycin', '/quality', '/automation', '/publication-policy', '/corrections', '/data', '/join',
  '/auth/x', '/auth/linkedin', '/leaderboard', '/privacy',
];
const routes = process.env.UAT_ROUTES ? process.env.UAT_ROUTES.split(',').map((route) => route.trim()).filter(Boolean) : defaultRoutes;
if (!process.env.UAT_ROUTES) {
  try {
    const sitemap = await (await fetch(`${baseUrl}/sitemaps/research.xml`)).text();
    const sample = sitemap.match(/<loc>https?:\/\/[^<]+(\/research\/\d+)<\/loc>/)?.[1];
    if (sample) routes.splice(2, 0, sample);
  } catch (_) { /* Dynamic record discovery is best-effort for local previews. */ }
}

const browser = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

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
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
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
    });
  }
  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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
  await sleep(1700);
}

async function capture(cdp, name) {
  const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const target = join(artifacts, name);
  writeFileSync(target, Buffer.from(shot.data, 'base64'));
  return target;
}

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
      menuButtonVisible: (() => { const el = document.querySelector('.mobile-nav-toggle'); return el ? getComputedStyle(el).display !== 'none' : null; })(),
      menuVisible: (() => { const el = document.getElementById('primaryNav'); return el ? getComputedStyle(el).display !== 'none' : null; })()
      ,mainLandmark: Boolean(document.querySelector('main'))
      ,unlabelledInputs: [...document.querySelectorAll('input,select,textarea')].filter(el => !el.closest('label') && !(el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length
      ,genericLinks: [...document.querySelectorAll('a')].filter(a => /^(click here|learn more|read more)$/i.test((a.textContent || '').trim())).length
      ,smallControls: [...document.querySelectorAll('button,a,input,select')].filter(el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0 && r.height>0 && (el.tagName==='BUTTON' || el.tagName==='INPUT' || el.tagName==='SELECT') && r.height<40 && s.position!=='absolute'; }).slice(0,8).map(el => ({tag:el.tagName,id:el.id,className:el.className,height:Math.round(el.getBoundingClientRect().height)}))
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
    if (route === '/' && mobile && state.menuButtonVisible !== true) failures.push('mobile menu button hidden');
    if (route === '/' && !mobile && state.menuButtonVisible !== false) failures.push('desktop menu button visible');
    failures.push(...exceptions, ...consoleErrors);
    results.push({ profile: profileName, route, resolvedUrl: state.url, failures });

    if (route === '/') {
      if (mobile) {
        const menu = await evaluate(cdp, `(() => { const button = document.querySelector('.mobile-nav-toggle'); button?.click(); const nav = document.getElementById('primaryNav'); return { expanded: button?.getAttribute('aria-expanded'), visible: nav ? getComputedStyle(nav).display !== 'none' : false, links: nav ? [...nav.querySelectorAll('a')].filter(a => { const r=a.getBoundingClientRect(); return r.width >= 1 && r.height >= 40; }).length : 0 }; })()`);
        if (menu.expanded !== 'true' || !menu.visible || menu.links < 8) results.at(-1).failures.push('mobile menu interaction failed');
        await capture(cdp, 'mobile-home-menu.png');
      } else {
        await capture(cdp, 'desktop-home.png');
      }
    }
    if (route === '/resources') await capture(cdp, `${profileName}-resources.png`);
    if (route === '/discover') await capture(cdp, `${profileName}-discover.png`);
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
  await Promise.all([cdp.call('Page.enable'), cdp.call('Runtime.enable'), cdp.call('Network.enable')]);
  const desktop = await runViewport(cdp, 'desktop', 1440, 1000, false);
  const mobile = await runViewport(cdp, 'mobile', 390, 844, true);
  const endpointChecks = await Promise.all(['/sitemap.xml', '/sitemaps/static.xml', '/sitemaps/research.xml', '/feed.xml', '/feed.atom', '/feed.json', '/feeds/topics/rapamycin.xml', '/datasets/trials.csv', '/datasets/research.json', '/api/subscribe?action=confirm&token=bad', '/social-card/entity/topic-rapamycin.png'].map(async (route) => {
    const response = await fetch(`${baseUrl}${route}`);
    return { route, status: response.status, contentType: response.headers.get('content-type'), ok: response.ok };
  }));
  const results = [...desktop, ...mobile];
  const failures = results.filter((result) => result.failures.length);
  console.log(JSON.stringify({ baseUrl, testedPages: results.length, failures, endpointChecks, artifacts: { desktop: join(artifacts, 'desktop-home.png'), mobile: join(artifacts, 'mobile-home-menu.png'), resourcesDesktop: join(artifacts, 'desktop-resources.png'), resourcesMobile: join(artifacts, 'mobile-resources.png') } }, null, 2));
  if (failures.length || endpointChecks.some((check) => !check.ok)) process.exitCode = 1;
} finally {
  try { await Promise.race([cdp?.call('Browser.close'), sleep(1000)]); } catch (_) { /* Browser may already be closing. */ }
  cdp?.close();
  await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), sleep(2000)]);
  if (browser.exitCode == null) browser.kill();
  browser.unref();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (_) { /* OS cleanup will remove the disposable profile. */ }
  process.exit(process.exitCode || 0);
}

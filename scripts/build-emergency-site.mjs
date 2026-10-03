import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'tmp', 'emergency-site');
const sources = [
  'intelligence-topics.json',
  'intelligence-topics-expanded.json',
  'intelligence-topics-round-three.json',
];
const groups = await Promise.all(sources.map(async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))));
const topics = groups.flat().map(({ slug, name, description }) => ({ slug, name, description }));
const generatedAt = new Date().toISOString();
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="description" content="Independent continuity access for Immortal.life during a service interruption.">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src https://nifbuyoghesveotugday.supabase.co; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'">
  <title>Immortal.life continuity access</title>
  <link rel="stylesheet" href="./emergency.css">
</head>
<body>
  <header><a class="brand" href="https://www.immortal.life/"><span class="mark" aria-hidden="true">∞</span><span>immortal.life</span></a><nav><a aria-current="page" href="./">Continuity access</a><a href="./status.html">System status</a></nav></header>
  <main>
    <section class="hero">
      <div><span class="eyebrow">SERVICE CONTINUITY</span><h1>Longevity knowledge should remain reachable.</h1><p>This independent copy is hosted outside Vercel. It preserves the complete topic directory and attempts a direct, read-only connection to the public scientific index.</p></div>
      <aside id="liveStatus" class="status" aria-live="polite"><span>Checking the scientific index…</span></aside>
    </section>
    <section class="latest" aria-labelledby="latestTitle">
      <div class="section-heading"><div><span class="eyebrow">DIRECT DATA CHECK</span><h2 id="latestTitle">Latest reachable evidence</h2></div><a href="https://www.immortal.life/">Try the primary website →</a></div>
      <div id="latestEvidence" class="evidence-grid"><p>Connecting directly to the source-linked public index…</p></div>
    </section>
    <section class="directory" aria-labelledby="directoryTitle">
      <div class="section-heading"><div><span class="eyebrow">STATIC RECOVERY DIRECTORY</span><h2 id="directoryTitle">All ${topics.length} longevity topics</h2></div><label>Find a topic<input id="topicSearch" type="search" placeholder="Search topics…" autocomplete="off"></label></div>
      <p class="directory-note">Names and descriptions remain available even if every live data service is temporarily unreachable. Topic links return to the primary website.</p>
      <div id="topicGrid" class="topic-grid"></div>
    </section>
  </main>
  <footer><span>Emergency mirror generated ${generatedAt.slice(0, 10)}</span><span><a href="./status.html">System status</a> · Source-linked information only · not medical advice</span></footer>
  <script src="./emergency.js"></script>
</body>
</html>`;

const css = `:root{color-scheme:light;--ink:#2c2028;--muted:#816d78;--line:#eedde5;--paper:#fffafb;--pink:#cf2f72;--pink-soft:#fff0f6;--gold:#a66e00;--good:#287a5b;--alert:#b83d54}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Arial,sans-serif}header,main,footer{width:min(1180px,calc(100% - 40px));margin:auto}header{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}header nav{display:flex;gap:8px}header nav a{border:1px solid transparent;border-radius:999px;color:var(--muted);padding:9px 14px;text-decoration:none}header nav a[aria-current=page]{border-color:var(--line);background:white;color:var(--pink)}.brand{display:flex;gap:12px;align-items:center;color:var(--pink);text-decoration:none;font-weight:700}.mark{width:42px;height:42px;border:1px solid var(--pink);border-radius:50%;display:grid;place-items:center;font-size:27px}.independent,.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--pink)}.hero{min-height:390px;display:grid;grid-template-columns:1.5fr .8fr;gap:64px;align-items:center;border-bottom:1px solid var(--line)}h1{font-size:clamp(42px,7vw,78px);line-height:.98;letter-spacing:-.055em;margin:16px 0 24px;max-width:820px}h2{font-size:clamp(30px,4vw,48px);line-height:1.05;letter-spacing:-.04em;margin:8px 0}.hero p{color:var(--muted);font-size:18px;max-width:720px}.status{border:1px solid var(--line);border-radius:26px;padding:30px;background:white;min-height:150px;display:flex;align-items:center}.status strong{display:block;color:var(--good);font-size:25px;margin-bottom:8px}.status[data-state=delayed] strong{color:var(--gold)}.latest,.directory{padding:72px 0;border-bottom:1px solid var(--line)}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px}.section-heading a{color:var(--pink)}label{display:grid;gap:6px;color:var(--muted);font-size:12px}input{width:min(360px,80vw);border:1px solid var(--line);border-radius:999px;background:white;padding:13px 18px;color:var(--ink)}.evidence-grid,.topic-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.evidence,.topic{background:white;border:1px solid var(--line);border-radius:20px;padding:22px}.evidence span,.topic span{display:block;color:var(--pink);font-size:11px;letter-spacing:.1em;text-transform:uppercase}.evidence h3,.topic h3{font-size:19px;line-height:1.2;margin:10px 0}.evidence p,.topic p,.directory-note{color:var(--muted);margin:0}.topic a{color:var(--ink);text-decoration:none}.topic a:hover{color:var(--pink)}footer{min-height:100px;display:flex;align-items:center;justify-content:space-between;gap:20px;color:var(--muted);font-size:12px}footer a{color:var(--pink)}.status-hero{min-height:410px;display:grid;grid-template-columns:1.5fr .65fr;gap:64px;align-items:center;border-bottom:1px solid var(--line)}.status-hero p{color:var(--muted);font-size:18px;max-width:760px}.status-seal{min-height:190px;border:1px solid var(--line);border-radius:34px;background:linear-gradient(145deg,#fff,#fff1f7);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:32px}.status-seal i,.status-card__top i{width:10px;height:10px;border-radius:50%;background:var(--good);box-shadow:0 0 18px rgba(40,122,91,.35)}[data-state=attention] .status-seal i,.status-card[data-state=attention] i,.route-panel [data-state=failed]{background:var(--alert);color:var(--alert)}[data-state=unknown] .status-seal i,.status-card[data-state=unknown] i,.status-card[data-state=connection-required] i{background:var(--gold)}.status-seal strong{font-size:24px;margin:18px 0 8px}.status-seal span{color:var(--muted)}.status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:60px 0}.status-card{min-height:250px;border:1px solid var(--line);border-radius:24px;background:white;padding:24px;display:flex;flex-direction:column}.status-card__top{display:flex;align-items:center;justify-content:space-between;color:var(--pink);font-size:10px;letter-spacing:.13em}.status-card strong{font-size:28px;line-height:1.1;margin-top:30px}.status-card h2{font-size:18px;letter-spacing:-.02em;margin:8px 0}.status-card p{color:var(--muted);margin:0 0 18px}.status-card a{color:var(--pink);margin-top:auto}.route-panel{display:grid;grid-template-columns:.8fr 1.2fr;gap:72px;padding:72px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.route-panel>div p{color:var(--muted)}.route-panel ul{list-style:none;padding:0;margin:0;border:1px solid var(--line);border-radius:24px;background:white;overflow:hidden}.route-panel li{display:grid;grid-template-columns:1fr auto 70px;gap:16px;padding:14px 18px;border-bottom:1px solid var(--line)}.route-panel li:last-child{border:0}.route-panel strong{font-size:12px;color:var(--good)}.route-panel small{text-align:right;color:var(--muted)}.status-privacy{margin:60px 0;padding:24px 28px;border-left:3px solid var(--pink);background:var(--pink-soft)}.status-privacy p{margin:6px 0 0;color:var(--muted)}@media(max-width:960px){.status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.route-panel{grid-template-columns:1fr;gap:28px}}@media(max-width:760px){header,main,footer{width:min(100% - 28px,1180px)}header nav a{padding:8px;font-size:12px}.hero,.status-hero{grid-template-columns:1fr;gap:24px;padding:60px 0}.latest,.directory{padding:48px 0}.section-heading{align-items:start;flex-direction:column}.evidence-grid,.topic-grid,.status-grid{grid-template-columns:1fr}.status-card{min-height:220px}.route-panel li{grid-template-columns:1fr auto}.route-panel small{display:none}footer{align-items:flex-start;flex-direction:column;justify-content:center}}`;

const topicJson = JSON.stringify(topics).replace(/</g, '\\u003c');
const js = `'use strict';
const topics=${topicJson};
const grid=document.getElementById('topicGrid');
const search=document.getElementById('topicSearch');
const escapeText=(value)=>String(value||'');
function renderTopics(){const query=search.value.trim().toLowerCase();const visible=topics.filter((topic)=>!query||\`${'${topic.name} ${topic.description}'}\`.toLowerCase().includes(query));grid.replaceChildren(...visible.map((topic)=>{const card=document.createElement('article');card.className='topic';const tag=document.createElement('span');tag.textContent='Living Evidence Dossier';const title=document.createElement('h3');const link=document.createElement('a');link.href=\`https://www.immortal.life/topics/${'${encodeURIComponent(topic.slug)}'}\`;link.textContent=topic.name;title.append(link);const copy=document.createElement('p');copy.textContent=escapeText(topic.description);card.append(tag,title,copy);return card;}));}
search.addEventListener('input',renderTopics);renderTopics();
const endpoint='https://nifbuyoghesveotugday.supabase.co/functions/v1/public-intelligence?view=overview&limit=6';
const status=document.getElementById('liveStatus');const evidence=document.getElementById('latestEvidence');
const controller=new AbortController();setTimeout(()=>controller.abort(),10000);
fetch(endpoint,{headers:{Accept:'application/json'},signal:controller.signal}).then(async(response)=>{if(!response.ok)throw new Error(\`HTTP ${'${response.status}'}\`);const data=await response.json();if(data.fallback||data.unavailable)throw new Error('verified index delayed');status.innerHTML='<div><strong>Live index reachable</strong><span>Read-only public data is responding directly from Supabase.</span></div>';const rows=[...(data.research||[]).slice(0,3).map((item)=>({kind:'Research',title:item.title,url:item.source_url})),...(data.trials||[]).slice(0,3).map((item)=>({kind:'Trial registration',title:item.title,url:item.source_url}))];evidence.replaceChildren(...rows.map((item)=>{const card=document.createElement('article');card.className='evidence';const kind=document.createElement('span');kind.textContent=item.kind;const title=document.createElement('h3');title.textContent=item.title||'Source-linked record';const link=document.createElement('a');link.href=item.url||'https://www.immortal.life/';link.textContent='Open original source →';link.rel='noopener noreferrer';card.append(kind,title,link);return card;}));}).catch(()=>{status.dataset.state='delayed';status.innerHTML='<div><strong>Live index temporarily delayed</strong><span>The static 180-topic directory below remains available. No unverified data has been substituted.</span></div>';evidence.innerHTML='<p>Live records are temporarily unreachable. Use the static topic directory while service is restored.</p>';});`;

await Promise.all([
  fs.writeFile(path.join(output, 'index.html'), html, 'utf8'),
  fs.writeFile(path.join(output, '404.html'), html, 'utf8'),
  fs.writeFile(path.join(output, 'emergency.css'), css, 'utf8'),
  fs.writeFile(path.join(output, 'emergency.js'), js, 'utf8'),
  fs.writeFile(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8'),
  fs.writeFile(path.join(output, 'status.json'), `${JSON.stringify({ generated_at: generatedAt, topics: topics.length }, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(output, '.nojekyll'), '', 'utf8'),
]);

console.log(`Built independent emergency site with ${topics.length} topics at ${output}`);


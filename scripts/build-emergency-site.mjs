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
  <header><a class="brand" href="https://www.immortal.life/"><span class="mark" aria-hidden="true">∞</span><span>immortal.life</span></a><span class="independent">Independent continuity copy</span></header>
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
  <footer><span>Emergency mirror generated ${generatedAt.slice(0, 10)}</span><span>Source-linked information only · not medical advice</span></footer>
  <script src="./emergency.js"></script>
</body>
</html>`;

const css = `:root{color-scheme:light;--ink:#2c2028;--muted:#816d78;--line:#eedde5;--paper:#fffafb;--pink:#cf2f72;--pink-soft:#fff0f6;--gold:#a66e00;--good:#287a5b}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Arial,sans-serif}header,main,footer{width:min(1180px,calc(100% - 40px));margin:auto}header{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand{display:flex;gap:12px;align-items:center;color:var(--pink);text-decoration:none;font-weight:700}.mark{width:42px;height:42px;border:1px solid var(--pink);border-radius:50%;display:grid;place-items:center;font-size:27px}.independent,.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--pink)}.hero{min-height:390px;display:grid;grid-template-columns:1.5fr .8fr;gap:64px;align-items:center;border-bottom:1px solid var(--line)}h1{font-size:clamp(42px,7vw,78px);line-height:.98;letter-spacing:-.055em;margin:16px 0 24px;max-width:820px}h2{font-size:clamp(30px,4vw,48px);line-height:1.05;letter-spacing:-.04em;margin:8px 0}.hero p{color:var(--muted);font-size:18px;max-width:720px}.status{border:1px solid var(--line);border-radius:26px;padding:30px;background:white;min-height:150px;display:flex;align-items:center}.status strong{display:block;color:var(--good);font-size:25px;margin-bottom:8px}.status[data-state=delayed] strong{color:var(--gold)}.latest,.directory{padding:72px 0;border-bottom:1px solid var(--line)}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px}.section-heading a{color:var(--pink)}label{display:grid;gap:6px;color:var(--muted);font-size:12px}input{width:min(360px,80vw);border:1px solid var(--line);border-radius:999px;background:white;padding:13px 18px;color:var(--ink)}.evidence-grid,.topic-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.evidence,.topic{background:white;border:1px solid var(--line);border-radius:20px;padding:22px}.evidence span,.topic span{display:block;color:var(--pink);font-size:11px;letter-spacing:.1em;text-transform:uppercase}.evidence h3,.topic h3{font-size:19px;line-height:1.2;margin:10px 0}.evidence p,.topic p,.directory-note{color:var(--muted);margin:0}.topic a{color:var(--ink);text-decoration:none}.topic a:hover{color:var(--pink)}footer{min-height:100px;display:flex;align-items:center;justify-content:space-between;gap:20px;color:var(--muted);font-size:12px}@media(max-width:760px){header,main,footer{width:min(100% - 28px,1180px)}.independent{display:none}.hero{grid-template-columns:1fr;gap:24px;padding:60px 0}.latest,.directory{padding:48px 0}.section-heading{align-items:start;flex-direction:column}.evidence-grid,.topic-grid{grid-template-columns:1fr}footer{align-items:flex-start;flex-direction:column;justify-content:center}}`;

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


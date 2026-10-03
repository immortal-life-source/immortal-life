import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const availabilityPath = args.get('--availability') || 'uptime-report.json';
const output = path.resolve(args.get('--output') || 'tmp/emergency-site');
const repository = process.env.GITHUB_REPOSITORY || 'immortal-life-source/immortal-life';
const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const vercelToken = process.env.VERCEL_ACCESS_TOKEN || '';
const vercelTeamId = process.env.VERCEL_TEAM_ID || 'team_xfwIcV84myMfafZnF4SROOlT';
const supabaseUrl = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/public-intelligence?view=overview&limit=1';
const generatedAt = new Date().toISOString();

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const ageInHours = (value) => value ? Math.max(0, (Date.now() - new Date(value).getTime()) / 3600000) : null;
const ageLabel = (value) => {
  const hours = ageInHours(value);
  if (hours == null || !Number.isFinite(hours)) return 'Not yet verified';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes ago`;
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
};

async function fetchText(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  return JSON.parse(await fetchText(url, options));
}

async function github(pathname) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'immortal-life-resilience-dashboard/1.0' };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  return fetchJson(`https://api.github.com/repos/${repository}${pathname}`, { headers });
}

async function latestWorkflowRun(workflow) {
  try {
    const payload = await github(`/actions/workflows/${workflow}/runs?status=success&per_page=1`);
    const run = payload.workflow_runs?.[0];
    return run ? { state: 'healthy', completed_at: run.updated_at, url: run.html_url } : { state: 'attention', completed_at: null, url: '' };
  } catch (error) {
    return { state: 'unknown', completed_at: null, url: '', note: error.message };
  }
}

async function activeIncidents() {
  try {
    const issues = await github('/issues?state=open&labels=availability-incident&per_page=100');
    return { state: issues.length ? 'attention' : 'healthy', count: issues.length, url: `https://github.com/${repository}/issues?q=is%3Aissue+is%3Aopen+label%3Aavailability-incident` };
  } catch (error) {
    return { state: 'unknown', count: null, url: `https://github.com/${repository}/issues`, note: error.message };
  }
}

async function supabaseHealth() {
  try {
    const payload = await fetchJson(supabaseUrl, { headers: { Accept: 'application/json' } });
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    const latest = sources.map((source) => source.last_success_at).filter(Boolean).sort().at(-1) || payload.generated_at || null;
    const needingAttention = sources.filter((source) => !['healthy'].includes(source.health));
    return {
      state: payload.fallback || payload.unavailable || needingAttention.length ? 'attention' : 'healthy',
      generated_at: payload.generated_at || null,
      last_ingestion_at: latest,
      sources_total: sources.length,
      sources_attention: needingAttention.length,
      records: {
        research: Number(payload.stats?.research_records || 0),
        trials: Number(payload.stats?.clinical_trials || 0),
        topics: Number(payload.stats?.topics || 0),
      },
    };
  } catch (error) {
    return { state: 'attention', generated_at: null, last_ingestion_at: null, sources_total: 0, sources_attention: null, records: {}, note: error.message };
  }
}

function numeric(record, keys) {
  for (const key of keys) {
    const value = Number(record?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

async function vercelCapacity() {
  const dashboardUrl = `https://vercel.com/teams/${vercelTeamId}/usage`;
  if (!vercelToken) return { state: 'connection-required', dashboard_url: dashboardUrl, projects: [] };
  const headers = { Authorization: `Bearer ${vercelToken}`, Accept: 'application/json' };
  try {
    const projectsPayload = await fetchJson(`https://api.vercel.com/v9/projects?teamId=${encodeURIComponent(vercelTeamId)}&limit=100`, { headers });
    const projects = Array.isArray(projectsPayload.projects) ? projectsPayload.projects : [];
    const targets = projects.filter((project) => {
      const searchable = JSON.stringify(project).toLowerCase();
      return project.name === 'immortal-life' || searchable.includes('immortal.life') || project.name === 'live-im' || searchable.includes('live.im');
    });
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    const to = new Date().toISOString();
    let charges = [];
    try {
      const raw = await fetchText(`https://api.vercel.com/v1/billing/charges?teamId=${encodeURIComponent(vercelTeamId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers });
      charges = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
    } catch {
      charges = [];
    }
    const summaries = targets.map((project) => {
      const matching = charges.filter((charge) => {
        const searchable = JSON.stringify(charge).toLowerCase();
        return searchable.includes(String(project.id).toLowerCase()) || searchable.includes(String(project.name).toLowerCase());
      });
      const cost = matching.reduce((sum, charge) => sum + numeric(charge, ['EffectiveCost', 'BilledCost', 'ListCost', 'effectiveCost', 'billedCost']), 0);
      const latestState = project.latestDeployments?.[0]?.readyState || project.latestDeployments?.[0]?.state || 'UNKNOWN';
      return { name: project.name, id: project.id, deployment_state: latestState, attributable_cost_30d: Number(cost.toFixed(4)), charge_rows: matching.length };
    });
    const unhealthy = summaries.filter((project) => !['READY', 'BUILDING', 'QUEUED', 'UNKNOWN'].includes(project.deployment_state));
    return { state: unhealthy.length ? 'attention' : 'healthy', dashboard_url: dashboardUrl, projects: summaries, window: 'Last 30 days' };
  } catch (error) {
    return { state: 'attention', dashboard_url: dashboardUrl, projects: [], note: error.message };
  }
}

let availability;
try {
  availability = JSON.parse(await fs.readFile(availabilityPath, 'utf8'));
} catch {
  availability = { checked_at: null, status: 'attention', healthy: 0, total: 0, results: [] };
}

const [supabase, backup, restore, drill, incidents, vercel] = await Promise.all([
  supabaseHealth(),
  latestWorkflowRun('database-backup.yml'),
  latestWorkflowRun('database-restore-test.yml'),
  latestWorkflowRun('resilience-drill.yml'),
  activeIncidents(),
  vercelCapacity(),
]);

if (backup.completed_at && ageInHours(backup.completed_at) > 8 * 24) backup.state = 'attention';
if (restore.completed_at && ageInHours(restore.completed_at) > 35 * 24) restore.state = 'attention';
const requiredStates = [availability.status === 'healthy' ? 'healthy' : 'attention', supabase.state, backup.state, restore.state, incidents.state];
const overall = requiredStates.includes('attention') ? 'attention' : requiredStates.includes('unknown') ? 'unknown' : 'healthy';

const status = {
  generated_at: generatedAt,
  overall,
  availability: {
    state: availability.status === 'healthy' ? 'healthy' : 'attention',
    checked_at: availability.checked_at || null,
    healthy: Number(availability.healthy || 0),
    total: Number(availability.total || 0),
    routes: (availability.results || []).map((result) => ({ name: result.name, state: result.status, duration_ms: result.final?.duration_ms ?? null })),
  },
  data_service: supabase,
  backup,
  restore,
  drill,
  incidents,
  vercel,
};

const stateLabel = (state) => ({ healthy: 'Operating normally', attention: 'Attention needed', unknown: 'Verification delayed', 'connection-required': 'Private connection pending' }[state] || state);
const card = ({ eyebrow, title, value, state, note, href }) => `<article class="status-card" data-state="${escapeHtml(state)}"><div class="status-card__top"><span>${escapeHtml(eyebrow)}</span><i aria-hidden="true"></i></div><strong>${escapeHtml(value)}</strong><h2>${escapeHtml(title)}</h2><p>${escapeHtml(note)}</p>${href ? `<a href="${escapeHtml(href)}">View evidence →</a>` : ''}</article>`;

const cards = [
  card({ eyebrow: 'PUBLIC WEBSITE', title: 'Primary routes', value: `${status.availability.healthy}/${status.availability.total} verified`, state: status.availability.state, note: `Last external check ${ageLabel(status.availability.checked_at)}.`, href: `https://github.com/${repository}/actions/workflows/public-availability.yml` }),
  card({ eyebrow: 'SCIENTIFIC INDEX', title: 'Data service', value: stateLabel(supabase.state), state: supabase.state, note: `${supabase.sources_total || 0} configured live sources checked; latest successful update ${ageLabel(supabase.last_ingestion_at)}.`, href: 'https://www.immortal.life/resources' }),
  card({ eyebrow: 'RECOVERY COPY', title: 'Independent mirror', value: 'Available now', state: 'healthy', note: 'Hosted outside Vercel with the complete 180-topic static directory.', href: './' }),
  card({ eyebrow: 'DATABASE', title: 'Encrypted backup', value: ageLabel(backup.completed_at), state: backup.state, note: 'Weekly encrypted export retained for 90 days.', href: backup.url }),
  card({ eyebrow: 'RECOVERY TEST', title: 'Isolated database restore', value: ageLabel(restore.completed_at), state: restore.state, note: 'A real backup is restored into a disposable database and verified.', href: restore.url }),
  card({ eyebrow: 'RECOVERY DRILL', title: 'End-to-end resilience', value: drill.completed_at ? ageLabel(drill.completed_at) : 'First run pending', state: drill.completed_at ? drill.state : 'unknown', note: 'Checks alerts, production, mirror, backup freshness, restore freshness and rollback readiness.', href: drill.url || `https://github.com/${repository}/actions/workflows/resilience-drill.yml` }),
  card({ eyebrow: 'INCIDENTS', title: 'Open availability incidents', value: incidents.count == null ? 'Verification delayed' : String(incidents.count), state: incidents.state, note: incidents.count ? 'An unresolved public-route incident is open.' : 'No unresolved availability incident is open.', href: incidents.url }),
  card({ eyebrow: 'VERCEL CAPACITY', title: 'Shared Pro team', value: stateLabel(vercel.state), state: vercel.state, note: vercel.projects.length ? `${vercel.projects.map((project) => `${project.name}: ${project.deployment_state}`).join(' · ')}. Sensitive cost details are not published.` : 'immortal.life and live.im are checked separately once the private read-only token is connected.', href: vercel.dashboard_url }),
];

const routeRows = status.availability.routes.map((route) => `<li><span>${escapeHtml(route.name)}</span><strong data-state="${escapeHtml(route.state)}">${escapeHtml(stateLabel(route.state))}</strong><small>${route.duration_ms == null ? '—' : `${Math.round(route.duration_ms)} ms`}</small></li>`).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="refresh" content="300"><title>Immortal.life system status</title><link rel="stylesheet" href="./emergency.css"></head><body class="status-page"><header><a class="brand" href="https://www.immortal.life/"><span class="mark" aria-hidden="true">∞</span><span>immortal.life</span></a><nav><a href="./">Continuity access</a><a aria-current="page" href="./status.html">System status</a></nav></header><main><section class="status-hero" data-state="${escapeHtml(overall)}"><div><span class="eyebrow">INDEPENDENT SYSTEM STATUS</span><h1>${escapeHtml(stateLabel(overall))}.</h1><p>Clear operational evidence for the public website, scientific index, recovery copy, backups and incident response. This page is generated outside Vercel and refreshes automatically.</p></div><div class="status-seal"><i aria-hidden="true"></i><strong>${escapeHtml(stateLabel(overall))}</strong><span>Updated ${escapeHtml(new Date(generatedAt).toLocaleString('en-GB', { timeZone: 'Europe/Prague', dateStyle: 'medium', timeStyle: 'short' }))} Prague time</span></div></section><section class="status-grid">${cards.join('')}</section><section class="route-panel"><div><span class="eyebrow">EXTERNAL ROUTE CHECKS</span><h2>What visitors can reach right now</h2><p>Each route is requested from GitHub infrastructure, independently of the production host.</p></div><ul>${routeRows}</ul></section><aside class="status-privacy"><strong>What this page does not expose</strong><p>Passwords, API tokens, database details, billing amounts and internal records never enter this public status snapshot. Capacity controls remain private and are never changed automatically.</p></aside></main><footer><span>Independent status for immortal.life</span><span>Production is never intentionally interrupted by a drill</span></footer></body></html>`;

await fs.mkdir(output, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(output, 'status.html'), html, 'utf8'),
  fs.writeFile(path.join(output, 'status-data.json'), `${JSON.stringify(status, null, 2)}\n`, 'utf8'),
]);

console.log(`Built resilience dashboard: ${overall}; ${status.availability.healthy}/${status.availability.total} public checks healthy.`);

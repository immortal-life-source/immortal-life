import fs from 'node:fs/promises';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const availabilityPath = args.get('--availability') || 'uptime-report.json';
const outputPath = args.get('--output') || 'drill-report.json';
const mirror = String(args.get('--mirror') || 'https://immortal-life-source.github.io/immortal-life').replace(/\/$/, '');
const repository = process.env.GITHUB_REPOSITORY || 'immortal-life-source/immortal-life';
const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const vercelToken = process.env.VERCEL_ACCESS_TOKEN || '';
const vercelTeamId = process.env.VERCEL_TEAM_ID || 'team_xfwIcV84myMfafZnF4SROOlT';
const vercelProjectId = process.env.VERCEL_PROJECT_ID || 'prj_KBYMOWhurIkpL530OcpJEgbafQtL';

async function fetchText(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function github(pathname) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'immortal-life-recovery-drill/1.0' };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const { text } = await fetchText(`https://api.github.com/repos/${repository}${pathname}`, { headers });
  return JSON.parse(text);
}

async function latestRun(workflow, maximumAgeDays) {
  const payload = await github(`/actions/workflows/${workflow}/runs?status=success&per_page=1`);
  const run = payload.workflow_runs?.[0];
  if (!run) throw new Error('No successful run exists');
  const ageDays = (Date.now() - new Date(run.updated_at).getTime()) / 86400000;
  if (ageDays > maximumAgeDays) throw new Error(`Latest success is ${Math.round(ageDays)} days old`);
  return { duration_ms: null, detail: `Successful ${Math.max(0, Math.round(ageDays))} days ago`, url: run.html_url };
}

async function check(name, operation) {
  const started = Date.now();
  try {
    const detail = await operation();
    return { name, status: 'healthy', final: { duration_ms: Date.now() - started, ...(detail || {}) } };
  } catch (error) {
    return { name, status: 'failed', final: { duration_ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) } };
  }
}

let availability = { status: 'attention', healthy: 0, total: 0 };
try { availability = JSON.parse(await fs.readFile(availabilityPath, 'utf8')); } catch { /* reported below */ }

const results = [];
results.push(await check('Primary website', async () => {
  if (availability.status !== 'healthy' || availability.healthy !== availability.total) throw new Error(`${availability.healthy || 0}/${availability.total || 0} public checks passed`);
  return { detail: `${availability.healthy}/${availability.total} external routes passed`, http_status: 200 };
}));
results.push(await check('Independent emergency mirror', async () => {
  const [{ response: home, text: homeBody }, { text: statusBody }, { text: metadataBody }] = await Promise.all([
    fetchText(`${mirror}/`),
    fetchText(`${mirror}/status.html`),
    fetchText(`${mirror}/status.json`),
  ]);
  const metadata = JSON.parse(metadataBody);
  if (!homeBody.includes('noindex,nofollow') || !statusBody.includes('INDEPENDENT SYSTEM STATUS')) throw new Error('Mirror safety or status marker missing');
  if (Number(metadata.topics) !== 180) throw new Error(`Expected 180 topics; found ${metadata.topics}`);
  return { detail: 'Continuity directory and status page verified', http_status: home.status };
}));
results.push(await check('Encrypted database backup', () => latestRun('database-backup.yml', 8)));
results.push(await check('Isolated database restore test', () => latestRun('database-restore-test.yml', 35)));
results.push(await check('Vercel rollback history', async () => {
  if (!vercelToken) return { detail: 'Private Vercel connection not configured; native deployment history remains available', skipped: true };
  const headers = { Authorization: `Bearer ${vercelToken}`, Accept: 'application/json' };
  const { text } = await fetchText(`https://api.vercel.com/v6/deployments?teamId=${encodeURIComponent(vercelTeamId)}&projectId=${encodeURIComponent(vercelProjectId)}&target=production&state=READY&limit=2`, { headers });
  const payload = JSON.parse(text);
  if (!Array.isArray(payload.deployments) || payload.deployments.length < 2) throw new Error('Fewer than two ready production deployments are available');
  return { detail: `${payload.deployments.length} recent ready production deployments verified` };
}));

const unhealthy = results.filter((result) => result.status !== 'healthy');
const report = {
  checked_at: new Date().toISOString(),
  origin: 'non-disruptive-recovery-drill',
  status: unhealthy.length ? 'attention' : 'healthy',
  healthy: results.length - unhealthy.length,
  total: results.length,
  results,
};
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
for (const result of results) console.log(`${result.status.toUpperCase()} ${result.name}: ${result.final.error || result.final.detail}`);
if (unhealthy.length) process.exitCode = 1;

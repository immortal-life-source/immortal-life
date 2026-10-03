import fs from 'node:fs/promises';

const [event = 'test', reportPath = 'uptime-report.json', outputPath = 'uptime-email.txt'] = process.argv.slice(2);
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const to = process.env.ALERT_EMAIL_TO || 'hello@immortal.life';
const from = process.env.ALERT_EMAIL_FROM || 'hello@immortal.life';
const labels = {
  incident: '[ACTION] immortal.life availability incident',
  recovered: '[RECOVERED] immortal.life public routes',
  test: '[TEST] immortal.life availability alerts are active',
  'drill-started': '[DRILL STARTED] immortal.life recovery verification',
  'drill-recovered': '[DRILL PASSED] immortal.life recovery verification',
  'drill-failed': '[ACTION] immortal.life recovery drill found a gap',
};
const subject = labels[event] || labels.test;
const unhealthy = report.results.filter((item) => item.status !== 'healthy');
const lines = report.results.map((item) => {
  const detail = item.final?.error
    || `HTTP ${item.final?.http_status ?? 'n/a'}; ${item.final?.duration_ms ?? 'n/a'} ms; cache ${item.final?.vercel_cache || 'unknown'}; source ${item.final?.source || 'standard'}`;
  return `${item.status.toUpperCase()} — ${item.name}: ${detail}`;
});
const introduction = event === 'incident'
  ? `${unhealthy.length} of ${report.total} monitored public checks still failed after retries. Please inspect the linked GitHub incident.`
  : event === 'recovered'
    ? `All ${report.total} monitored public checks recovered.`
    : event === 'drill-started'
      ? 'The scheduled non-disruptive recovery drill has started. Production has not been taken offline.'
      : event === 'drill-recovered'
        ? `The recovery drill passed all ${report.total} required checks without interrupting production.`
        : event === 'drill-failed'
          ? `${unhealthy.length} of ${report.total} recovery checks require attention. Production was not intentionally interrupted.`
    : `This is a requested test. All ${report.healthy} of ${report.total} checks passed when the message was prepared.`;
const runUrl = process.env.GITHUB_RUN_URL || 'https://github.com/immortal-life-source/immortal-life/actions';
const messageId = `<immortal-life-availability-${Date.now()}@immortal.life>`;
const body = [
  `From: Immortal.life availability <${from}>`,
  `To: ${to}`,
  `Subject: ${subject}`,
  `Date: ${new Date().toUTCString()}`,
  `Message-ID: ${messageId}`,
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
  '',
  subject,
  '',
  introduction,
  '',
  `Checked: ${report.checked_at}`,
  `Overall state: ${report.status}`,
  '',
  ...lines,
  '',
  `Workflow: ${runUrl}`,
  '',
  'No billing, deployment, database, or DNS setting was changed automatically.',
  '',
].join('\r\n');

await fs.writeFile(outputPath, body, 'utf8');


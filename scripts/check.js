'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const browserScripts = [
  'auth-x.js',
  'build.js',
  'dashboard.js',
  'join.js',
  'leaderboard.js',
  'main.js',
  'intelligence.js',
  'news-modal.js',
  'spread-copy.js',
];

const edgeScripts = [
  'supabase/functions/_shared/security.ts',
  'supabase/functions/_shared/intelligence.ts',
  'supabase/functions/auth-x-callback/index.ts',
  'supabase/functions/award-points/index.ts',
  'supabase/functions/claim-daily/index.ts',
  'supabase/functions/delete-member/index.ts',
  'supabase/functions/get-dashboard/index.ts',
  'supabase/functions/get-leaderboard/index.ts',
  'supabase/functions/validate-invite/index.ts',
  'supabase/functions/public-intelligence/index.ts',
  'supabase/functions/sync-intelligence/index.ts',
];

for (const file of browserScripts) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

for (const file of edgeScripts) {
  execFileSync(process.execPath, ['--experimental-strip-types', '--check', join(root, file)], {
    stdio: 'inherit',
  });
}

JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const requiredFiles = [
  'supabase/functions/_shared/security.ts',
  'supabase/migrations/20260914000100_membership_schema.sql',
  'supabase/migrations/20260914000200_membership_rpcs.sql',
  'supabase/migrations/20260914000400_intelligence_portal.sql',
  'supabase/migrations/20260914000500_normalize_intelligence_summaries.sql',
  'supabase/audits/membership-integrity.sql',
  'intelligence-template.html',
  'intelligence-topics.json',
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) throw new Error(`Missing required file: ${file}`);
}

console.log(
  `Checks passed: ${browserScripts.length} browser scripts, ${edgeScripts.length} Edge Function modules, JSON configuration, required backend files.`
);

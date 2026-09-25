'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const browserScripts = [
  'auth-x.js',
  'auth-linkedin.js',
  'build.js',
  'dashboard.js',
  'join.js',
  'leaderboard.js',
  'main.js',
  'intelligence.js',
  'news-modal.js',
  'spread-copy.js',
  'widget.js',
  'telemetry.js',
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
  'supabase/functions/member-intelligence/index.ts',
  'supabase/functions/generate-briefings/index.ts',
  'supabase/functions/get-news/index.ts',
  'supabase/functions/start-linkedin-auth/index.ts',
  'supabase/functions/auth-linkedin-callback/index.ts',
  'supabase/functions/public-pages/index.ts',
  'supabase/functions/generate-public-briefing/index.ts',
  'supabase/functions/notify-indexnow/index.ts',
  'supabase/functions/distribute-public-briefing/index.ts',
  'supabase/functions/social-card/index.ts',
  'supabase/functions/check-resource-health/index.ts',
  'supabase/functions/sync-search-console/index.ts',
  'supabase/functions/subscribe-briefing/index.ts',
  'supabase/functions/deliver-briefings/index.ts',
  'supabase/functions/record-utility-event/index.ts',
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
  '.cursor/rules/automated-publication-identity.mdc',
  'linkedin-app-logo.png',
  'scripts/uat.mjs',
  'supabase/functions/_shared/security.ts',
  'supabase/migrations/20260914000100_membership_schema.sql',
  'supabase/migrations/20260914000200_membership_rpcs.sql',
  'supabase/migrations/20260914000400_intelligence_portal.sql',
  'supabase/migrations/20260914000500_normalize_intelligence_summaries.sql',
  'supabase/migrations/20260914000600_intelligence_tranche_two.sql',
  'supabase/migrations/20260914000700_publish_project_news.sql',
  'supabase/migrations/20260914000800_multi_provider_members.sql',
  'supabase/migrations/20260915000100_publication_and_discovery.sql',
  'supabase/migrations/20260915000200_relevance_quality_entities_distribution.sql',
  'supabase/migrations/20260915000300_global_resource_atlas.sql',
  'supabase/migrations/20260915000400_refresh_resource_health.sql',
  'supabase/migrations/20260915000500_link_resource_ingestion_health.sql',
  'supabase/migrations/20260915000600_repair_resource_links.sql',
  'supabase/migrations/20260915000700_search_demand_and_utility.sql',
  'supabase/migrations/20260916000100_reader_growth_loops.sql',
  'supabase/migrations/20260916000200_expand_live_sources.sql',
  'supabase/migrations/20260916000300_global_resource_atlas_expansion.sql',
  'supabase/migrations/20260925000400_source_usage_rights.sql',
  'supabase/migrations/20260925000500_verify_rights_and_rebuild_briefings.sql',
  'supabase/migrations/20260925000600_clinicaltrials_terms_label.sql',
  'supabase/migrations/20260925000700_evidence_snapshots_and_global_live_sources.sql',
  'supabase/migrations/20260925000800_prioritize_evidence_snapshot_backfill.sql',
  'supabase/migrations/20260925000900_dedicated_global_feed_workers.sql',
  'supabase/migrations/20260925001000_stagger_global_feed_capacity.sql',
  'supabase/migrations/20260925001100_fast_public_evidence_indexes.sql',
  'supabase/audits/membership-integrity.sql',
  'intelligence-template.html',
  'content-template.html',
  'intelligence-topics.json',
  'privacy.html',
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) throw new Error(`Missing required file: ${file}`);
}

console.log(
  `Checks passed: ${browserScripts.length} browser scripts, ${edgeScripts.length} Edge Function modules, JSON configuration, required backend files.`
);

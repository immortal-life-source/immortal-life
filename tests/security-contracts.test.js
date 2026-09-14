'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('member sessions are signed, expiring, and verified', () => {
  const security = read('supabase/functions/_shared/security.ts');
  assert.match(security, /HMAC/);
  assert.match(security, /SESSION_SECRET/);
  assert.match(security, /payload\.exp <= now/);
  assert.match(security, /timingSafeEqual/);

  for (const file of ['get-dashboard', 'claim-daily', 'delete-member']) {
    const source = read(`supabase/functions/${file}/index.ts`);
    assert.match(source, /sessionFromRequest\(req\)/);
    assert.doesNotMatch(source, /JSON\.parse\(atob\(/);
  }
});

test('privileged member endpoints do not trust caller-supplied member ids', () => {
  const claim = read('supabase/functions/claim-daily/index.ts');
  const remove = read('supabase/functions/delete-member/index.ts');
  assert.doesNotMatch(claim, /req\.json\(\)/);
  assert.doesNotMatch(claim, /searchParams\.get\(['"]member_id/);
  assert.doesNotMatch(remove, /req\.json\(\)/);
  assert.match(claim, /p_member_id: session\.member_id/);
  assert.match(remove, /p_member_id: session\.member_id/);
});

test('point values are server-controlled and the endpoint is internal-only', () => {
  const source = read('supabase/functions/award-points/index.ts');
  const migration = read('supabase/migrations/20260914000200_membership_rpcs.sql');
  assert.match(source, /isInternalServiceRequest\(req\)/);
  assert.doesNotMatch(source, /base_points/);
  assert.match(migration, /unsupported_points_action/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.award_member_points/);
});

test('OAuth state and PKCE verifier are kept separate', () => {
  const join = read('join.js');
  const callback = read('auth-x.js');
  assert.match(join, /oauth_state/);
  assert.doesNotMatch(join, /stateObj/);
  assert.doesNotMatch(join, /code_verifier:\s*verifier/);
  assert.match(callback, /expected_state/);
  assert.match(callback, /oauth_code_verifier/);
});

test('required clean routes are configured', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.outputDirectory, 'dist');
  const routes = new Map(config.rewrites.map((route) => [route.source, route.destination]));
  assert.equal(routes.get('/auth/x'), '/auth-x');
  assert.equal(routes.get('/invite/:code'), '/join');
});

test('the generated browser config never uses a publishable key as bearer identity', () => {
  const build = read('build.js');
  assert.match(build, /SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(build, /h\.Authorization/);
  assert.match(build, /process\.exit\(1\)/);
});

test('database mutations use atomic RPCs and service-role-only execution', () => {
  const migration = read('supabase/migrations/20260914000200_membership_rpcs.sql');
  for (const fn of ['register_x_member', 'award_member_points', 'claim_daily_points', 'delete_member_account']) {
    assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}`));
  }
  const definerCount = (migration.match(/SECURITY DEFINER/g) || []).length;
  const emptySearchPathCount = (migration.match(/SET search_path = ''/g) || []).length;
  assert.equal(emptySearchPathCount, definerCount);
  assert.match(migration, /FOR UPDATE/g);
});

test('legacy invite records are classified without destructive cleanup', () => {
  const migration = read('supabase/migrations/20260914000300_classify_legacy_invites.sql');
  assert.match(migration, /'available'/);
  assert.match(migration, /'used'/);
  assert.match(migration, /'disabled'/);
  assert.match(migration, /invite_codes_status_consistency/);
  assert.match(migration, /CREATE TRIGGER invite_codes_set_status/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.invite_codes/i);
});

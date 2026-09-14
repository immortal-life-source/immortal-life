'use strict';

const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const test = require('node:test');

test('signed sessions reject tampering, the wrong secret, and expired tokens', async () => {
  const env = {
    SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-service-key',
  };
  globalThis.Deno = { env: { get: (name) => env[name] } };

  const moduleUrl = pathToFileURL(
    join(__dirname, '..', 'supabase', 'functions', '_shared', 'security.ts')
  ).href;
  const {
    createMemberSession,
    isAllowedOrigin,
    isInternalServiceRequest,
    verifyMemberSession,
  } = await import(moduleUrl);

  const token = await createMemberSession(42, 'x-user-42');
  const payload = await verifyMemberSession(token);
  assert.equal(payload.member_id, 42);
  assert.equal(payload.x_id, 'x-user-42');

  const [encoded, signature] = token.split('.');
  const replacement = encoded[0] === 'a' ? 'b' : 'a';
  assert.equal(await verifyMemberSession(replacement + encoded.slice(1) + '.' + signature), null);

  env.SESSION_SECRET = 'another-test-secret-with-at-least-32-characters';
  assert.equal(await verifyMemberSession(token), null);
  env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';

  const realNow = Date.now;
  let expiredToken;
  try {
    Date.now = () => realNow() - 31 * 24 * 60 * 60 * 1000;
    expiredToken = await createMemberSession(42, 'x-user-42');
  } finally {
    Date.now = realNow;
  }
  assert.equal(await verifyMemberSession(expiredToken), null);
  assert.equal(await verifyMemberSession('not-a-token'), null);

  assert.equal(isAllowedOrigin(new Request('https://example.test', {
    headers: { Origin: 'https://immortal.life' },
  })), true);
  assert.equal(isAllowedOrigin(new Request('https://example.test', {
    headers: { Origin: 'https://attacker.example' },
  })), false);
  assert.equal(isInternalServiceRequest(new Request('https://example.test', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  })), true);
  assert.equal(isInternalServiceRequest(new Request('https://example.test', {
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  })), false);
});

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const backup = readFileSync('.github/workflows/database-backup.yml', 'utf8')
const restore = readFileSync('.github/workflows/database-restore-test.yml', 'utf8')
const runbook = readFileSync('docs/database-recovery-runbook.md', 'utf8')

test('weekly database backup is encrypted before upload and retains no plaintext artifact', () => {
  assert.match(backup, /cron: "17 2 \* \* 0"/)
  assert.match(backup, /openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000/)
  assert.match(backup, /path: backup\/encrypted\//)
  assert.doesNotMatch(backup, /path: backup\/plain\//)
  assert.match(backup, /cd backup\/encrypted[\s\S]*sha256sum immortal-life-database\.tar\.gz\.enc/)
  assert.match(backup, /retention-days: 90/)
})

test('monthly restore test targets only a disposable PostgreSQL service', () => {
  assert.match(restore, /cron: "43 3 1 \* \*"/)
  assert.match(restore, /create database immortal_life_restore_test/)
  assert.match(restore, /scripts\/verify-restored-database\.sql/)
  assert.doesNotMatch(restore, /nifbuyoghesveotugday/)
  assert.match(runbook, /Production is never a restore-test target\./)
})

test('backup credentials are secret-backed and never embedded in workflows', () => {
  assert.match(backup, /secrets\.SUPABASE_ACCESS_TOKEN/)
  assert.match(backup, /secrets\.BACKUP_ENCRYPTION_PASSPHRASE/)
  assert.match(restore, /secrets\.BACKUP_ENCRYPTION_PASSPHRASE/)
  assert.doesNotMatch(`${backup}\n${restore}`, /sbp_[A-Za-z0-9_-]{20,}/)
})

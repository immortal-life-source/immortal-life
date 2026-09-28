# Database recovery runbook

## Recovery objectives

- Supabase remains the primary managed database and provides daily physical backups.
- GitHub Actions creates a separate encrypted logical backup of the project-owned `public` schema and data every Sunday.
- Encrypted artifacts are retained for 90 days.
- On the first day of every month, the latest successful artifact is decrypted and restored into an isolated PostgreSQL service container.
- Production is never a restore-test target.

## Repository protection

The versioned `.github/branch-protection.json` policy prevents force-pushes and deletion of `main`, applies to administrators, and requires linear history without forcing a multi-review workflow on the current solo-maintainer project. GitHub secret scanning, push protection, Dependabot alerts, and automated security fixes must remain enabled.

## Required GitHub Actions secrets

- `SUPABASE_ACCESS_TOKEN`: a scoped Supabase personal access token used by the official CLI to request temporary database credentials.
- `BACKUP_ENCRYPTION_PASSPHRASE`: a randomly generated recovery secret of at least 32 bytes.

Never store either value in the repository, workflow logs, issues, or documentation. Keep an offline copy of the encryption passphrase in the owner’s password manager. Losing both the GitHub secret and the offline copy makes the encrypted backups unrecoverable.

## Backup contents and exclusions

The external backup contains the `public` PostgreSQL schema and its data, including the knowledge corpus, ingestion state, member tables, briefings, and project configuration stored there. It does not contain Supabase platform-managed schemas or Storage objects. The application currently does not use Supabase Storage; introduce a separate object-backup procedure before adding uploads.

## If a scheduled backup fails

1. Do not delete or overwrite any earlier successful artifact.
2. Read the failed workflow log and classify the failure as authentication, database connectivity, export, encryption, or artifact upload.
3. Correct the cause without relaxing encryption or repository visibility controls.
4. Run `Encrypted database backup` manually.
5. Confirm that a new encrypted artifact exists before closing the incident.

## If a restore test fails

1. Production remains untouched; the test database is disposable.
2. Preserve the encrypted source artifact and failed workflow log.
3. Determine whether decryption, checksum verification, schema restoration, data restoration, or integrity checks failed.
4. Fix the workflow or database compatibility issue.
5. Run the restore test again until all critical-table and minimum-record checks pass.
6. Escalate immediately if two consecutive tests fail or no successful backup exists within eight days.

## Real recovery

Use a new isolated Supabase project or PostgreSQL instance first. Restore `schema.sql`, then `data.sql`, run `scripts/verify-restored-database.sql`, and validate the application against the recovered database before changing any production connection. A production replacement requires explicit owner approval and a separately documented cutover plan.


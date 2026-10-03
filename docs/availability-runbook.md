# Immortal.life availability runbook

## Objective

Keep a useful, source-linked version of immortal.life available during provider, source, database, deployment, or traffic incidents. No system can guarantee literal zero downtime; the operating target is rapid detection, graceful degradation, and verified recovery.

## Service map

- Vercel serves static assets, CDN responses, and server-rendered public routes.
- Supabase stores the primary index and runs ingestion, scheduled jobs, public data functions, and reports.
- GitHub stores source code, runs CI, performs encrypted database exports and restore tests, and independently monitors public availability.
- DNSOwl provides authoritative DNS.
- Postale provides the hello@immortal.life mailbox.
- Google Search Console supplies search-performance telemetry.

`live.im` shares the Vercel Pro team with immortal.life. Vercel usage and spending must therefore be reviewed both by project and at team level. A spike from either project can consume shared team headroom. This repository does not change live.im or its billing controls.

## Automated public monitoring

`.github/workflows/public-availability.yml` runs every five minutes from GitHub Actions, independently of Vercel and Supabase. Each route receives up to three attempts. The monitor verifies HTTP success, a route-specific content marker, and the absence of a server-side static fallback header.

Monitored routes:

- `/`
- `/topics/frailty`
- `/universities`
- `/research`
- `/trials`
- `/funding`
- `/sitemap.xml`
- `/institutional-pilot`
- `/api/intelligence?view=topic-dossier&topic=exercise&limit=12`

On a persistent failure, the workflow opens or updates one GitHub issue labelled `availability-incident`, emails `hello@immortal.life` directly through Postale, and fails the workflow. Repeated failed checks update the same incident without repeatedly emailing. When all routes recover, the workflow comments with the recovery time, sends one recovery email, and closes the incident.

The Postale password is stored only in the encrypted GitHub Actions secret `POSTALE_SMTP_PASSWORD`. It must never be committed, printed, copied into an issue, or pasted into project documentation.

## Independent emergency mirror

`.github/workflows/emergency-mirror.yml` publishes a small static continuity site to GitHub Pages on relevant changes, every hour, and on manual request. It is hosted outside Vercel and does not require Supabase to display the complete 180-topic directory. When Supabase remains healthy, the mirror also connects directly to the read-only public index for a small latest-evidence view.

The mirror is explicitly `noindex` and blocked by its own `robots.txt`, so it does not compete with the canonical immortal.life pages in search. It is an emergency access path, not a second canonical website. Automatic DNS failover is not enabled; changing DNS remains a deliberate recovery action.

The continuity site is available at `https://immortal-life-source.github.io/immortal-life/`. Its independent dashboard is at `https://immortal-life-source.github.io/immortal-life/status.html`; `/status` on the primary website redirects there. The dashboard reports external route availability, public data-service freshness, backup age, restore-test age, the latest recovery drill, and active incidents. It never publishes passwords, tokens, database internals, raw billing data, or private records.

## Non-disruptive recovery drill

`.github/workflows/resilience-drill.yml` runs on the third day of every month and on manual request. It does not intentionally take production offline. It opens a clearly labelled drill issue, sends a simulated detection email to `hello@immortal.life`, verifies the source and build, checks all public routes, verifies the independent mirror and its 180-topic directory, confirms that the encrypted backup and isolated restore test are recent, checks Vercel rollback history when the private read-only token is connected, then sends a result email. A successful drill closes its issue; a failed drill leaves the issue open and the workflow red.

Drill evidence is retained as a workflow artifact for 90 days. `POSTALE_SMTP_PASSWORD` and the optional `VERCEL_ACCESS_TOKEN` exist only as encrypted GitHub Actions secrets.

## Visitor fallback

Public pages use CDN caching with stale-while-revalidate and stale-if-error directives. Browser intelligence responses retain verified data for 15 minutes as the preferred response and for up to seven days as an emergency last-verified snapshot. A fallback or unavailable payload is never written over a previously verified snapshot.

When stale verified data is used, the page must say that the live source is delayed and show when the snapshot was saved. Unscored upstream search results must never be presented as verified dossier evidence.

## Incident priorities

1. Confirm the failure using the GitHub workflow report and a second network or browser.
2. Determine whether the fault is Vercel, Supabase, DNS, a deployment, or an upstream data source.
3. Preserve the current production deployment and database. Do not run destructive recovery commands.
4. If pages are serving verified cached data, keep them online while repairing the live path.
5. If a new deployment caused the incident, use Vercel's recoverable deployment rollback rather than modifying the database.
6. If Supabase is degraded, reduce background ingestion pressure before changing visitor-facing data or paid capacity.
7. Record the start, detection, user impact, remediation, recovery time, and preventive follow-up in the incident issue.

## Billing safety

- Supabase spending controls remain capped. They must not be changed automatically.
- Vercel billing or automatic-pause settings must not be changed by code or automation.
- Capacity changes require Marek's explicit approval.
- Because live.im and immortal.life share a Vercel team, team totals alone are insufficient; review the per-project breakdown before attributing usage.

## Recovery evidence

- Supabase Pro daily backups provide the short recovery window.
- `.github/workflows/database-backup.yml` creates a weekly encrypted export of the project-owned `public` schema and retains it for 90 days.
- `.github/workflows/database-restore-test.yml` performs the monthly isolated restore test.
- Database recovery does not by itself restore DNS, provider settings, mail, OAuth credentials, Supabase Storage objects, or third-party accounts.

## Manual checks after recovery

1. Homepage loads and search controls render.
2. A topic dossier shows non-fallback verified data.
3. Research, trials, universities, and funding render source-linked records.
4. The sitemap returns valid XML.
5. The institutional pilot loads its live snapshot.
6. The most recent ingestion checkpoint continues advancing.
7. No unexpected billing, traffic, or database-latency spike remains.


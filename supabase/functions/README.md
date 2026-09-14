# Supabase backend

The membership backend is deployed as Supabase Edge Functions. Database state and privileged mutations are defined in `supabase/migrations`; do not recreate the schema manually from the product brief.

## Security model

- X OAuth uses Authorization Code + PKCE and a random browser-bound state value.
- `auth-x-callback` returns a signed, expiring HMAC session token. The browser stores the opaque token in `sessionStorage` and sends it as a bearer token.
- `get-dashboard`, `claim-daily`, and `delete-member` verify the token signature, expiry, member ID, and X ID before using service-role access.
- `award-points` accepts only the Supabase service-role key in the `apikey` header. Point values are selected inside `award_member_points`; callers cannot provide arbitrary values.
- Registration, invite consumption, referral awards, daily claims, threshold unlocks, and account deletion run in database transactions through security-definer RPCs.
- RLS is enabled with no client policies. The static frontend never queries membership tables directly.

`verify_jwt = false` in `supabase/config.toml` is intentional: public functions and the custom HMAC bearer token cannot use Supabase Auth JWT verification. Each privileged function performs the appropriate application-level verification.

## Functions

- `validate-invite`: validates one eight-character invite code.
- `auth-x-callback`: exchanges an X authorization code, registers or updates the member atomically, and issues a signed session.
- `award-points`: internal-only adapter for the `award_member_points` RPC.
- `get-dashboard`: authenticated member profile, deterministic rank, invite codes, and recent point activity.
- `get-leaderboard`: public, deterministic leaderboard with bounded pagination.
- `claim-daily`: authenticated claim eligibility and atomic 20-hour reward claim.
- `delete-member`: authenticated, atomic account deletion.

The existing newsletter functions (`subscribe`, `confirm`, and `unsubscribe`) are deployed separately. `get-news` is defined here and serves the project-owned, migration-seeded development log.

`sync-intelligence` runs the literature, trial registry, Crossref retraction, EMA, and SÚKL ingestion jobs. `member-intelligence` provides signed-session watchlists and private briefing access. `generate-briefings` is called by the database scheduler every Monday and idempotently generates one briefing per opted-in member and period.

## Required secrets

Set these in Supabase Edge Function secrets:

- `SUPABASE_URL` (normally provided automatically)
- `SUPABASE_SERVICE_ROLE_KEY` (normally provided automatically; `SERVICE_ROLE_KEY` remains a supported legacy alias)
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_REDIRECT_URI=https://immortal.life/auth/x`
- `SESSION_SECRET` containing at least 32 random characters
- `ALLOWED_ORIGINS` only when additional trusted origins are required

Vercel needs only the public `SUPABASE_PUBLISHABLE_KEY` used by `build.js` to generate `il-config.js`. The legacy `SUPABASE_ANON_KEY` name remains supported.

## Deployment order

From a linked Supabase CLI project:

```bash
supabase db push
supabase functions deploy validate-invite
supabase functions deploy auth-x-callback
supabase functions deploy award-points
supabase functions deploy get-dashboard
supabase functions deploy get-leaderboard
supabase functions deploy claim-daily
supabase functions deploy delete-member
```

Before deploying the OAuth function, configure the X Developer Portal callback URL exactly as `https://immortal.life/auth/x`.

Run `npm test` before deployment. Then verify invalid and valid invites, new signup, existing-member login, referral awards, 20-hour claim enforcement, leaderboard ordering, session expiry, and account deletion in a non-production Supabase project.

After migrating production, run the read-only checks in `supabase/audits/membership-integrity.sql`. Investigate any returned rows before reopening onboarding; the former public point-award path means historical totals cannot be assumed trustworthy.

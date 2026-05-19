# immortal.life — Membership System
## Complete Cursor Implementation Brief v2.0
**Date:** May 2026  
**Builds on:** existing immortal.life codebase (index.html, style.css, main.js, Supabase, Vercel)

---

## 1. Overview

This brief describes the complete membership layer to be added to immortal.life. The existing landing page and email capture remain unchanged. A new exclusive membership tier is added on top, accessible only via X (Twitter) OAuth and a valid invite code.

### Two-tier structure

| Tier | How to join | What they get |
|------|------------|---------------|
| **Subscriber** | Email form on landing page (existing) | Confirmation email, on the list |
| **Member** | Invite code + X OAuth | Dashboard, points, invite codes, leaderboard |

---

## 2. New pages and routes

| Route | Description |
|-------|-------------|
| `/join` | Invite code entry page — first step for new members |
| `/auth/x` | X OAuth callback handler |
| `/dashboard` | Private member dashboard (requires auth) |
| `/leaderboard` | Public leaderboard — visible to everyone |
| `/invite/[code]` | Direct invite link — pre-fills the code on /join |

---

## 3. Database schema (Supabase)

### New table: `members`
Separate from the existing `subscribers` table.

```sql
CREATE TABLE public.members (
  id              bigserial PRIMARY KEY,
  created_at      timestamptz DEFAULT now() NOT NULL,
  x_id            text UNIQUE NOT NULL,
  x_username      text NOT NULL,
  x_display_name  text NOT NULL,
  x_avatar_url    text,
  x_follower_count integer DEFAULT 0,
  points          integer DEFAULT 0 NOT NULL,
  tier            text DEFAULT 'member' NOT NULL,
  invited_by      bigint REFERENCES public.members(id),
  referral_chain_depth integer DEFAULT 0,
  network_size    integer DEFAULT 0,
  multiplier      numeric(3,1) DEFAULT 1.0,
  last_login      timestamptz DEFAULT now(),
  login_streak    integer DEFAULT 0,
  confirmed_email boolean DEFAULT false
);
```

### New table: `invite_codes`

```sql
CREATE TABLE public.invite_codes (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  code        text UNIQUE NOT NULL,
  owner_id    bigint REFERENCES public.members(id) NOT NULL,
  used_by     bigint REFERENCES public.members(id),
  used_at     timestamptz,
  is_used     boolean DEFAULT false NOT NULL
);
```

### New table: `points_log`
Audit trail of every point transaction.

```sql
CREATE TABLE public.points_log (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  member_id   bigint REFERENCES public.members(id) NOT NULL,
  action      text NOT NULL,
  points      integer NOT NULL,
  meta        jsonb
);
```

### New table: `x_posts`
Tracks verified X posts mentioning immortal.life.

```sql
CREATE TABLE public.x_posts (
  id              bigserial PRIMARY KEY,
  created_at      timestamptz DEFAULT now() NOT NULL,
  member_id       bigint REFERENCES public.members(id) NOT NULL,
  post_id         text UNIQUE NOT NULL,
  signups_driven  integer DEFAULT 0,
  points_awarded  integer DEFAULT 0
);
```

---

## 4. Points system

### Fixed actions (capped — earned once)

| Action | Points |
|--------|--------|
| Account created + X connected | 300 |
| First daily login | 10 (daily, not once) |

### Uncapped actions (determine leaderboard rank)

| Action | Points |
|--------|--------|
| Direct invite signup (someone uses your code) | 500 |
| Their invitee signs up (depth 2) | 250 |
| Depth 3 chain signup | 125 |
| Verified X post drives a signup | 300 per signup |

### Multiplier (applied to all new points earned)

| Network size | Multiplier |
|-------------|-----------|
| 1–10 members | 1.0× |
| 11–50 members | 1.5× |
| 51–200 members | 2.0× |
| 200+ members | 3.0× |

Network size = direct invitees + their invitees + chain depth 3.

### Invite code unlock thresholds

| Points earned | Codes unlocked |
|--------------|---------------|
| Account creation | 3 codes |
| 1,000 points | +3 codes |
| 5,000 points | +10 codes |
| 20,000 points | +50 codes |

### Tiers (based on leaderboard rank, not points)

| Tier | Rank |
|------|------|
| Founding Circle | Top 10 |
| Builder | Top 11–100 |
| Early | Top 101–1,000 |
| Member | Everyone else |

---

## 5. X OAuth flow

Use X OAuth 2.0 (PKCE flow). Required scopes: `tweet.read users.read offline.access`

### Flow steps:
1. User visits `/join`, enters valid invite code
2. Code validated against `invite_codes` table — must exist and `is_used = false`
3. Code stored in session/cookie temporarily
4. User clicks "Continue with X" → redirected to X OAuth
5. X redirects to `/auth/x?code=...&state=...`
6. Server exchanges code for access token
7. Server fetches user profile from X API (`/2/users/me`)
8. Check if `x_id` already exists in `members` table
   - If yes: log them in, update `last_login`, award daily login points if eligible
   - If no: create new member, mark invite code as used, award signup points, trigger chain points up the referral tree
9. Set secure HTTP-only session cookie
10. Redirect to `/dashboard`

### X API fields to store:
- `id` → x_id
- `username` → x_username  
- `name` → x_display_name
- `profile_image_url` → x_avatar_url
- `public_metrics.followers_count` → x_follower_count

---

## 6. Referral chain points logic

When member C signs up using a code owned by member B, who was invited by member A:

1. Member B receives 500 points (direct invite)
2. Member A receives 250 points (depth 2 chain bonus)
3. If member A was invited by member Z: member Z receives 125 points (depth 3)
4. Recalculate network_size for all affected members
5. Recalculate multiplier for all affected members
6. Log all transactions in `points_log`

This logic runs in a Supabase Edge Function called `award-points`.

---

## 7. Edge Functions needed

### Existing (already deployed — do not modify):
- `subscribe` — email capture
- `confirm` — email confirmation
- `unsubscribe` — email unsubscribe

### New Edge Functions to create:

**`validate-invite`**
- POST `{ code: string }`
- Returns `{ valid: boolean, owner_username: string }`
- Does not mark code as used — only validates

**`auth-x-callback`**
- Handles X OAuth callback
- Exchanges code for token, fetches profile, creates/updates member
- Awards signup points, triggers chain points
- Sets session cookie
- Returns redirect to `/dashboard`

**`award-points`**
- Internal function called by auth-x-callback and other triggers
- Input: `{ member_id, action, meta }`
- Calculates points including multiplier
- Inserts into points_log
- Updates members.points
- Recalculates network_size and multiplier for affected members

**`get-dashboard`**
- GET — requires valid session cookie
- Returns member profile, points, rank, invite codes, points_log recent entries

**`get-leaderboard`**
- GET — public, no auth required
- Returns top 100 members sorted by points
- Fields: rank, x_username, x_display_name, x_avatar_url, points, tier, network_size

**`daily-login`**
- POST — requires valid session cookie
- Awards 10 points if last_login was > 20 hours ago
- Updates last_login and login_streak

---

## 8. New pages — design specifications

All new pages follow the existing immortal.life design system exactly:
- Background: `#070706`
- Gold accent: `#b8955a`  
- Primary text: `#ede9e0`
- Secondary text: `#8a8878`
- Font serif: Cormorant 200/300
- Font sans: Instrument Sans 300/400
- Same grain overlay, same border tokens

### `/join` — Invite code entry page

**Layout:** Single column, centred, full viewport height

**Elements:**
- Logo top left: `immortal.life`
- Headline: *"You were invited."* (Cormorant, large)
- Subline: *"Enter your invite code to request access."* (Instrument Sans, muted)
- Input field: single text input, uppercase, monospace feel, gold border on focus
- Button: "Continue" → gold background, dark text
- On valid code: input turns gold, brief success state, "Continue with X" button appears
- On invalid code: input border turns red, error message: *"This code is not valid."*
- Below form: *"No invite code? Join the waiting list."* → links to main page email form

**States:**
1. Default — empty input
2. Validating — subtle loading indicator
3. Valid — success state, X button appears
4. Invalid — error state
5. Redirecting to X OAuth

### `/dashboard` — Private member dashboard

**Layout:** Two column on desktop, single column on mobile

**Left column — member identity:**
- X avatar (circular, gold border)
- X display name (Cormorant, large)
- @username (muted, small)
- Current tier badge (Founding Circle / Builder / Early / Member)
- Points total (Cormorant, very large, gold)
- Rank: *"#247 on the leaderboard"*
- Network size: *"12 people in your network"*

**Right column — actions and tools:**

*Invite codes section:*
- Heading: *"Your invite codes"*
- Grid of available codes — each displayed as a copyable string
- Used codes shown as struck through and greyed
- Unlock progress bar: *"Earn 340 more points to unlock 3 new codes"*

*Referral link section:*
- Unique URL: `immortal.life/invite/[their-code]`
- Copy button
- Share on X button — pre-populates: *"I secured my place on immortal.life — join me: immortal.life/invite/[code]"*

*Points breakdown:*
- Recent activity log from points_log
- Each entry: action description, points earned, timestamp

*How to earn more:*
- Collapsed accordion showing all point-earning actions with current values

### `/leaderboard` — Public leaderboard

**Layout:** Full page, accessible without login

**Elements:**
- Header: *"The founding circle"* (Cormorant, large)
- Subline: *"The people building immortal.life from the beginning."*
- Live counter: *"[N] founding members"*
- Top 10 — featured prominently with large avatars, rank number, display name, points, tier badge
- Rank 11–100 — compact list view
- Rank 101+ — pagination, 50 per page
- If viewer is a member and logged in: their own rank highlighted

**Each leaderboard entry shows:**
- Rank number
- X avatar
- X display name
- @username (links to their X profile)
- Points total
- Tier badge
- Network size

**Non-member CTA:**
- Fixed bottom bar: *"You are not on the list. Do you have an invite code?"* → links to `/join`

---

## 9. Landing page changes (index.html)

**Minimal changes to existing page — do not redesign.**

### Add: Live member counter in hero
Below the existing subline text, add:
```
[N] founding members · [N] on the waiting list
```
Numbers update from Supabase on page load. Small, muted, Instrument Sans.

### Add: Second CTA below existing email form
After the "Secure your place" form, add a subtle divider and:
```
Already have an invite code?
[Enter the members area →]
```
Links to `/join`. Styled as a text link, not a button — secondary to the email capture.

### Do NOT change:
- The hero headline
- The particle animation
- The manifesto section
- The pillars section
- The existing email form
- The privacy policy
- The footer

---

## 10. Vercel configuration updates

Add to `vercel.json` CSP `connect-src`:
- `https://api.twitter.com`
- `https://api.x.com`

Add new routes:
```json
{
  "rewrites": [
    { "source": "/auth/x", "destination": "/auth-x.html" },
    { "source": "/dashboard", "destination": "/dashboard.html" },
    { "source": "/leaderboard", "destination": "/leaderboard.html" },
    { "source": "/join", "destination": "/join.html" },
    { "source": "/invite/:code", "destination": "/join.html?code=:code" }
  ]
}
```

---

## 11. Environment variables needed

Add to Vercel Environment Variables (Settings → Environment Variables):

| Key | Value |
|-----|-------|
| `X_CLIENT_ID` | From X Developer Portal app |
| `X_CLIENT_SECRET` | From X Developer Portal app |
| `X_REDIRECT_URI` | `https://immortal.life/auth/x` |
| `SESSION_SECRET` | Random 32-char string for signing cookies |

Add to Supabase Edge Function Secrets (already have RESEND_API_KEY and SERVICE_ROLE_KEY):

| Key | Value |
|-----|-------|
| `X_CLIENT_ID` | Same as above |
| `X_CLIENT_SECRET` | Same as above |
| `X_REDIRECT_URI` | Same as above |
| `SESSION_SECRET` | Same as above |

---

## 12. X Developer Portal setup

Before any code is written, complete this setup:

1. Go to developer.twitter.com
2. Create a new app (or use existing)
3. Enable OAuth 2.0
4. Set redirect URI to: `https://immortal.life/auth/x`
5. Set app permissions to: Read
6. Copy Client ID and Client Secret
7. Add both to Vercel environment variables and Supabase secrets

---

## 13. Implementation order

Cursor should implement in this exact sequence. Do not proceed to next step until previous is confirmed working.

**Phase 1 — Database**
1. Run all SQL from Section 3 in Supabase SQL Editor
2. Enable RLS on all new tables
3. Add insert/select policies for Edge Functions

**Phase 2 — Edge Functions**
4. Deploy `validate-invite` function
5. Deploy `award-points` function
6. Deploy `auth-x-callback` function
7. Deploy `get-dashboard` function
8. Deploy `get-leaderboard` function
9. Deploy `daily-login` function

**Phase 3 — Pages**
10. Build `/join` page
11. Build `/dashboard` page
12. Build `/leaderboard` page
13. Update `index.html` with counter and second CTA

**Phase 4 — Integration**
14. Update `vercel.json`
15. Test complete flow end to end
16. Deploy to production

---

## 14. Testing checklist

Before going live verify:

- [ ] Invite code validation works (valid and invalid codes)
- [ ] X OAuth flow completes successfully
- [ ] New member created in database on first login
- [ ] Signup points awarded correctly (300 points)
- [ ] Invite code marked as used after signup
- [ ] Chain points awarded to inviter (500 points)
- [ ] Chain points awarded to inviter's inviter (250 points)
- [ ] 3 invite codes generated for new member
- [ ] Dashboard loads with correct data
- [ ] Daily login points awarded (10 points, once per 20 hours)
- [ ] Leaderboard loads publicly without login
- [ ] Leaderboard updates when points change
- [ ] Referral link `/invite/[code]` pre-fills code on /join
- [ ] Share on X button generates correct pre-populated text
- [ ] Invite code unlock thresholds work correctly
- [ ] Multiplier recalculates when network grows
- [ ] Mobile responsive on all new pages
- [ ] CSP headers allow X API calls

---

## 15. What NOT to do

- Do not modify existing `subscribers` table
- Do not change the existing email capture flow
- Do not redesign the landing page hero, manifesto, or pillars
- Do not add the countdown clock (deferred decision)
- Do not implement X post verification yet (Phase 2 feature)
- Do not store X access tokens in the database (security risk)
- Do not expose SERVICE_ROLE_KEY in any frontend code
- Do not use localStorage or sessionStorage (not supported in artifacts)
- Do not add any frameworks — keep vanilla JS + Supabase Edge Functions architecture

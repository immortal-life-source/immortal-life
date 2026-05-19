# Supabase Edge Functions

Source lives in this repo; **deployment is done in your Supabase project**.

## Functions

| Slug | Folder | Purpose |
|------|--------|---------|
| `validate-invite` | `validate-invite/` | POST JSON `{ code }` — validate unused invite |
| `award-points` | `award-points/` | POST JSON `{ member_id, action, base_points, meta }` |
| `get-leaderboard` | `get-leaderboard/` | GET `?limit=&offset=` — public leaderboard slice |
| `auth-x-callback` | `auth-x-callback/` | X OAuth: **POST** JSON `{ code, state, code_verifier }` returns `{ ok, session }`; **GET** redirects + `Set-Cookie` (legacy; cookie won’t land on immortal.life when the response is from `*.supabase.co`) |
| `get-dashboard` | `get-dashboard/` | **GET** with `Authorization: Bearer <base64 session payload>` — member row, rank, invite codes, points log (see `dashboard.html`) |

For **auth-x-callback**, set **`X_REDIRECT_URI`** to **`https://immortal.life/auth/x`** so it matches the X Developer Portal and `join.html`.

## Secrets (Edge Functions → Secrets)

- `SERVICE_ROLE_KEY`, `SUPABASE_URL` (auto)
- `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REDIRECT_URI` (`https://immortal.life/auth/x`)

## Deploy via Dashboard (“Via Editor”)

For each function:

1. **Edge Functions → Deploy new function → Via Editor**
2. Name the function exactly (each as its own function):  
   `validate-invite`, `award-points`, `get-leaderboard`, `auth-x-callback`, **`get-dashboard`**
3. Paste the contents of the matching `index.ts` file from this repo.
4. Deploy.
5. Open **that function’s Settings** and turn **OFF** **“Verify JWT with legacy secret”** (as you requested).

## Deploy via CLI (optional)

From repo root, with [Supabase CLI](https://supabase.com/docs/guides/cli) linked:

```bash
supabase functions deploy validate-invite --no-verify-jwt
supabase functions deploy award-points --no-verify-jwt
supabase functions deploy get-leaderboard --no-verify-jwt
supabase functions deploy auth-x-callback --no-verify-jwt
supabase functions deploy get-dashboard --no-verify-jwt
```

(`--no-verify-jwt` matches turning off JWT verification in the dashboard.)

## Frontend session note

The browser **cannot** send an `HttpOnly` cookie set by `*.supabase.co` to `immortal.life`. **POST `/auth-x-callback`** returns `{ session }`; `auth-x.html` stores it in **`sessionStorage`** as `il_session` and `dashboard.html` sends it as **`Authorization: Bearer …`** to **`get-dashboard`**.

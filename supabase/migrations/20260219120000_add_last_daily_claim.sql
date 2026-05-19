-- Daily claim eligibility (separate from OAuth last_login)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS last_daily_claim timestamptz;

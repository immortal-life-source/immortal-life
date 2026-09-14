-- Backward-compatible patch for projects where the membership table was
-- originally created manually. Fresh databases create this column in the
-- versioned membership schema migration that follows.
DO $$
BEGIN
  IF to_regclass('public.members') IS NOT NULL THEN
    ALTER TABLE public.members ADD COLUMN IF NOT EXISTS last_daily_claim timestamptz;
  END IF;
END;
$$;

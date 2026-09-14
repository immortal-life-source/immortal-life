ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.invite_codes
SET status = CASE
  WHEN is_used = false THEN 'available'
  WHEN used_by IS NOT NULL AND used_at IS NOT NULL THEN 'used'
  ELSE 'disabled'
END
WHERE status IS NULL
   OR status NOT IN ('available', 'used', 'disabled');

-- Legacy system-issued codes have no member owner, so production-compatible
-- schema must permit a null owner even though ordinary member codes always
-- receive one through issue_invite_codes().
ALTER TABLE public.invite_codes ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.invite_codes ALTER COLUMN status SET DEFAULT 'available';
ALTER TABLE public.invite_codes ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.invite_codes DROP CONSTRAINT IF EXISTS invite_codes_status_consistency;
ALTER TABLE public.invite_codes ADD CONSTRAINT invite_codes_status_consistency CHECK (
  (status = 'available' AND is_used = false AND used_by IS NULL AND used_at IS NULL)
  OR
  (status = 'used' AND is_used = true AND used_by IS NOT NULL AND used_at IS NOT NULL)
  OR
  (status = 'disabled' AND is_used = true AND used_by IS NULL)
);

CREATE INDEX IF NOT EXISTS invite_codes_status_idx
  ON public.invite_codes (status, created_at);

CREATE OR REPLACE FUNCTION public.set_invite_code_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_used = false THEN
    IF NEW.used_by IS NOT NULL OR NEW.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'available_invite_has_usage_metadata';
    END IF;
    NEW.status := 'available';
  ELSIF NEW.used_by IS NOT NULL AND NEW.used_at IS NOT NULL THEN
    NEW.status := 'used';
  ELSIF NEW.used_by IS NULL THEN
    NEW.status := 'disabled';
  ELSE
    RAISE EXCEPTION 'used_invite_missing_timestamp';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invite_codes_set_status ON public.invite_codes;
CREATE TRIGGER invite_codes_set_status
BEFORE INSERT OR UPDATE OF is_used, used_by, used_at
ON public.invite_codes
FOR EACH ROW
EXECUTE FUNCTION public.set_invite_code_status();

REVOKE ALL ON FUNCTION public.set_invite_code_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_invite_code_status() TO service_role;

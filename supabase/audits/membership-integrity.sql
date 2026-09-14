-- Read-only checks to run after applying the security migrations and before
-- reopening member onboarding. Every query should return zero rows.

-- Member totals must equal the immutable point ledger.
SELECT
  m.id,
  m.x_username,
  m.points AS stored_points,
  coalesce(sum(pl.points), 0)::integer AS ledger_points
FROM public.members m
LEFT JOIN public.points_log pl ON pl.member_id = m.id
GROUP BY m.id, m.x_username, m.points
HAVING m.points <> coalesce(sum(pl.points), 0)::integer;

-- Only server-defined actions should exist.
SELECT action, count(*) AS occurrences, sum(points) AS awarded
FROM public.points_log
WHERE action NOT IN (
  'signup',
  'daily_login',
  'invite_signup',
  'chain_signup_depth2',
  'chain_signup_depth3',
  'streak_bonus_7',
  'streak_bonus_30',
  'streak_bonus_100',
  -- Historical label emitted before milestone-specific labels were added.
  'streak_bonus',
  'codes_unlocked'
)
GROUP BY action;

-- Invite metadata must match its explicit lifecycle status. Legacy failed or
-- retired codes are preserved as disabled rather than deleted or reactivated.
SELECT id, code, owner_id, used_by, used_at, status
FROM public.invite_codes
WHERE (status = 'available' AND (is_used OR used_by IS NOT NULL OR used_at IS NOT NULL))
   OR (status = 'used' AND (NOT is_used OR used_by IS NULL OR used_at IS NULL))
   OR (status = 'disabled' AND (NOT is_used OR used_by IS NOT NULL))
   OR status NOT IN ('available', 'used', 'disabled');

-- Referral depths and stored network sizes should never be negative.
SELECT id, x_username, referral_chain_depth, network_size, points, login_streak
FROM public.members
WHERE referral_chain_depth < 0 OR network_size < 0 OR points < 0 OR login_streak < 0;

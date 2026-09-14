CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '')
  FROM generate_series(1, 8);
$$;

CREATE OR REPLACE FUNCTION public.issue_invite_codes(p_member_id bigint, p_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_issued integer := 0;
BEGIN
  IF p_count < 0 OR p_count > 100 THEN
    RAISE EXCEPTION 'invalid_invite_count';
  END IF;

  WHILE v_issued < p_count LOOP
    BEGIN
      INSERT INTO public.invite_codes (code, owner_id)
      VALUES (public.generate_invite_code(), p_member_id);
      v_issued := v_issued + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_member_points(
  p_member_id bigint,
  p_action text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(earned integer, new_total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base integer;
  v_old_points integer;
  v_new_points integer;
  v_network_size integer;
  v_multiplier numeric(3,1);
  v_earned integer;
BEGIN
  v_base := CASE p_action
    WHEN 'daily_login' THEN 10
    WHEN 'invite_signup' THEN 500
    WHEN 'chain_signup_depth2' THEN 250
    WHEN 'chain_signup_depth3' THEN 125
    WHEN 'streak_bonus_7' THEN 50
    WHEN 'streak_bonus_30' THEN 200
    WHEN 'streak_bonus_100' THEN 500
    ELSE NULL
  END;

  IF v_base IS NULL THEN RAISE EXCEPTION 'unsupported_points_action'; END IF;

  SELECT m.points, m.network_size
  INTO v_old_points, v_network_size
  FROM public.members m
  WHERE m.id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;

  v_multiplier := CASE
    WHEN v_network_size >= 200 THEN 3.0
    WHEN v_network_size >= 51 THEN 2.0
    WHEN v_network_size >= 11 THEN 1.5
    ELSE 1.0
  END;
  v_earned := round(v_base * v_multiplier);
  v_new_points := v_old_points + v_earned;

  UPDATE public.members
  SET points = v_new_points, multiplier = v_multiplier
  WHERE id = p_member_id;

  INSERT INTO public.points_log (member_id, action, points, meta)
  VALUES (p_member_id, p_action, v_earned, coalesce(p_meta, '{}'::jsonb));

  IF v_old_points < 1000 AND v_new_points >= 1000 THEN
    PERFORM public.issue_invite_codes(p_member_id, 3);
  END IF;
  IF v_old_points < 5000 AND v_new_points >= 5000 THEN
    PERFORM public.issue_invite_codes(p_member_id, 10);
  END IF;
  IF v_old_points < 20000 AND v_new_points >= 20000 THEN
    PERFORM public.issue_invite_codes(p_member_id, 50);
  END IF;

  RETURN QUERY SELECT v_earned, v_new_points;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_x_member(
  p_x_id text,
  p_x_username text,
  p_x_display_name text,
  p_x_avatar_url text,
  p_x_follower_count integer,
  p_invite_code text
)
RETURNS TABLE(member_id bigint, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id bigint;
  v_invite_id bigint;
  v_owner_id bigint;
  v_inviter_depth integer;
  v_ancestor bigint;
  v_next_ancestor bigint;
  v_depth integer;
  v_action text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_x_id, 0));

  SELECT id INTO v_member_id
  FROM public.members
  WHERE x_id = p_x_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.members
    SET x_username = p_x_username,
        x_display_name = p_x_display_name,
        x_avatar_url = p_x_avatar_url,
        x_follower_count = greatest(coalesce(p_x_follower_count, 0), 0),
        last_login = now()
    WHERE id = v_member_id;
    RETURN QUERY SELECT v_member_id, false;
    RETURN;
  END IF;

  IF nullif(trim(p_invite_code), '') IS NULL THEN RAISE EXCEPTION 'invalid_invite'; END IF;

  SELECT ic.id, ic.owner_id
  INTO v_invite_id, v_owner_id
  FROM public.invite_codes ic
  WHERE upper(ic.code) = upper(trim(p_invite_code)) AND ic.is_used = false
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_invite'; END IF;

  SELECT referral_chain_depth INTO v_inviter_depth
  FROM public.members
  WHERE id = v_owner_id;

  INSERT INTO public.members (
    x_id, x_username, x_display_name, x_avatar_url, x_follower_count,
    invited_by, referral_chain_depth, points, is_og, last_login
  ) VALUES (
    p_x_id, p_x_username, p_x_display_name, p_x_avatar_url,
    greatest(coalesce(p_x_follower_count, 0), 0), v_owner_id,
    coalesce(v_inviter_depth, 0) + 1, 300, false, now()
  ) RETURNING id INTO v_member_id;

  INSERT INTO public.points_log (member_id, action, points, meta)
  VALUES (v_member_id, 'signup', 300, jsonb_build_object('x_username', p_x_username));

  UPDATE public.invite_codes
  SET is_used = true, used_by = v_member_id, used_at = now()
  WHERE id = v_invite_id;

  PERFORM public.issue_invite_codes(v_member_id, 3);

  v_ancestor := v_owner_id;
  FOR v_depth IN 1..3 LOOP
    EXIT WHEN v_ancestor IS NULL;
    UPDATE public.members
    SET network_size = network_size + 1
    WHERE id = v_ancestor
    RETURNING invited_by INTO v_next_ancestor;

    v_action := CASE v_depth
      WHEN 1 THEN 'invite_signup'
      WHEN 2 THEN 'chain_signup_depth2'
      ELSE 'chain_signup_depth3'
    END;
    PERFORM public.award_member_points(
      v_ancestor,
      v_action,
      jsonb_build_object('invited_x_username', p_x_username)
    );
    v_ancestor := v_next_ancestor;
  END LOOP;

  RETURN QUERY SELECT v_member_id, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_rank(p_member_id bigint)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ranked.rank::integer
  FROM (
    SELECT id, row_number() OVER (ORDER BY points DESC, created_at ASC, id ASC) AS rank
    FROM public.members
  ) ranked
  WHERE ranked.id = p_member_id;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_points(p_member_id bigint)
RETURNS TABLE(
  success boolean,
  reason text,
  next_claim_at timestamptz,
  points_earned integer,
  new_total integer,
  login_streak integer,
  streak_bonus integer,
  streak_bonus_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_last_claim timestamptz;
  v_streak integer;
  v_daily_earned integer;
  v_total integer;
  v_bonus integer := 0;
  v_bonus_label text := NULL;
  v_bonus_action text := NULL;
BEGIN
  SELECT m.last_daily_claim, m.login_streak
  INTO v_last_claim, v_streak
  FROM public.members m
  WHERE m.id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;

  IF v_last_claim IS NOT NULL AND v_last_claim + interval '20 hours' > now() THEN
    RETURN QUERY SELECT false, 'already_claimed', v_last_claim + interval '20 hours', 0,
      (SELECT points FROM public.members WHERE id = p_member_id), v_streak, 0, NULL::text;
    RETURN;
  END IF;

  v_streak := CASE
    WHEN v_last_claim IS NOT NULL AND v_last_claim + interval '48 hours' >= now()
      THEN coalesce(v_streak, 0) + 1
    ELSE 1
  END;

  UPDATE public.members
  SET last_daily_claim = now(), login_streak = v_streak
  WHERE id = p_member_id;

  SELECT a.earned, a.new_total INTO v_daily_earned, v_total
  FROM public.award_member_points(p_member_id, 'daily_login', '{}'::jsonb) a;

  IF v_streak = 7 THEN v_bonus_action := 'streak_bonus_7'; v_bonus_label := '7-day streak'; END IF;
  IF v_streak = 30 THEN v_bonus_action := 'streak_bonus_30'; v_bonus_label := '30-day streak'; END IF;
  IF v_streak = 100 THEN v_bonus_action := 'streak_bonus_100'; v_bonus_label := '100-day streak'; END IF;

  IF v_bonus_action IS NOT NULL THEN
    SELECT a.earned, a.new_total INTO v_bonus, v_total
    FROM public.award_member_points(p_member_id, v_bonus_action, jsonb_build_object('streak', v_streak)) a;
  END IF;

  RETURN QUERY SELECT true, NULL::text, now() + interval '20 hours', v_daily_earned,
    v_total, v_streak, v_bonus, v_bonus_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_member_account(p_member_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent bigint;
  v_ancestor bigint;
  v_next_ancestor bigint;
  v_depth integer;
  v_network_size integer;
BEGIN
  SELECT invited_by INTO v_parent
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;

  -- Keep the referral graph connected while removing the member's personal
  -- record. Direct children inherit the deleted member's parent and every
  -- descendant moves one level closer to the root.
  WITH RECURSIVE descendants AS (
    SELECT id FROM public.members WHERE invited_by = p_member_id
    UNION ALL
    SELECT m.id
    FROM public.members m
    JOIN descendants d ON m.invited_by = d.id
  )
  UPDATE public.members
  SET referral_chain_depth = greatest(referral_chain_depth - 1, 0)
  WHERE id IN (SELECT id FROM descendants);

  UPDATE public.members
  SET invited_by = v_parent
  WHERE invited_by = p_member_id;

  v_ancestor := v_parent;
  FOR v_depth IN 1..3 LOOP
    EXIT WHEN v_ancestor IS NULL;
    SELECT invited_by INTO v_next_ancestor
    FROM public.members
    WHERE id = v_ancestor;

    WITH RECURSIVE network AS (
      SELECT id, 1 AS depth
      FROM public.members
      WHERE invited_by = v_ancestor
      UNION ALL
      SELECT m.id, n.depth + 1
      FROM public.members m
      JOIN network n ON m.invited_by = n.id
      WHERE n.depth < 3
    )
    SELECT count(*)::integer INTO v_network_size FROM network;

    UPDATE public.members
    SET network_size = v_network_size,
        multiplier = CASE
          WHEN v_network_size >= 200 THEN 3.0
          WHEN v_network_size >= 51 THEN 2.0
          WHEN v_network_size >= 11 THEN 1.5
          ELSE 1.0
        END
    WHERE id = v_ancestor;
    v_ancestor := v_next_ancestor;
  END LOOP;

  DELETE FROM public.members WHERE id = p_member_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_invite_codes(bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_member_points(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_x_member(text, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_member_rank(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_daily_points(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_member_account(bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_invite_codes(bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_member_points(bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_x_member(text, text, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_member_rank(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_points(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_member_account(bigint) TO service_role;

-- Canonical social identity fields support X and LinkedIn without conflating
-- provider identifiers. Existing X accounts and signed v1 sessions remain valid.

alter table public.members add column if not exists auth_provider text;
alter table public.members add column if not exists auth_subject text;
alter table public.members add column if not exists profile_handle text;
alter table public.members add column if not exists profile_url text;
alter table public.members add column if not exists profile_display_name text;
alter table public.members add column if not exists profile_avatar_url text;

update public.members set
  auth_provider = coalesce(auth_provider, 'x'),
  auth_subject = coalesce(auth_subject, x_id),
  profile_handle = coalesce(profile_handle, x_username),
  profile_url = coalesce(profile_url, case when x_username is not null then 'https://x.com/' || x_username else null end),
  profile_display_name = coalesce(profile_display_name, x_display_name),
  profile_avatar_url = coalesce(profile_avatar_url, x_avatar_url)
where auth_provider is null or auth_subject is null or profile_display_name is null;

alter table public.members alter column auth_provider set not null;
alter table public.members alter column auth_subject set not null;
alter table public.members alter column profile_display_name set not null;
alter table public.members alter column x_id drop not null;
alter table public.members alter column x_username drop not null;
alter table public.members alter column x_display_name drop not null;

alter table public.members drop constraint if exists members_auth_provider_check;
alter table public.members add constraint members_auth_provider_check check (auth_provider in ('x', 'linkedin'));
create unique index if not exists members_provider_subject_key on public.members (auth_provider, auth_subject);

create or replace function public.register_social_member(
  p_provider text,
  p_subject text,
  p_display_name text,
  p_avatar_url text,
  p_profile_handle text,
  p_profile_url text,
  p_follower_count integer,
  p_invite_code text
)
returns table(member_id bigint, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id bigint;
  v_invite_id bigint;
  v_owner_id bigint;
  v_inviter_depth integer;
  v_ancestor bigint;
  v_next_ancestor bigint;
  v_depth integer;
  v_action text;
begin
  if p_provider not in ('x', 'linkedin') or nullif(trim(p_subject), '') is null
    or nullif(trim(p_display_name), '') is null then
    raise exception 'invalid_identity';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_provider || ':' || p_subject, 0));

  select id into v_member_id from public.members
  where auth_provider = p_provider and auth_subject = p_subject
  for update;

  if found then
    update public.members set
      profile_handle = nullif(trim(p_profile_handle), ''),
      profile_url = nullif(trim(p_profile_url), ''),
      profile_display_name = trim(p_display_name),
      profile_avatar_url = nullif(trim(p_avatar_url), ''),
      x_username = case when p_provider = 'x' then nullif(trim(p_profile_handle), '') else x_username end,
      x_display_name = case when p_provider = 'x' then trim(p_display_name) else x_display_name end,
      x_avatar_url = case when p_provider = 'x' then nullif(trim(p_avatar_url), '') else x_avatar_url end,
      x_follower_count = case when p_provider = 'x' then greatest(coalesce(p_follower_count, 0), 0) else x_follower_count end,
      last_login = now()
    where id = v_member_id;
    return query select v_member_id, false;
    return;
  end if;

  if nullif(trim(p_invite_code), '') is null then raise exception 'invalid_invite'; end if;
  select ic.id, ic.owner_id into v_invite_id, v_owner_id
  from public.invite_codes ic
  where upper(ic.code) = upper(trim(p_invite_code)) and ic.is_used = false
  for update;
  if not found then raise exception 'invalid_invite'; end if;

  select referral_chain_depth into v_inviter_depth from public.members where id = v_owner_id;

  insert into public.members (
    auth_provider, auth_subject, profile_handle, profile_url, profile_display_name, profile_avatar_url,
    x_id, x_username, x_display_name, x_avatar_url, x_follower_count,
    invited_by, referral_chain_depth, points, is_og, last_login
  ) values (
    p_provider, trim(p_subject), nullif(trim(p_profile_handle), ''), nullif(trim(p_profile_url), ''), trim(p_display_name), nullif(trim(p_avatar_url), ''),
    case when p_provider = 'x' then trim(p_subject) else null end,
    case when p_provider = 'x' then nullif(trim(p_profile_handle), '') else null end,
    case when p_provider = 'x' then trim(p_display_name) else null end,
    case when p_provider = 'x' then nullif(trim(p_avatar_url), '') else null end,
    case when p_provider = 'x' then greatest(coalesce(p_follower_count, 0), 0) else 0 end,
    v_owner_id, coalesce(v_inviter_depth, 0) + 1, 300, false, now()
  ) returning id into v_member_id;

  -- No access token, email, or LinkedIn connection data is retained.
  insert into public.points_log (member_id, action, points, meta)
  values (v_member_id, 'signup', 300, jsonb_build_object('provider', p_provider, 'display_name', p_display_name));

  update public.invite_codes set is_used = true, used_by = v_member_id, used_at = now() where id = v_invite_id;
  perform public.issue_invite_codes(v_member_id, 3);

  v_ancestor := v_owner_id;
  for v_depth in 1..3 loop
    exit when v_ancestor is null;
    update public.members set network_size = network_size + 1
    where id = v_ancestor returning invited_by into v_next_ancestor;
    v_action := case v_depth when 1 then 'invite_signup' when 2 then 'chain_signup_depth2' else 'chain_signup_depth3' end;
    perform public.award_member_points(v_ancestor, v_action,
      jsonb_build_object('invited_provider', p_provider, 'invited_display_name', p_display_name));
    v_ancestor := v_next_ancestor;
  end loop;

  return query select v_member_id, true;
end;
$$;

create or replace function public.register_x_member(
  p_x_id text,
  p_x_username text,
  p_x_display_name text,
  p_x_avatar_url text,
  p_x_follower_count integer,
  p_invite_code text
)
returns table(member_id bigint, is_new boolean)
language sql
security definer
set search_path = ''
as $$
  select * from public.register_social_member(
    'x', p_x_id, p_x_display_name, p_x_avatar_url, p_x_username,
    'https://x.com/' || p_x_username, p_x_follower_count, p_invite_code
  );
$$;

revoke all on function public.register_social_member(text, text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.register_social_member(text, text, text, text, text, text, integer, text) to service_role;
revoke all on function public.register_x_member(text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.register_x_member(text, text, text, text, integer, text) to service_role;

-- Make launch-day project entries immediately visible regardless of deploy time.
update public.project_news set published_at = case id
  when 'autonomous-intelligence-live' then '2026-09-14T01:00:00+02:00'::timestamptz
  when 'trial-radar-index-launch' then '2026-09-14T02:00:00+02:00'::timestamptz
  when 'integrity-regulatory-release' then '2026-09-14T04:00:00+02:00'::timestamptz
  else published_at
end,
updated_at = now()
where id in ('autonomous-intelligence-live', 'trial-radar-index-launch', 'integrity-regulatory-release');

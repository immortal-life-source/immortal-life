-- Live resources inherit health from their actual ingestion source. Directory-only
-- resources continue to use the independent availability monitor.
alter table public.global_resources
  add column if not exists content_source_id text references public.content_sources(id);

update public.global_resources set content_source_id = case id
  when 'europe-pmc' then 'europe-pmc'
  when 'crossref-retraction-watch' then 'crossref'
  when 'clinicaltrials-gov' then 'clinicaltrials-gov'
  when 'ema' then 'ema'
  when 'sukl' then 'sukl'
  else null end;

create or replace function public.refresh_global_resource_eligibility()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.global_resources gr
  set is_eligible = authority_tier <= 2
        and homepage_url ~ '^https://'
        and length(description) >= 80
        and length(limitations) >= 60
        and integration_status <> 'candidate'
        and coalesce((select cs.consecutive_failures from public.content_sources cs where cs.id = gr.content_source_id), gr.consecutive_failures) < 6,
      eligibility_reason = case
        when authority_tier > 2 then 'Excluded: source authority is below the public-atlas threshold.'
        when homepage_url !~ '^https://' then 'Excluded: no secure official homepage is configured.'
        when length(description) < 80 or length(limitations) < 60 then 'Excluded: provenance or limitations metadata is incomplete.'
        when integration_status = 'candidate' then 'Excluded: source is still undergoing automated qualification.'
        when coalesce((select cs.consecutive_failures from public.content_sources cs where cs.id = gr.content_source_id), gr.consecutive_failures) >= 6 then 'Temporarily excluded after six consecutive availability failures.'
        else 'Included automatically: authoritative source, complete provenance, jurisdiction label, and declared access conditions.'
      end,
      updated_at = now();
end;
$$;

select public.refresh_global_resource_eligibility();

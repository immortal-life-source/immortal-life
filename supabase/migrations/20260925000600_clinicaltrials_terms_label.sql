-- ClinicalTrials.gov supports machine-readable redistribution subject to NLM
-- terms. Keep the structured-metadata feed live without describing it as an
-- unrestricted open-licence source.

update public.content_sources
set rights_basis = 'Official machine-readable access under NLM terms; reuse is limited here to current structured registry metadata and excludes uploaded documents and other third-party assets.',
    attribution_text = 'Source: ClinicalTrials.gov, U.S. National Library of Medicine; no endorsement implied.',
    permitted_content_scope = 'Current structured trial registration metadata only; excludes uploaded documents, protocols, linked publications, participant-level data and third-party attachments.',
    rights_reviewed_at = current_date,
    updated_at = now()
where id = 'clinicaltrials-gov';

update public.global_resources
set reuse_status = 'terms-apply',
    rights_basis = 'Official machine-readable access under NLM terms; structured registry metadata only.',
    permitted_content_scope = 'Current structured trial registration metadata only; excludes uploaded documents, protocols, linked publications, participant-level data and third-party attachments.',
    rights_reviewed_at = current_date,
    updated_at = now()
where id = 'clinicaltrials-gov';

do $$
begin
  if not exists (
    select 1
    from public.global_resources
    where id = 'clinicaltrials-gov'
      and integration_status = 'live'
      and reuse_status = 'terms-apply'
      and paid_distribution_allowed
      and automated_ingestion_allowed
  ) then
    raise exception 'ClinicalTrials.gov must remain a terms-governed structured-metadata feed';
  end if;
end;
$$;

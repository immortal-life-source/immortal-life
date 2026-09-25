-- Source-use policy is enforced in data, ingestion, publication and distribution.
-- The public directory remains comprehensive, but only explicitly cleared sources
-- may create records or appear in commercial email products.

alter table public.content_sources
  add column if not exists rights_class text not null default 'link_only'
    check (rights_class in ('commercial', 'link_only', 'blocked')),
  add column if not exists automated_ingestion_allowed boolean not null default false,
  add column if not exists public_display_allowed boolean not null default false,
  add column if not exists paid_distribution_allowed boolean not null default false,
  add column if not exists permitted_content_scope text not null default 'Directory entry and outbound link only.',
  add column if not exists attribution_text text,
  add column if not exists rights_basis text,
  add column if not exists rights_reviewed_at date;

alter table public.content_sources
  drop constraint if exists content_sources_paid_rights_check;
alter table public.content_sources
  add constraint content_sources_paid_rights_check check (
    not paid_distribution_allowed
    or (rights_class = 'commercial' and automated_ingestion_allowed and public_display_allowed)
  );

alter table public.global_resources
  add column if not exists rights_class text not null default 'link_only'
    check (rights_class in ('commercial', 'link_only', 'blocked')),
  add column if not exists automated_ingestion_allowed boolean not null default false,
  add column if not exists paid_distribution_allowed boolean not null default false,
  add column if not exists permitted_content_scope text not null default 'Directory entry and outbound link only.',
  add column if not exists rights_basis text,
  add column if not exists rights_reviewed_at date;

-- Fail closed. These are the only current ingestion sources whose published terms
-- support the specific, narrow content scope stated here. Abstracts, full text,
-- uploaded protocols and third-party attachments are never included in this grant.
update public.content_sources set
  rights_class = 'commercial', automated_ingestion_allowed = true,
  public_display_allowed = true, paid_distribution_allowed = true,
  permitted_content_scope = 'Current structured trial registration metadata only; excludes uploaded documents, protocols, linked publications, participant-level data and third-party attachments.',
  attribution_text = 'Source: ClinicalTrials.gov, U.S. National Library of Medicine; no endorsement implied.',
  rights_basis = 'Official machine-readable access under NLM terms; reuse is limited here to current structured registry metadata and excludes uploaded documents and other third-party assets.',
  rights_reviewed_at = current_date, enabled = true
where id = 'clinicaltrials-gov';

update public.content_sources set
  rights_class = 'commercial', automated_ingestion_allowed = true,
  public_display_allowed = true, paid_distribution_allowed = true,
  permitted_content_scope = 'Bibliographic citation metadata and controlled indexing terms only; excludes abstracts and full text.',
  attribution_text = 'Source: PubMed, U.S. National Library of Medicine.',
  rights_basis = 'Official E-utilities/FTP metadata access; publisher-controlled abstracts and linked content are excluded.',
  rights_reviewed_at = current_date, enabled = true
where id = 'pubmed';

update public.content_sources set
  rights_class = 'commercial', automated_ingestion_allowed = true,
  public_display_allowed = true, paid_distribution_allowed = true,
  permitted_content_scope = 'Bibliographic metadata and controlled terms only; excludes abstracts, full text and publisher-supplied media.',
  attribution_text = 'Source: Europe PMC.',
  rights_basis = 'Developer interfaces permit metadata access; copyright remains with publishers, so protected text is excluded.',
  rights_reviewed_at = current_date, enabled = true
where id = 'europe-pmc';

update public.content_sources set
  rights_class = 'commercial', automated_ingestion_allowed = true,
  public_display_allowed = true, paid_distribution_allowed = true,
  permitted_content_scope = 'Open bibliographic, affiliation and relationship metadata only; excludes source full text.',
  attribution_text = case id when 'openalex' then 'Source: OpenAlex.' else 'Source: Crossref and Retraction Watch metadata.' end,
  rights_basis = case id
    when 'openalex' then 'OpenAlex data is published for reuse under CC0.'
    else 'Crossref metadata may be used for any purpose; publisher-controlled abstracts are excluded.'
  end,
  rights_reviewed_at = current_date, enabled = true
where id in ('openalex', 'crossref');

update public.content_sources set
  rights_class = 'commercial', automated_ingestion_allowed = true,
  public_display_allowed = true, paid_distribution_allowed = true,
  permitted_content_scope = 'Agency-authored public notice metadata and original immortal.life summaries; excludes third-party attachments and media.',
  attribution_text = case id
    when 'ema' then 'Source: European Medicines Agency.'
    when 'fda-medwatch' then 'Source: U.S. Food and Drug Administration.'
    when 'mhra' then 'Source: UK Medicines and Healthcare products Regulatory Agency under the Open Government Licence.'
    when 'health-canada-safety' then 'Source: Health Canada under the Open Government Licence – Canada.'
  end,
  rights_basis = case id
    when 'ema' then 'EMA public material permits commercial reproduction with attribution; third-party material is excluded.'
    when 'fda-medwatch' then 'U.S. federal agency-authored public information; third-party material is excluded.'
    when 'mhra' then 'Open Government Licence v3.0 permits commercial reuse with attribution.'
    when 'health-canada-safety' then 'Open Government Licence – Canada permits commercial reuse with attribution.'
  end,
  rights_reviewed_at = current_date, enabled = true
where id in ('ema', 'fda-medwatch', 'mhra', 'health-canada-safety');

-- Published terms have not yet established commercial automated redistribution for
-- these feeds. Keep their directory records, stop ingestion and suppress old items.
update public.content_sources set
  rights_class = 'link_only', automated_ingestion_allowed = false,
  public_display_allowed = false, paid_distribution_allowed = false,
  permitted_content_scope = 'Directory entry and outbound link only.',
  attribution_text = null,
  rights_basis = 'Commercial automated reuse is not clearly granted by published terms.',
  rights_reviewed_at = current_date, enabled = false
where id in ('sukl', 'tga-safety');

-- Any future source begins link-only until an explicit policy migration clears it.
update public.content_sources set enabled = false
where rights_class <> 'commercial' or not automated_ingestion_allowed;

-- Protected source text is not needed for matching or publication. Retain only the
-- reusable metadata fields and original summaries produced by immortal.life.
update public.research_items
set abstract_text = null,
    metadata = metadata - 'abstract' - 'full_text' - 'fullText'
where source_id in ('pubmed', 'europe-pmc', 'openalex');

-- Existing material from sources that fail the policy is withdrawn from every
-- public surface. The normal change triggers also remove its timeline events.
update public.research_items item
set publication_state = 'quarantined'
where publication_state = 'published'
  and not exists (select 1 from public.content_sources source where source.id = item.source_id and source.public_display_allowed);
update public.clinical_trials item
set publication_state = 'quarantined'
where publication_state = 'published'
  and not exists (select 1 from public.content_sources source where source.id = item.source_id and source.public_display_allowed);
update public.regulatory_events item
set publication_state = 'quarantined'
where publication_state = 'published'
  and not exists (select 1 from public.content_sources source where source.id = item.source_id and source.public_display_allowed);
update public.research_integrity_events item
set publication_state = 'quarantined'
where publication_state = 'published'
  and not exists (select 1 from public.content_sources source where source.id = item.source_id and source.public_display_allowed);

create or replace function public.enforce_record_source_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_policy public.content_sources%rowtype;
begin
  select * into source_policy from public.content_sources where id = new.source_id;
  if not found then raise exception 'Unknown content source: %', new.source_id; end if;
  if not source_policy.automated_ingestion_allowed then
    raise exception 'Automated ingestion is not permitted for source: %', new.source_id;
  end if;
  if new.publication_state = 'published' and not source_policy.public_display_allowed then
    new.publication_state := 'quarantined';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_research_source_rights on public.research_items;
create trigger enforce_research_source_rights before insert or update of source_id, publication_state on public.research_items
for each row execute function public.enforce_record_source_rights();
drop trigger if exists enforce_trial_source_rights on public.clinical_trials;
create trigger enforce_trial_source_rights before insert or update of source_id, publication_state on public.clinical_trials
for each row execute function public.enforce_record_source_rights();
drop trigger if exists enforce_regulatory_source_rights on public.regulatory_events;
create trigger enforce_regulatory_source_rights before insert or update of source_id, publication_state on public.regulatory_events
for each row execute function public.enforce_record_source_rights();
drop trigger if exists enforce_integrity_source_rights on public.research_integrity_events;
create trigger enforce_integrity_source_rights before insert or update of source_id, publication_state on public.research_integrity_events
for each row execute function public.enforce_record_source_rights();

-- Change events inherit source provenance and are never created for a source that
-- cannot appear publicly. Paid generators apply the stricter email permission.
alter table public.intelligence_change_events
  add column if not exists source_id text references public.content_sources(id);

update public.intelligence_change_events event set source_id = case event.record_type
  when 'research' then (select source_id from public.research_items where id = event.record_id)
  when 'trials' then (select source_id from public.clinical_trials where id = event.record_id)
  when 'regulatory' then (select source_id from public.regulatory_events where id = event.record_id)
  when 'integrity' then (select source_id from public.research_integrity_events where id = event.record_id)
end;

delete from public.intelligence_change_events event
where event.source_id is null
   or not exists (select 1 from public.content_sources source where source.id = event.source_id and source.public_display_allowed);

create or replace function public.guard_change_event_source_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_id is null then
    new.source_id := case new.record_type
      when 'research' then (select source_id from public.research_items where id = new.record_id)
      when 'trials' then (select source_id from public.clinical_trials where id = new.record_id)
      when 'regulatory' then (select source_id from public.regulatory_events where id = new.record_id)
      when 'integrity' then (select source_id from public.research_integrity_events where id = new.record_id)
    end;
  end if;
  if new.source_id is null or not exists (
    select 1 from public.content_sources source
    where source.id = new.source_id and source.public_display_allowed
  ) then return null; end if;
  return new;
end;
$$;

drop trigger if exists guard_change_event_source_rights on public.intelligence_change_events;
create trigger guard_change_event_source_rights before insert or update of source_id, record_type, record_id on public.intelligence_change_events
for each row execute function public.guard_change_event_source_rights();

create index if not exists content_sources_rights_idx
  on public.content_sources (automated_ingestion_allowed, public_display_allowed, paid_distribution_allowed);
create index if not exists intelligence_change_events_source_idx
  on public.intelligence_change_events (source_id, occurred_at desc);

-- Mirror the internal policy onto the public directory without exposing legal
-- implementation details in the visitor interface.
update public.global_resources resource set
  rights_class = source.rights_class,
  automated_ingestion_allowed = source.automated_ingestion_allowed,
  paid_distribution_allowed = source.paid_distribution_allowed,
  permitted_content_scope = source.permitted_content_scope,
  rights_basis = source.rights_basis,
  rights_reviewed_at = source.rights_reviewed_at,
  integration_status = case when source.automated_ingestion_allowed then 'live' else 'directory' end,
  reuse_status = case
    when source.id = 'clinicaltrials-gov' then 'terms-apply'
    when source.paid_distribution_allowed then 'open'
    else 'link-only'
  end,
  updated_at = now()
from public.content_sources source
where source.id = resource.content_source_id;

update public.global_resources set
  rights_class = 'blocked', automated_ingestion_allowed = false,
  paid_distribution_allowed = false,
  permitted_content_scope = 'Directory entry and outbound link only; ICTRP records are not ingested.',
  rights_basis = 'WHO ICTRP terms prohibit marketing, promotional and commercial use.',
  rights_reviewed_at = current_date,
  integration_status = 'directory', reuse_status = 'link-only', updated_at = now()
where id = 'who-ictrp';

update public.global_resources set
  rights_class = 'link_only', automated_ingestion_allowed = false,
  paid_distribution_allowed = false,
  permitted_content_scope = 'Directory entry and outbound link only pending a clear published commercial automation grant.',
  rights_basis = 'Commercial automated reuse has not been cleared from published terms.',
  rights_reviewed_at = current_date,
  integration_status = 'directory', reuse_status = 'link-only', updated_at = now()
where resource_type = 'trial_registry' and id <> 'clinicaltrials-gov';

-- Generated briefings are disposable outputs. Remove pre-policy payloads so no
-- legacy item can reach email; the next generator run recreates a compliant issue.
truncate table public.public_briefings cascade;
truncate table public.member_briefings;

revoke all on function public.enforce_record_source_rights(), public.guard_change_event_source_rights() from public, anon, authenticated;
grant execute on function public.enforce_record_source_rights(), public.guard_change_event_source_rights() to service_role;

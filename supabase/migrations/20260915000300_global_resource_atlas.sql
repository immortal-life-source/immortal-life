-- Global Resource Atlas: a source-first directory of authoritative longevity-relevant
-- evidence and regulatory infrastructure. The registry is maintained by automated
-- health checks; inclusion never implies endorsement or global regulatory applicability.

create table if not exists public.global_resources (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  resource_type text not null check (resource_type in ('international_organization', 'regulator', 'trial_registry', 'evidence_infrastructure')),
  geographic_scope text not null check (geographic_scope in ('global', 'regional', 'national')),
  jurisdiction_code text not null,
  jurisdiction_name text not null,
  region text not null check (region in ('Global', 'Europe', 'Americas', 'Asia-Pacific')),
  authority_tier smallint not null check (authority_tier between 1 and 3),
  description text not null,
  limitations text not null,
  homepage_url text not null check (homepage_url ~ '^https://'),
  data_url text check (data_url is null or data_url ~ '^https://'),
  terms_url text check (terms_url is null or terms_url ~ '^https://'),
  access_mode text not null check (access_mode in ('api', 'download', 'search', 'feed')),
  reuse_status text not null check (reuse_status in ('open', 'terms-apply', 'link-only')),
  integration_status text not null check (integration_status in ('live', 'directory', 'candidate')),
  update_cadence text not null,
  healthcheck_url text not null check (healthcheck_url ~ '^https://'),
  is_eligible boolean not null default false,
  eligibility_reason text not null default 'Awaiting automated eligibility evaluation.',
  last_checked_at timestamptz,
  last_healthy_at timestamptz,
  last_status_code integer,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists global_resources_public_idx
  on public.global_resources (is_eligible, region, resource_type, authority_tier, name);

insert into public.global_resources
  (id, name, resource_type, geographic_scope, jurisdiction_code, jurisdiction_name, region, authority_tier, description, limitations, homepage_url, data_url, terms_url, access_mode, reuse_status, integration_status, update_cadence, healthcheck_url)
values
  ('who-ictrp', 'WHO International Clinical Trials Registry Platform', 'international_organization', 'global', 'INT', 'International', 'Global', 1,
   'World Health Organization platform providing a single search point for trial-registration datasets supplied by qualifying registries worldwide.',
   'WHO ICTRP is an aggregation platform, not a trial registry. Coverage and update timing depend on its contributing registries.',
   'https://www.who.int/tools/clinical-trials-registry-platform', 'https://trialsearch.who.int/', 'https://www.who.int/about/policies/publishing-policies/copyright', 'search', 'terms-apply', 'directory', 'Source-defined', 'https://trialsearch.who.int/'),
  ('europe-pmc', 'Europe PMC', 'evidence_infrastructure', 'global', 'INT', 'International', 'Global', 1,
   'Open life-sciences literature infrastructure operated by EMBL-EBI and partners, with article metadata, citations, grants, preprints, and full text where available.',
   'Coverage and metadata completeness vary by publication and repository; indexing is not an assessment of scientific validity.',
   'https://europepmc.org/', 'https://www.ebi.ac.uk/europepmc/webservices/rest/', 'https://europepmc.org/Copyright', 'api', 'open', 'live', 'Every 6 hours', 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=aging&format=json&pageSize=1'),
  ('pubmed', 'PubMed', 'evidence_infrastructure', 'global', 'US', 'United States / international coverage', 'Global', 1,
   'Biomedical and life-sciences literature search service maintained by the U.S. National Library of Medicine.',
   'A PubMed citation does not establish study quality, clinical utility, safety, or regulatory approval; full text may be unavailable.',
   'https://pubmed.ncbi.nlm.nih.gov/', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/', 'https://www.ncbi.nlm.nih.gov/home/about/policies/', 'api', 'terms-apply', 'directory', 'Source-defined', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi?retmode=json'),
  ('crossref-retraction-watch', 'Crossref and Retraction Watch', 'evidence_infrastructure', 'global', 'INT', 'International', 'Global', 1,
   'Scholarly metadata and post-publication integrity signals used to connect indexed works with corrections, withdrawals, and retractions.',
   'Metadata can be delayed or incomplete and a relationship signal must be verified against the publisher or cited notice.',
   'https://www.crossref.org/', 'https://api.crossref.org/', 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-metadata-license-information/', 'api', 'open', 'live', 'Every 6 hours', 'https://api.crossref.org/works?rows=1'),
  ('clinicaltrials-gov', 'ClinicalTrials.gov', 'trial_registry', 'national', 'US', 'United States', 'Americas', 1,
   'Official U.S. clinical-study registry and results database operated by the National Library of Medicine, with substantial international study coverage.',
   'Registration is sponsor-submitted and does not establish study quality, completion, safety, effectiveness, or approval.',
   'https://clinicaltrials.gov/', 'https://clinicaltrials.gov/data-api/api', 'https://clinicaltrials.gov/about-site/terms-conditions', 'api', 'terms-apply', 'live', 'Every 6 hours; source updates on business days', 'https://clinicaltrials.gov/api/v2/studies?pageSize=1'),
  ('health-canada-dpd', 'Health Canada Drug Product Database', 'regulator', 'national', 'CA', 'Canada', 'Americas', 1,
   'Official database of drug products authorized for sale by Health Canada, including current status and product information.',
   'Canadian authorization applies in Canada only; database presence does not support use outside the authorized product and indication.',
   'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/drug-product-database.html', 'https://health-products.canada.ca/api/documentation/dpd-documentation-en.html', 'https://open.canada.ca/en/open-government-licence-canada', 'api', 'open', 'directory', 'Nightly at source', 'https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json'),
  ('ema', 'European Medicines Agency', 'regulator', 'regional', 'EU', 'European Union and EEA', 'Europe', 1,
   'Official EU medicines regulator source for medicine assessments, safety communications, authorisations, and regulatory notices.',
   'EU-level information must be read with the exact medicine, indication, procedure, date, and national implementation context.',
   'https://www.ema.europa.eu/', 'https://www.ema.europa.eu/en/news-events', 'https://www.ema.europa.eu/en/about-us/legal-notice', 'feed', 'terms-apply', 'live', 'Every 6 hours', 'https://www.ema.europa.eu/en/news.xml'),
  ('eu-ctis', 'EU Clinical Trials Information System', 'trial_registry', 'regional', 'EU', 'European Union and EEA', 'Europe', 1,
   'Official EU/EEA public system for clinical-trial information under Regulation (EU) No 536/2014.',
   'CTIS primarily covers trials under the current EU framework; older directive-era records may remain in the EU Clinical Trials Register.',
   'https://euclinicaltrials.eu/', 'https://euclinicaltrials.eu/search-for-clinical-trials/', 'https://euclinicaltrials.eu/about-this-website/', 'search', 'link-only', 'directory', 'Source-defined', 'https://euclinicaltrials.eu/search-for-clinical-trials/'),
  ('fda-openfda', 'U.S. Food and Drug Administration / openFDA', 'regulator', 'national', 'US', 'United States', 'Americas', 1,
   'Official FDA drug approval and regulatory datasets exposed through machine-readable openFDA interfaces.',
   'FDA status applies to the United States and to the exact product and indication; openFDA explicitly must not be used for medical-care decisions.',
   'https://www.fda.gov/', 'https://open.fda.gov/apis/drug/drugsfda/', 'https://open.fda.gov/terms/', 'api', 'open', 'directory', 'Weekdays at source', 'https://api.fda.gov/drug/drugsfda.json?limit=1'),
  ('mhra', 'Medicines and Healthcare products Regulatory Agency', 'regulator', 'national', 'GB', 'United Kingdom', 'Europe', 1,
   'Official UK regulator source for medicine and device safety updates, alerts, authorisations, and guidance.',
   'MHRA notices apply within the United Kingdom and must be interpreted for the named product, population, indication, and publication date.',
   'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency', 'https://www.gov.uk/drug-safety-update', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', 'feed', 'open', 'directory', 'Source-defined', 'https://www.gov.uk/drug-safety-update.atom'),
  ('sukl', 'State Institute for Drug Control (SÚKL)', 'regulator', 'national', 'CZ', 'Czech Republic', 'Europe', 1,
   'Official Czech medicines authority source for regulatory notices, medicine information, safety communications, and national requirements.',
   'SÚKL information applies in the Czech Republic. Czech-language source material and the exact product record control over automated summaries.',
   'https://sukl.gov.cz/', 'https://sukl.gov.cz/feed/', 'https://sukl.gov.cz/en/legal-notice/', 'feed', 'terms-apply', 'live', 'Every 6 hours', 'https://sukl.gov.cz/feed/'),
  ('swissmedic', 'Swissmedic', 'regulator', 'national', 'CH', 'Switzerland', 'Europe', 1,
   'Official Swiss authority for therapeutic products, including human-medicine authorisations and safety information.',
   'Swiss authorisation applies in Switzerland and does not establish authorization in the EU, United Kingdom, United States, or elsewhere.',
   'https://www.swissmedic.ch/', 'https://www.swissmedic.ch/swissmedic/en/home/humanarzneimittel/authorisations.html', 'https://www.swissmedic.ch/swissmedic/en/home/legal/legal-information.html', 'search', 'link-only', 'directory', 'Source-defined', 'https://www.swissmedic.ch/swissmedic/en/home.html'),
  ('tga-artg', 'Therapeutic Goods Administration / ARTG', 'regulator', 'national', 'AU', 'Australia', 'Asia-Pacific', 1,
   'Official Australian regulator and public register of therapeutic goods that may be lawfully supplied in Australia.',
   'Australian status applies only in Australia; some listed medicines have not undergone full pre-market efficacy assessment.',
   'https://www.tga.gov.au/', 'https://www.tga.gov.au/products/regulations-all-products/about-australian-register-therapeutic-goods-artg', 'https://www.tga.gov.au/copyright', 'search', 'terms-apply', 'directory', 'Source-defined', 'https://www.tga.gov.au/'),
  ('pmda', 'Pharmaceuticals and Medical Devices Agency', 'regulator', 'national', 'JP', 'Japan', 'Asia-Pacific', 1,
   'Official Japanese agency source for product reviews, safety information, approvals, and regulatory documents.',
   'English coverage is selective and Japanese source records may be controlling; approval status applies in Japan only.',
   'https://www.pmda.go.jp/english/', 'https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0001.html', 'https://www.pmda.go.jp/english/other/0003.html', 'download', 'terms-apply', 'directory', 'Source-defined', 'https://www.pmda.go.jp/english/review-services/0001.html'),
  ('isrctn', 'ISRCTN Registry', 'trial_registry', 'national', 'GB', 'United Kingdom / international coverage', 'Europe', 2,
   'WHO-recognized primary clinical-trial registry accepting studies from all countries and fields of health research.',
   'Registry information is supplied by study teams; registration does not establish quality, safety, completion, effectiveness, or approval.',
   'https://www.isrctn.com/', 'https://www.isrctn.com/search', 'https://www.isrctn.com/page/terms', 'search', 'terms-apply', 'directory', 'Source-defined', 'https://www.isrctn.com/'),
  ('anzctr', 'Australian New Zealand Clinical Trials Registry', 'trial_registry', 'regional', 'AU-NZ', 'Australia and New Zealand / international coverage', 'Asia-Pacific', 2,
   'WHO-recognized primary registry for clinical trials, operated by an Australian academic institution with Australian Government support.',
   'Registry data are submitted by study registrants and do not establish scientific quality, safety, effectiveness, or regulatory approval.',
   'https://www.anzctr.org.au/', 'https://www.anzctr.org.au/TrialSearch.aspx', 'https://www.anzctr.org.au/Support/Terms.aspx', 'search', 'terms-apply', 'directory', 'Source-defined', 'https://www.anzctr.org.au/'),
  ('jrct', 'Japan Registry of Clinical Trials', 'trial_registry', 'national', 'JP', 'Japan', 'Asia-Pacific', 1,
   'Official Japanese public registry for clinical research and clinical trials.',
   'English-language metadata and availability vary; registry presence does not establish study quality, safety, effectiveness, or approval.',
   'https://jrct.niph.go.jp/en-latest-detail/jRCTs', 'https://jrct.niph.go.jp/en-latest-detail/jRCTs', 'https://jrct.niph.go.jp/terms', 'search', 'link-only', 'directory', 'Source-defined', 'https://jrct.niph.go.jp/en-latest-detail/jRCTs')
on conflict (id) do update set
  name = excluded.name,
  resource_type = excluded.resource_type,
  geographic_scope = excluded.geographic_scope,
  jurisdiction_code = excluded.jurisdiction_code,
  jurisdiction_name = excluded.jurisdiction_name,
  region = excluded.region,
  authority_tier = excluded.authority_tier,
  description = excluded.description,
  limitations = excluded.limitations,
  homepage_url = excluded.homepage_url,
  data_url = excluded.data_url,
  terms_url = excluded.terms_url,
  access_mode = excluded.access_mode,
  reuse_status = excluded.reuse_status,
  integration_status = excluded.integration_status,
  update_cadence = excluded.update_cadence,
  healthcheck_url = excluded.healthcheck_url,
  updated_at = now();

create or replace function public.refresh_global_resource_eligibility()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.global_resources
  set is_eligible = authority_tier <= 2
        and homepage_url ~ '^https://'
        and length(description) >= 80
        and length(limitations) >= 60
        and integration_status <> 'candidate'
        and consecutive_failures < 6,
      eligibility_reason = case
        when authority_tier > 2 then 'Excluded: source authority is below the public-atlas threshold.'
        when homepage_url !~ '^https://' then 'Excluded: no secure official homepage is configured.'
        when length(description) < 80 or length(limitations) < 60 then 'Excluded: provenance or limitations metadata is incomplete.'
        when integration_status = 'candidate' then 'Excluded: source is still undergoing automated qualification.'
        when consecutive_failures >= 6 then 'Temporarily excluded after six consecutive availability failures.'
        else 'Included automatically: authoritative source, complete provenance, jurisdiction label, and declared access conditions.'
      end,
      updated_at = now();
end;
$$;

select public.refresh_global_resource_eligibility();

-- Remove thin programmatic entity pages. Topics remain first-class dossiers;
-- journals need three records, sponsors two, and source entities one linked record.
create or replace function public.refresh_intelligence_entities()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.intelligence_entities where kind <> 'topic';

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'topic', t.slug, t.name, t.description,
    (select count(*) from public.research_item_topics rit join public.research_items ri on ri.id = rit.research_item_id where rit.topic_slug = t.slug and rit.is_published and ri.publication_state = 'published')
    + (select count(*) from public.clinical_trial_topics ctt join public.clinical_trials ct on ct.id = ctt.clinical_trial_id where ctt.topic_slug = t.slug and ctt.is_published and ct.publication_state = 'published'),
    greatest(t.updated_at, now()), jsonb_build_object('eligibility', 'first-class-topic')
  from public.intelligence_topics t where t.enabled
  on conflict (kind, slug) do update set name = excluded.name, description = excluded.description, record_count = excluded.record_count, last_seen_at = excluded.last_seen_at, metadata = excluded.metadata, updated_at = now();

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'journal', public.entity_slug(journal) || '-' || substr(md5(lower(journal)), 1, 8), journal,
    'Automatically generated journal entity from published source metadata.', count(*)::integer, max(last_seen_at), jsonb_build_object('minimum_records', 3)
  from public.research_items where publication_state = 'published' and nullif(journal, '') is not null and public.entity_slug(journal) <> ''
  group by journal having count(*) >= 3;

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'sponsor', public.entity_slug(sponsor) || '-' || substr(md5(lower(sponsor)), 1, 8), sponsor,
    'Automatically generated trial-sponsor entity from registry metadata.', count(*)::integer, max(last_seen_at), jsonb_build_object('minimum_records', 2)
  from public.clinical_trials where publication_state = 'published' and nullif(sponsor, '') is not null and public.entity_slug(sponsor) <> ''
  group by sponsor having count(*) >= 2;

  insert into public.intelligence_entities (kind, slug, name, description, record_count, last_seen_at, metadata)
  select 'source', public.entity_slug(cs.id), cs.name, 'Named upstream source monitored automatically by immortal.life.', counts.record_count, cs.last_success_at,
    jsonb_build_object('homepage_url', cs.homepage_url, 'health_failures', cs.consecutive_failures, 'minimum_records', 1)
  from public.content_sources cs
  cross join lateral (
    select ((select count(*) from public.research_items where source_id = cs.id and publication_state = 'published')
      + (select count(*) from public.clinical_trials where source_id = cs.id and publication_state = 'published')
      + (select count(*) from public.regulatory_events where source_id = cs.id and publication_state = 'published')
      + (select count(*) from public.research_integrity_events where source_id = cs.id and publication_state = 'published'))::integer record_count
  ) counts
  where cs.enabled and counts.record_count >= 1;
end;
$$;

select public.refresh_intelligence_entities();

alter table public.global_resources enable row level security;
revoke all on table public.global_resources from public, anon, authenticated;
grant all on table public.global_resources to service_role;
revoke all on function public.refresh_global_resource_eligibility(), public.refresh_intelligence_entities() from public, anon, authenticated;
grant execute on function public.refresh_global_resource_eligibility(), public.refresh_intelligence_entities() to service_role;

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'immortal-life-resource-health' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-resource-health',
    '17 */6 * * *',
    $job$
      select net.http_post(
        url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/check-resource-health',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
        ),
        body := '{"trigger":"schedule"}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
end
$schedule$;

select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/check-resource-health',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"migration"}'::jsonb,
  timeout_milliseconds := 150000
);

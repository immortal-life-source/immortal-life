-- Expand the autonomous evidence pipeline with one additional biomedical
-- literature index and four official national medicine-safety feeds.

insert into public.content_sources
  (id, name, kind, homepage_url, api_url, terms_url, update_cadence)
values
  ('pubmed', 'PubMed', 'literature',
   'https://pubmed.ncbi.nlm.nih.gov/',
   'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
   'https://www.ncbi.nlm.nih.gov/home/about/policies/',
   'Every 6 hours'),
  ('fda-medwatch', 'U.S. FDA MedWatch', 'regulatory',
   'https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program',
   'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml',
   'https://www.fda.gov/about-fda/about-website/website-policies',
   'Every 6 hours'),
  ('mhra', 'UK MHRA Drug Safety Update', 'regulatory',
   'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency',
   'https://www.gov.uk/drug-safety-update.atom',
   'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
   'Every 6 hours'),
  ('health-canada-safety', 'Health Canada safety alerts and recalls', 'regulatory',
   'https://recalls-rappels.canada.ca/en',
   'https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls',
   'https://www.canada.ca/en/transparency/terms.html',
   'Every 6 hours'),
  ('tga-safety', 'Australian TGA safety alerts', 'regulatory',
   'https://www.tga.gov.au/safety',
   'https://www.tga.gov.au/feeds/alert/safety-alerts.xml',
   'https://www.tga.gov.au/copyright',
   'Every 6 hours')
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  homepage_url = excluded.homepage_url,
  api_url = excluded.api_url,
  terms_url = excluded.terms_url,
  update_cadence = excluded.update_cadence,
  enabled = true,
  updated_at = now();

update public.global_resources
set integration_status = 'live',
    content_source_id = 'pubmed',
    update_cadence = 'Every 6 hours',
    limitations = 'A PubMed citation does not establish study quality, clinical utility, safety, or regulatory approval. Abstracts may be protected by publisher copyright; source terms and the linked PubMed record control.',
    healthcheck_url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi?db=pubmed&retmode=json',
    updated_at = now()
where id = 'pubmed';

update public.global_resources
set integration_status = 'live',
    content_source_id = 'mhra',
    data_url = 'https://www.gov.uk/drug-safety-update.atom',
    update_cadence = 'Every 6 hours',
    healthcheck_url = 'https://www.gov.uk/drug-safety-update.atom',
    updated_at = now()
where id = 'mhra';

insert into public.global_resources
  (id, name, resource_type, geographic_scope, jurisdiction_code, jurisdiction_name,
   region, authority_tier, description, limitations, homepage_url, data_url,
   terms_url, access_mode, reuse_status, integration_status, content_source_id,
   update_cadence, healthcheck_url)
values
  ('fda-medwatch', 'U.S. FDA MedWatch safety alerts', 'regulator', 'national', 'US', 'United States',
   'Americas', 1,
   'Official U.S. Food and Drug Administration feed for clinically important medical-product safety alerts and timely medicine and device safety information.',
   'FDA notices apply in the United States and to the named product, indication, population, and date. An alert is not evidence that other products or uses share the same risk.',
   'https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program',
   'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml',
   'https://www.fda.gov/about-fda/about-website/website-policies',
   'feed', 'terms-apply', 'live', 'fda-medwatch', 'Every 6 hours',
   'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml'),
  ('health-canada-safety', 'Health Canada safety alerts and recalls', 'regulator', 'national', 'CA', 'Canada',
   'Americas', 1,
   'Official Government of Canada feed for health-product recalls, advisories, and safety alerts covering medicines, biologics, natural health products, and medical devices.',
   'Canadian notices apply in Canada and to the named product, lot, population, and date. Users must follow the linked official notice for scope and current instructions.',
   'https://recalls-rappels.canada.ca/en',
   'https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls',
   'https://www.canada.ca/en/transparency/terms.html',
   'feed', 'terms-apply', 'live', 'health-canada-safety', 'Every 6 hours',
   'https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls'),
  ('tga-safety', 'Australian TGA safety alerts', 'regulator', 'national', 'AU', 'Australia',
   'Asia-Pacific', 1,
   'Official Australian Therapeutic Goods Administration feed for safety alerts about medicines, medical devices, biologicals, and other therapeutic goods.',
   'Australian notices apply in Australia and to the exact product and circumstances stated. Registration or an alert does not imply the same legal status in another jurisdiction.',
   'https://www.tga.gov.au/safety',
   'https://www.tga.gov.au/feeds/alert/safety-alerts.xml',
   'https://www.tga.gov.au/copyright',
   'feed', 'terms-apply', 'live', 'tga-safety', 'Every 6 hours',
   'https://www.tga.gov.au/feeds/alert/safety-alerts.xml')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  limitations = excluded.limitations,
  homepage_url = excluded.homepage_url,
  data_url = excluded.data_url,
  terms_url = excluded.terms_url,
  access_mode = excluded.access_mode,
  reuse_status = excluded.reuse_status,
  integration_status = excluded.integration_status,
  content_source_id = excluded.content_source_id,
  update_cadence = excluded.update_cadence,
  healthcheck_url = excluded.healthcheck_url,
  updated_at = now();

select public.refresh_global_resource_eligibility();
select public.refresh_intelligence_entities();

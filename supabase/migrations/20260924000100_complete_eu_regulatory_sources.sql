-- Complete EU medicines-authority coverage.
-- The roster follows the EMA list of national competent authorities for human
-- medicines. These are directory sources with automated availability checks;
-- they are not presented as live ingestion feeds unless separately linked to a
-- supported content_source (for example EMA and Czech SÚKL).

with eu_authorities(id, name, jurisdiction_code, jurisdiction_name, homepage_url, data_url) as (
  values
    ('basg-at', 'Federal Office for Safety in Health Care (BASG)', 'AT', 'Austria', 'https://www.basg.gv.at/', 'https://aspregister.basg.gv.at/aspregister/'),
    ('famhp-be', 'Federal Agency for Medicines and Health Products (FAMHP)', 'BE', 'Belgium', 'https://www.famhp.be/en', 'https://banquededonneesmedicaments.fagg-afmps.be/'),
    ('bda-bg', 'Bulgarian Drug Agency', 'BG', 'Bulgaria', 'https://www.bda.bg/', 'https://www.bda.bg/'),
    ('halmed-hr', 'Agency for Medicinal Products and Medical Devices of Croatia (HALMED)', 'HR', 'Croatia', 'https://www.halmed.hr/en/', 'https://www.halmed.hr/en/Lijekovi/Baza-lijekova/'),
    ('phs-cy', 'Ministry of Health Pharmaceutical Services', 'CY', 'Cyprus', 'https://www.moh.gov.cy/phs', 'https://www.moh.gov.cy/phs'),
    ('sukl', 'State Institute for Drug Control (SÚKL)', 'CZ', 'Czechia', 'https://sukl.gov.cz/', 'https://prehledy.sukl.cz/prehled_leciv.html'),
    ('dkma-dk', 'Danish Medicines Agency', 'DK', 'Denmark', 'https://laegemiddelstyrelsen.dk/en/', 'https://produktresume.dk/AppBuilder/search'),
    ('ravimiamet-ee', 'State Agency of Medicines', 'EE', 'Estonia', 'https://www.ravimiamet.ee/en', 'https://www.ravimiregister.ee/en/default.aspx'),
    ('fimea-fi', 'Finnish Medicines Agency (Fimea)', 'FI', 'Finland', 'https://fimea.fi/en/frontpage', 'https://fimea.fi/en/databases_and_registeries'),
    ('ansm-fr', 'National Agency for the Safety of Medicines and Health Products (ANSM)', 'FR', 'France', 'https://ansm.sante.fr/', 'https://base-donnees-publique.medicaments.gouv.fr/'),
    ('bfarm', 'Federal Institute for Drugs and Medical Devices (BfArM)', 'DE', 'Germany', 'https://www.bfarm.de/', 'https://www.pharmnet.bund.de/'),
    ('pei-de', 'Paul Ehrlich Institute', 'DE', 'Germany', 'https://www.pei.de/EN/home/home-node.html', 'https://www.pei.de/EN/medicinal-products/medicinal-products-node.html'),
    ('eof-gr', 'National Organization for Medicines (EOF)', 'GR', 'Greece', 'https://www.eof.gr/', 'https://www.eof.gr/'),
    ('nngyk-hu', 'National Centre for Public Health and Pharmacy', 'HU', 'Hungary', 'https://www.nnk.gov.hu/', 'https://ogyei.gov.hu/drug_database/'),
    ('hpra-ie', 'Health Products Regulatory Authority (HPRA)', 'IE', 'Ireland', 'https://www.hpra.ie/', 'https://www.hpra.ie/find-a-medicine'),
    ('aifa', 'Italian Medicines Agency (AIFA)', 'IT', 'Italy', 'https://www.aifa.gov.it/', 'https://medicinali.aifa.gov.it/'),
    ('zva-lv', 'State Agency of Medicines', 'LV', 'Latvia', 'https://www.zva.gov.lv/en', 'https://dati.zva.gov.lv/zalu-registrs/en'),
    ('vvkt-lt', 'State Medicines Control Agency', 'LT', 'Lithuania', 'https://vvkt.lrv.lt/en/', 'https://vapris.vvkt.lt/vvkt-web/public/medications'),
    ('health-lu', 'Ministry of Health and Social Security', 'LU', 'Luxembourg', 'https://sante.public.lu/en.html', 'https://sante.public.lu/en/espace-professionnel/domaines/pharmacies-et-medicaments/medicaments-humains.html'),
    ('mma-mt', 'Malta Medicines Authority', 'MT', 'Malta', 'https://medicinesauthority.gov.mt/', 'https://medicinesauthority.gov.mt/medicine-search/'),
    ('cbg-nl', 'Medicines Evaluation Board (CBG-MEB)', 'NL', 'Netherlands', 'https://www.cbg-meb.nl/', 'https://www.geneesmiddeleninformatiebank.nl/'),
    ('urpl-pl', 'Office for Registration of Medicinal Products, Medical Devices and Biocidal Products (URPL)', 'PL', 'Poland', 'https://www.urpl.gov.pl/en', 'https://rejestry.ezdrowie.gov.pl/rpl/search/public'),
    ('infarmed-pt', 'National Authority of Medicines and Health Products (INFARMED)', 'PT', 'Portugal', 'https://www.infarmed.pt/web/infarmed-en/', 'https://extranet.infarmed.pt/INFOMED-fo/'),
    ('anmmdr-ro', 'National Agency for Medicines and Medical Devices of Romania', 'RO', 'Romania', 'https://www.anm.ro/en/', 'https://nomenclator.anm.ro/medicamente'),
    ('sukl-sk', 'State Institute for Drug Control', 'SK', 'Slovakia', 'https://www.sukl.sk/', 'https://www.sukl.sk/hlavna-stranka/slovenska-verzia/databazy-a-servis/vyhladavanie-liekov?page_id=242'),
    ('jazmp-si', 'Agency for Medicinal Products and Medical Devices of the Republic of Slovenia (JAZMP)', 'SI', 'Slovenia', 'https://www.jazmp.si/en/', 'https://www.cbz.si/'),
    ('aemps', 'Spanish Agency of Medicines and Medical Devices (AEMPS)', 'ES', 'Spain', 'https://www.aemps.gob.es/', 'https://cima.aemps.es/cima/publico/home.html'),
    ('mpa-se', 'Swedish Medical Products Agency', 'SE', 'Sweden', 'https://www.lakemedelsverket.se/en', 'https://www.lakemedelsverket.se/en')
)
insert into public.global_resources
  (id, name, resource_type, geographic_scope, jurisdiction_code, jurisdiction_name,
   region, authority_tier, description, limitations, homepage_url, data_url,
   terms_url, access_mode, reuse_status, integration_status, update_cadence, healthcheck_url)
select
  id,
  name,
  'regulator',
  'national',
  jurisdiction_code,
  jurisdiction_name,
  'Europe',
  1,
  name || ' is the official national authority identified by the European Medicines Agency for human-medicine authorisation or oversight in ' || jurisdiction_name || '.',
  'Information applies in ' || jurisdiction_name || ' and to the exact medicine, indication, procedure, population, and date. The national-language authority record and current legal decision control.',
  homepage_url,
  data_url,
  null,
  'search',
  'link-only',
  'directory',
  'Official link checked every 6 hours',
  homepage_url
from eu_authorities
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
  integration_status = case when public.global_resources.integration_status = 'live' then 'live' else excluded.integration_status end,
  update_cadence = case when public.global_resources.integration_status = 'live' then public.global_resources.update_cadence else excluded.update_cadence end,
  healthcheck_url = excluded.healthcheck_url,
  updated_at = now();

select public.refresh_global_resource_eligibility();


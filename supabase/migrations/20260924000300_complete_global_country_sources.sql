-- Complete worldwide country-source coverage for 195 sovereign states:
-- 193 United Nations members plus the Holy See and the State of Palestine.
-- Generated from the WHO country roster, WHO Certification Scheme competent-
-- authority contacts, and the UN M49 geographic classification on 2026-09-24.
-- A WHO directory listing is not the same as WHO Listed Authority designation.

create table if not exists public.global_country_roster (
  jurisdiction_code text primary key check (jurisdiction_code ~ '^[A-Z]{2}$'),
  iso3_code text not null unique check (iso3_code ~ '^[A-Z]{3}$'),
  jurisdiction_name text not null,
  region text not null check (region in ('Europe', 'Americas', 'Asia-Pacific', 'Africa', 'Middle East')),
  source_kind text not null check (source_kind in ('regulator', 'who_profile')),
  authority_name text not null,
  authority_url text not null check (authority_url ~ '^https://'),
  reference_url text not null check (reference_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

insert into public.global_country_roster
  (jurisdiction_code, iso3_code, jurisdiction_name, region, source_kind, authority_name, authority_url, reference_url)
values
  ('AF', 'AFG', 'Afghanistan', 'Asia-Pacific', 'regulator', 'Afghanistan Food and Drug Authority (AFDA)', 'https://www.afda.gov.af/en', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AL', 'ALB', 'Albania', 'Europe', 'who_profile', 'WHO country profile — Albania', 'https://www.who.int/countries/alb', 'https://www.who.int/countries/alb'),
  ('DZ', 'DZA', 'Algeria', 'Africa', 'regulator', 'National Agency for Pharmaceutical Products', 'https://anpp.dz/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AD', 'AND', 'Andorra', 'Europe', 'who_profile', 'WHO country profile — Andorra', 'https://www.who.int/countries/and', 'https://www.who.int/countries/and'),
  ('AO', 'AGO', 'Angola', 'Africa', 'regulator', 'Agencia Reguladora de Medicamentos e Tecnologias de Saude (ARMED)', 'https://armed.gov.ao/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AG', 'ATG', 'Antigua and Barbuda', 'Americas', 'who_profile', 'WHO country profile — Antigua and Barbuda', 'https://www.who.int/countries/atg', 'https://www.who.int/countries/atg'),
  ('AR', 'ARG', 'Argentina', 'Americas', 'regulator', 'Administración Nacional de Medicamentos, Alimentos y Tecnología Médica (ANMAT)', 'https://www.anmat.gob.ar/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AM', 'ARM', 'Armenia', 'Europe', 'regulator', 'Scientific Centre of Drug and Medical Technology Expertise', 'https://www.pharm.am/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AU', 'AUS', 'Australia', 'Asia-Pacific', 'regulator', 'Therapeutic Goods Administration (TGA)', 'https://www.tga.gov.au/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AT', 'AUT', 'Austria', 'Europe', 'regulator', 'Austrian Agency for Health and Food Safety', 'https://www.ages.at/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AZ', 'AZE', 'Azerbaijan', 'Europe', 'who_profile', 'WHO country profile — Azerbaijan', 'https://www.who.int/countries/aze', 'https://www.who.int/countries/aze'),
  ('BS', 'BHS', 'Bahamas', 'Americas', 'who_profile', 'WHO country profile — Bahamas', 'https://www.who.int/countries/bhs', 'https://www.who.int/countries/bhs'),
  ('BH', 'BHR', 'Bahrain', 'Middle East', 'regulator', 'National Health Regulatory Authority (NHRA)', 'https://www.nhra.bh/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BD', 'BGD', 'Bangladesh', 'Asia-Pacific', 'regulator', 'Directorate General of Drug Administration (DGDA)', 'https://dgda.portal.gov.bd/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BB', 'BRB', 'Barbados', 'Americas', 'regulator', 'The Barbados Drug Service, Ministry of Health', 'https://drugservice.gov.bb/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BY', 'BLR', 'Belarus', 'Europe', 'regulator', 'Department of Pharmaceutical Inspection and Organization of Medicines Provision, Ministry of Health of the Republic of Belarus', 'https://www.rceth.by/en', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BE', 'BEL', 'Belgium', 'Europe', 'regulator', 'Federal Agency for Medicines and Health Products (FAMHP)', 'https://www.famhp.be/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BZ', 'BLZ', 'Belize', 'Americas', 'who_profile', 'WHO country profile — Belize', 'https://www.who.int/countries/blz', 'https://www.who.int/countries/blz'),
  ('BJ', 'BEN', 'Benin', 'Africa', 'regulator', 'Agence Béninoise de Régulation Pharmaceutique (ABRP)', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BT', 'BTN', 'Bhutan', 'Asia-Pacific', 'regulator', 'Drug Regulatory Authority, Royal Government of Bhutan', 'https://www.dra.gov.bt/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BO', 'BOL', 'Bolivia (Plurinational State of)', 'Americas', 'regulator', 'National Medical Products Administration, Ministerio de Previsión Social y Laboratorios', 'https://www.agemed.gob.bo/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BA', 'BIH', 'Bosnia and Herzegovina', 'Europe', 'who_profile', 'WHO country profile — Bosnia and Herzegovina', 'https://www.who.int/countries/bih', 'https://www.who.int/countries/bih'),
  ('BW', 'BWA', 'Botswana', 'Africa', 'regulator', 'Botswana Medicines Regulatory Authority (BoMRA)', 'https://www.bomra.co.bw/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BR', 'BRA', 'Brazil', 'Americas', 'regulator', 'Agência Nacional de Vigilância Sanitária (ANVISA)', 'https://www.gov.br/anvisa/pt-br/english', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BN', 'BRN', 'Brunei Darussalam', 'Asia-Pacific', 'regulator', 'Department of Pharmaceutical Services, Ministry of Health', 'https://moh.gov.bn/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BG', 'BGR', 'Bulgaria', 'Europe', 'regulator', 'Bulgarian Drug Agency (BDA)', 'https://www.bda.bg/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BF', 'BFA', 'Burkina Faso', 'Africa', 'regulator', 'National Agency for Pharmaceutical Regulation of Burkina Faso (ANRP)', 'https://anrp.bf/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('BI', 'BDI', 'Burundi', 'Africa', 'regulator', 'Burundi National Medicines Regulatory Authority (ABREMA)', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CV', 'CPV', 'Cabo Verde', 'Africa', 'regulator', 'Entidade Reguladora Independente da Saúde (ERIS), Ministry of Health', 'https://www.eris.cv/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('KH', 'KHM', 'Cambodia', 'Asia-Pacific', 'regulator', 'Department of Drugs and food, Ministry of Health', 'https://ddf.moh.gov.kh/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CM', 'CMR', 'Cameroon', 'Africa', 'regulator', 'Direction de la Pharmacie du Medicament et des Laboratoires (DPML)', 'https://dpml.cm/index.php/fr/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CA', 'CAN', 'Canada', 'Americas', 'regulator', 'Health Canada, Health portfolio', 'https://www.canada.ca/en/health-canada', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CF', 'CAF', 'Central African Republic', 'Africa', 'regulator', 'Direction des services Pharmaceutiques des laboratoires et de la Médecine Traditionnelle, Ministère de la Santé publique et de la Population', 'https://www.sante.gouv.cf/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TD', 'TCD', 'Chad', 'Africa', 'regulator', 'La Direction des Pharmacies et des Laboratoires d''Analyses, Direction des Pharmacies, Ministère de la Santé Publique', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CL', 'CHL', 'Chile', 'Americas', 'regulator', 'Departamento de Control Nacional, Instituto de Salud Pública de Chile, Ministerio de Salud', 'https://www.ispch.gob.cl/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CN', 'CHN', 'China', 'Asia-Pacific', 'regulator', 'National Medical Products Administration', 'https://english.nmpa.gov.cn/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CO', 'COL', 'Colombia', 'Americas', 'regulator', 'Instituto Nacional de Vigilancia de Medicamentos y Alimentos (INVIMA)', 'https://www.invima.gov.co/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('KM', 'COM', 'Comoros', 'Africa', 'who_profile', 'WHO country profile — Comoros', 'https://www.who.int/countries/com', 'https://www.who.int/countries/com'),
  ('CG', 'COG', 'Congo', 'Africa', 'who_profile', 'WHO country profile — Congo', 'https://www.who.int/countries/cog', 'https://www.who.int/countries/cog'),
  ('CR', 'CRI', 'Costa Rica', 'Americas', 'regulator', 'Ministry of Health', 'https://www.ministeriodesalud.go.cr/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CI', 'CIV', 'Côte d’Ivoire', 'Africa', 'regulator', 'Direction des Services Pharmaceutiques, Ministère de la Santé', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('HR', 'HRV', 'Croatia', 'Europe', 'regulator', 'Agency for Medicinal Products and Medical Devices of Croatia HALMED', 'https://www.halmed.hr/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CU', 'CUB', 'Cuba', 'Americas', 'regulator', 'Centro para el Control Estatal de la Calidad de los Medicamentos (CECMED)', 'https://www.cecmed.cu/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CY', 'CYP', 'Cyprus', 'Europe', 'regulator', 'Pharmaceutical Services; Ministry of Health', 'https://www.moh.gov.cy/phs', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('CZ', 'CZE', 'Czechia', 'Europe', 'who_profile', 'WHO country profile — Czechia', 'https://www.who.int/countries/cze', 'https://www.who.int/countries/cze'),
  ('KP', 'PRK', 'Democratic People''s Republic of Korea', 'Asia-Pacific', 'who_profile', 'WHO country profile — Democratic People''s Republic of Korea', 'https://www.who.int/countries/prk', 'https://www.who.int/countries/prk'),
  ('CD', 'COD', 'Democratic Republic of the Congo', 'Africa', 'regulator', 'The Directorate of Pharmacy, Medicines and Traditional Medicine (ACOREP)', 'https://www.acorep.cd/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('DK', 'DNK', 'Denmark', 'Europe', 'regulator', 'Danish Medicines Agency', 'https://www.laegemiddelstyrelsen.dk/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('DJ', 'DJI', 'Djibouti', 'Africa', 'regulator', 'Direction du Médicament, de la Pharmacie et des Laboratoires (DMPL), Ministère de la Santé Publique', 'https://www.sante.gouv.dj/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('DM', 'DMA', 'Dominica', 'Americas', 'who_profile', 'WHO country profile — Dominica', 'https://www.who.int/countries/dma', 'https://www.who.int/countries/dma'),
  ('DO', 'DOM', 'Dominican Republic', 'Americas', 'regulator', 'Departamento de Drogas y Farmacias, Secretario de Estado de Salud Pública y Asistencia Social', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('EC', 'ECU', 'Ecuador', 'Americas', 'regulator', 'Agencia Nacional de Regulación, Control y Vigilancia Sanitaria (ARCSA)', 'https://www.controlsanitario.gob.ec/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('EG', 'EGY', 'Egypt', 'Africa', 'regulator', 'Egyptian Drug Authority (EDA), Ministry of Health', 'https://www.edaegypt.gov.eg/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SV', 'SLV', 'El Salvador', 'Americas', 'regulator', 'Dirección Nacional de Medicamentos', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GQ', 'GNQ', 'Equatorial Guinea', 'Africa', 'regulator', 'Servicio de Farmacia y Suministros Médicos, Ministerio de Sanidad y Medio Ambiente', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('ER', 'ERI', 'Eritrea', 'Africa', 'who_profile', 'WHO country profile — Eritrea', 'https://www.who.int/countries/eri', 'https://www.who.int/countries/eri'),
  ('EE', 'EST', 'Estonia', 'Europe', 'regulator', 'State Agency of Medicines', 'https://www.ravimiamet.ee/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SZ', 'SWZ', 'Eswatini', 'Africa', 'who_profile', 'WHO country profile — Eswatini', 'https://www.who.int/countries/swz', 'https://www.who.int/countries/swz'),
  ('ET', 'ETH', 'Ethiopia', 'Africa', 'regulator', 'Ethiopian Food and Drug Authority (EFDA)', 'https://www.efda.gov.et/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('FJ', 'FJI', 'Fiji', 'Asia-Pacific', 'regulator', 'Fiji Medicines Regulatory Authority (Fiji MRA)', 'https://www.health.gov.fj/fiji-mra', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('FI', 'FIN', 'Finland', 'Europe', 'regulator', 'Finnish Medicines Agency (FIMEA)', 'https://www.fimea.fi/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('FR', 'FRA', 'France', 'Europe', 'regulator', 'National Agency for the Safety of Medicine and Health Products ANSM', 'https://ansm.sante.fr/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GA', 'GAB', 'Gabon', 'Africa', 'regulator', 'Gabon Medicines Agency', 'https://www.amgabon.ga/index.php', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GM', 'GMB', 'Gambia', 'Africa', 'who_profile', 'WHO country profile — Gambia', 'https://www.who.int/countries/gmb', 'https://www.who.int/countries/gmb'),
  ('GE', 'GEO', 'Georgia', 'Europe', 'regulator', 'Drug Agency', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('DE', 'DEU', 'Germany', 'Europe', 'regulator', 'Federal Institute for Drugs and Medical Devices', 'https://www.bfarm.de/DE/Home/_node.html', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GH', 'GHA', 'Ghana', 'Africa', 'regulator', 'Food and Drugs Authority Food and Drugs Board', 'https://www.fdaghana.gov.gh/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GR', 'GRC', 'Greece', 'Europe', 'regulator', 'National Organization for Medicines; Ministry of Health and Social Solidarity', 'https://www.eof.gr/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GD', 'GRD', 'Grenada', 'Americas', 'who_profile', 'WHO country profile — Grenada', 'https://www.who.int/countries/grd', 'https://www.who.int/countries/grd'),
  ('GT', 'GTM', 'Guatemala', 'Americas', 'regulator', 'Departamento de Regulación y Control de Productos Farmacéuticos y Afines (DRCPFA)', 'https://medicamentos.mspas.gob.gt/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GN', 'GIN', 'Guinea', 'Africa', 'regulator', 'Direction Nationale de la Pharmacie et du Médicament () ; Ministère de la Santé', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GW', 'GNB', 'Guinea-Bissau', 'Africa', 'who_profile', 'WHO country profile — Guinea-Bissau', 'https://www.who.int/countries/gnb', 'https://www.who.int/countries/gnb'),
  ('GY', 'GUY', 'Guyana', 'Americas', 'regulator', 'The Government Analyst, Food and Drugs Department, Ministry of Health', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('HT', 'HTI', 'Haiti', 'Americas', 'regulator', 'DPM/MT, Palais des Ministères', 'https://www.mspp.gouv.ht/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('VA', 'VAT', 'Holy See', 'Europe', 'regulator', 'Directorate of Health and Hygiene of Vatican City State', 'https://www.vaticanstate.va/en/state-and-government/structure-of-the-government/directorates/tag-manager/directorate-of-health-and-hygiene.html', 'https://www.vaticanstate.va/en/state-and-government/structure-of-the-government/directorates/tag-manager/directorate-of-health-and-hygiene.html'),
  ('HN', 'HND', 'Honduras', 'Americas', 'regulator', 'Division de Farmacia, Ministerio de Salud Pública', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('HU', 'HUN', 'Hungary', 'Europe', 'regulator', 'National Public Health and Pharmaceutical Centre', 'https://www.nnk.gov.hu/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('IS', 'ISL', 'Iceland', 'Europe', 'regulator', 'Icelandic Medicines Agency', 'https://www.ima.is/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('IN', 'IND', 'India', 'Asia-Pacific', 'regulator', 'Central Drugs Standard Control Organisation (CDSCO)', 'https://cdsco.gov.in/opencms/opencms/en/Home/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('ID', 'IDN', 'Indonesia', 'Asia-Pacific', 'regulator', 'The Indonesian Food and Drug Authority (BPOM)', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('IR', 'IRN', 'Iran (Islamic Republic of)', 'Asia-Pacific', 'regulator', 'Food and Drug Administration', 'https://fda.gov.ir/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('IQ', 'IRQ', 'Iraq', 'Middle East', 'regulator', 'State Establishment for Pharmaceutical Drugs and Medical Appliances, Ministry of Health', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('IE', 'IRL', 'Ireland', 'Europe', 'regulator', 'Health Products Regulatory Authority (HPRA)', 'https://www.hpra.ie/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('IL', 'ISR', 'Israel', 'Middle East', 'regulator', 'The Pharmaceutical Division of the Ministry of Health', 'https://www.health.gov.il/English/MinistryUnits/HealthDivision/MedicalTechnologies/Drugs', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('IT', 'ITA', 'Italy', 'Europe', 'regulator', 'Italian Medicines Agency (AIFA)', 'https://www.aifa.gov.it/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('JM', 'JAM', 'Jamaica', 'Americas', 'regulator', 'Pharmaceutical Services Division, Ministry of Health and Wellness', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('JP', 'JPN', 'Japan', 'Asia-Pacific', 'regulator', 'Ministry of Health, Labour and Welfare', 'https://www.mhlw.go.jp/stf/english/index.html', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('JO', 'JOR', 'Jordan', 'Middle East', 'regulator', 'Jordan Food and Drug Administration (JFDA)', 'https://www.jfda.jo/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('KZ', 'KAZ', 'Kazakhstan', 'Asia-Pacific', 'who_profile', 'WHO country profile — Kazakhstan', 'https://www.who.int/countries/kaz', 'https://www.who.int/countries/kaz'),
  ('KE', 'KEN', 'Kenya', 'Africa', 'regulator', 'Pharmacy and Poisons Board', 'https://web.pharmacyboardkenya.org/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('KI', 'KIR', 'Kiribati', 'Asia-Pacific', 'who_profile', 'WHO country profile — Kiribati', 'https://www.who.int/countries/kir', 'https://www.who.int/countries/kir'),
  ('KW', 'KWT', 'Kuwait', 'Middle East', 'regulator', 'Drug Control and Registration Centre, Ministry of Public Health', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('KG', 'KGZ', 'Kyrgyzstan', 'Asia-Pacific', 'who_profile', 'WHO country profile — Kyrgyzstan', 'https://www.who.int/countries/kgz', 'https://www.who.int/countries/kgz'),
  ('LA', 'LAO', 'Lao People''s Democratic Republic', 'Asia-Pacific', 'regulator', 'Food and Drug Department (FDD), Ministry of Health', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('LV', 'LVA', 'Latvia', 'Europe', 'regulator', 'State Agency of Medicines of the Republic of Latvia', 'https://www.zva.gov.lv/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('LB', 'LBN', 'Lebanon', 'Middle East', 'who_profile', 'WHO country profile — Lebanon', 'https://www.who.int/countries/lbn', 'https://www.who.int/countries/lbn'),
  ('LS', 'LSO', 'Lesotho', 'Africa', 'regulator', 'Lesotho Medicines and Medical Devices Control Authority, Ministry of Health', 'https://health.gov.ls/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('LR', 'LBR', 'Liberia', 'Africa', 'regulator', 'The Liberia Medicines & Health Products Regulatory Authority (LMHRA)', 'https://www.lmhra.gov.lr/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('LY', 'LBY', 'Libya', 'Africa', 'regulator', 'Ministry of health Central Medical Stores', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('LI', 'LIE', 'Liechtenstein', 'Europe', 'regulator', 'Office of Health of Liechtenstein', 'https://www.llv.li/en/national-administration/office-of-health', 'https://www.llv.li/en/national-administration/office-of-health'),
  ('LT', 'LTU', 'Lithuania', 'Europe', 'who_profile', 'WHO country profile — Lithuania', 'https://www.who.int/countries/ltu', 'https://www.who.int/countries/ltu'),
  ('LU', 'LUX', 'Luxembourg', 'Europe', 'regulator', 'Ministry of Health', 'https://www.sante.lu/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MG', 'MDG', 'Madagascar', 'Africa', 'regulator', 'Direction des Pharmacies et Laboratoires, Ministère de la Santé', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MW', 'MWI', 'Malawi', 'Africa', 'regulator', 'Pharmacy and Medicines Regulatory Authority (PMRA)', 'https://www.pmra.mw/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MY', 'MYS', 'Malaysia', 'Asia-Pacific', 'regulator', 'National Pharmaceutical Regulatory Agency (NPRA)', 'https://www.npra.gov.my/index.php/en/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MV', 'MDV', 'Maldives', 'Asia-Pacific', 'regulator', 'Maldives Food and Drug Authority (MFDA), Ministry of Health', 'https://health.gov.mv/en/departments/maldives-food-and-drug-authority', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('ML', 'MLI', 'Mali', 'Africa', 'who_profile', 'WHO country profile — Mali', 'https://www.who.int/countries/mli', 'https://www.who.int/countries/mli'),
  ('MT', 'MLT', 'Malta', 'Europe', 'regulator', 'Malta Medicines Authority (MMA)', 'https://medicinesauthority.gov.mt/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MH', 'MHL', 'Marshall Islands', 'Asia-Pacific', 'who_profile', 'WHO country profile — Marshall Islands', 'https://www.who.int/countries/mhl', 'https://www.who.int/countries/mhl'),
  ('MR', 'MRT', 'Mauritania', 'Africa', 'regulator', 'Direction de la Santé Publique ; Ministère de la Santé', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MU', 'MUS', 'Mauritius', 'Africa', 'regulator', 'Pharmaceutical Services, Ministry of Health and Wellness', 'https://health.govmu.org/health/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MX', 'MEX', 'Mexico', 'Americas', 'regulator', 'Dirección General de Control de Insumos para la Salud Dirección de Control de Medicamentos (Cofepris)', 'https://www.gob.mx/cofepris/en', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('FM', 'FSM', 'Micronesia (Federated States of)', 'Asia-Pacific', 'who_profile', 'WHO country profile — Micronesia (Federated States of)', 'https://www.who.int/countries/fsm', 'https://www.who.int/countries/fsm'),
  ('MC', 'MCO', 'Monaco', 'Europe', 'who_profile', 'WHO country profile — Monaco', 'https://www.who.int/countries/mco', 'https://www.who.int/countries/mco'),
  ('MN', 'MNG', 'Mongolia', 'Asia-Pacific', 'regulator', 'Directorate of Medical Services, Ministry of Health and Social Welfare', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('ME', 'MNE', 'Montenegro', 'Europe', 'who_profile', 'WHO country profile — Montenegro', 'https://www.who.int/countries/mne', 'https://www.who.int/countries/mne'),
  ('MA', 'MAR', 'Morocco', 'Africa', 'regulator', 'Direction du Médicament et de la Pharmacie, Secretariat d''Etat Chargé de la Santé, Ministère des Affaires Sociales', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MZ', 'MOZ', 'Mozambique', 'Africa', 'regulator', 'National Medicines Regulatory Authority (ANARME, IP)', 'https://anarme.gov.mz/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MM', 'MMR', 'Myanmar', 'Asia-Pacific', 'regulator', 'Department of Food and Drug Administration, Ministry of Health and Sports', 'https://www.fda.gov.mm/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('NA', 'NAM', 'Namibia', 'Africa', 'regulator', 'Namibian Medicines regulatory council, Ministry of Health and Social Services', 'https://nmrc.gov.na/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('NR', 'NRU', 'Nauru', 'Asia-Pacific', 'who_profile', 'WHO country profile — Nauru', 'https://www.who.int/countries/nru', 'https://www.who.int/countries/nru'),
  ('NP', 'NPL', 'Nepal', 'Asia-Pacific', 'regulator', 'Department of Drug Administration (DDA), Ministry of Health', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('NL', 'NLD', 'Netherlands (Kingdom of the)', 'Europe', 'who_profile', 'WHO country profile — Netherlands (Kingdom of the)', 'https://www.who.int/countries/nld', 'https://www.who.int/countries/nld'),
  ('NZ', 'NZL', 'New Zealand', 'Asia-Pacific', 'regulator', 'Medsafe, New Zealand Medicines and Medical Devices Safety Authority', 'https://www.medsafe.govt.nz/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('NI', 'NIC', 'Nicaragua', 'Americas', 'regulator', 'Dirección General de Normalización de Insumos Médicos, Ministerio de Salud Pública', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('NE', 'NER', 'Niger', 'Africa', 'who_profile', 'WHO country profile — Niger', 'https://www.who.int/countries/ner', 'https://www.who.int/countries/ner'),
  ('NG', 'NGA', 'Nigeria', 'Africa', 'regulator', 'National Agency for Food and Drug Administration and Control (NAFDAC)', 'https://www.nafdac.gov.ng/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('MK', 'MKD', 'North Macedonia', 'Europe', 'who_profile', 'WHO country profile — North Macedonia', 'https://www.who.int/countries/mkd', 'https://www.who.int/countries/mkd'),
  ('NO', 'NOR', 'Norway', 'Europe', 'regulator', 'National medicines authority of Norway', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('OM', 'OMN', 'Oman', 'Middle East', 'regulator', 'Directorate General of Medical Supplies (DGMS)', 'https://www.moh.gov.om/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PK', 'PAK', 'Pakistan', 'Asia-Pacific', 'regulator', 'Drug Regulatory Authority of Pakistan', 'https://www.dra.gov.pk/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PW', 'PLW', 'Palau', 'Asia-Pacific', 'who_profile', 'WHO country profile — Palau', 'https://www.who.int/countries/plw', 'https://www.who.int/countries/plw'),
  ('PA', 'PAN', 'Panama', 'Americas', 'regulator', 'Director Departamento de Farmacia y Drogas, Ministerio de Salud', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PG', 'PNG', 'Papua New Guinea', 'Asia-Pacific', 'regulator', 'Ministry of Health, National Department of Health', 'https://www.health.gov.pg/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PY', 'PRY', 'Paraguay', 'Americas', 'regulator', 'Direccion de Viglancia Sanitaria del Ministerio de Salud Publica y Bienestar Social (MSPBS)', 'https://www.mspbs.gov.py/registros-sanitarios-vigentes.html', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PE', 'PER', 'Peru', 'Americas', 'regulator', 'Dirección General de Medicamentos, Insumos y Drogas (DIGEMID)', 'https://www.digemid.minsa.gob.pe/webDigemid/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PH', 'PHL', 'Philippines', 'Asia-Pacific', 'regulator', 'Food and Drug Administration, Ministry of Health', 'https://www.fda.gov.ph/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PL', 'POL', 'Poland', 'Europe', 'regulator', 'The Main Pharmaceutical Inspectorate', 'https://www.gif.gov.pl/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PT', 'PRT', 'Portugal', 'Europe', 'regulator', 'Instituto Nacional da Farmácia e do Medicamento (INFARMED)', 'https://www.inframed.pt/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('QA', 'QAT', 'Qatar', 'Middle East', 'regulator', 'Pharmacy and Drug Control Department Ministry of Public Health', 'https://www.moph.gov.qa/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('KR', 'KOR', 'Republic of Korea', 'Asia-Pacific', 'who_profile', 'WHO country profile — Republic of Korea', 'https://www.who.int/countries/kor', 'https://www.who.int/countries/kor'),
  ('MD', 'MDA', 'Republic of Moldova', 'Europe', 'who_profile', 'WHO country profile — Republic of Moldova', 'https://www.who.int/countries/mda', 'https://www.who.int/countries/mda'),
  ('RO', 'ROU', 'Romania', 'Europe', 'regulator', 'National Authority of Medicines and Medical Devices of Romania', 'https://www.anm.ro/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('RU', 'RUS', 'Russian Federation', 'Europe', 'regulator', 'Ministry of Health of the Russian Federation', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('RW', 'RWA', 'Rwanda', 'Africa', 'regulator', 'Rwanda Food and Drugs Authority (Rwanda FDA)', 'https://rwandafda.gov.rw/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('KN', 'KNA', 'Saint Kitts and Nevis', 'Americas', 'who_profile', 'WHO country profile — Saint Kitts and Nevis', 'https://www.who.int/countries/kna', 'https://www.who.int/countries/kna'),
  ('LC', 'LCA', 'Saint Lucia', 'Americas', 'regulator', 'The Medical Supplies Officer, Ministry of Health', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('VC', 'VCT', 'Saint Vincent and the Grenadines', 'Americas', 'who_profile', 'WHO country profile — Saint Vincent and the Grenadines', 'https://www.who.int/countries/vct', 'https://www.who.int/countries/vct'),
  ('WS', 'WSM', 'Samoa', 'Asia-Pacific', 'who_profile', 'WHO country profile — Samoa', 'https://www.who.int/countries/wsm', 'https://www.who.int/countries/wsm'),
  ('SM', 'SMR', 'San Marino', 'Europe', 'who_profile', 'WHO country profile — San Marino', 'https://www.who.int/countries/smr', 'https://www.who.int/countries/smr'),
  ('ST', 'STP', 'Sao Tome and Principe', 'Africa', 'regulator', 'Direção da Farmácia, Ministério da Saúde Pública', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SA', 'SAU', 'Saudi Arabia', 'Middle East', 'regulator', 'Saudi Food and Drug Authority (SFDA)', 'https://www.sfda.gov.sa/en', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SN', 'SEN', 'Senegal', 'Africa', 'regulator', 'Inspection des Pharmacies, Ministère de la Santé Publique et l''Action sociale', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('RS', 'SRB', 'Serbia', 'Europe', 'who_profile', 'WHO country profile — Serbia', 'https://www.who.int/countries/srb', 'https://www.who.int/countries/srb'),
  ('SC', 'SYC', 'Seychelles', 'Africa', 'regulator', 'Pharmaceutical Services, Ministry of Health', 'https://www.health.gov.sc/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SL', 'SLE', 'Sierra Leone', 'Africa', 'regulator', 'Pharmacy Board of Sierra Leone', 'https://www.pharmacyboard.gov.sl/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SG', 'SGP', 'Singapore', 'Asia-Pacific', 'regulator', 'Health Products Regulation Group, Health Sciences Authority', 'https://www.hsa.gov.sg/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SK', 'SVK', 'Slovakia', 'Europe', 'who_profile', 'WHO country profile — Slovakia', 'https://www.who.int/countries/svk', 'https://www.who.int/countries/svk'),
  ('SI', 'SVN', 'Slovenia', 'Europe', 'regulator', 'Agency for Medicinal Products and Medical Devices of the Republic of Slovenia', 'https://www.jazmp.si/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SB', 'SLB', 'Solomon Islands', 'Asia-Pacific', 'regulator', 'Director, Pharmacy Services, Ministry of Health and Medical Services', 'https://solomons.gov.sb/ministry-of-health-medical-services/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SO', 'SOM', 'Somalia', 'Africa', 'regulator', 'Pharmaceuticals Regulation Section, Ministry of Health', 'https://www.moh.gov.so/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('ZA', 'ZAF', 'South Africa', 'Africa', 'regulator', 'South African Health Products Regulatory Authority (SAHPRA)', 'https://www.sahpra.org.za/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SS', 'SSD', 'South Sudan', 'Africa', 'who_profile', 'WHO country profile — South Sudan', 'https://www.who.int/countries/ssd', 'https://www.who.int/countries/ssd'),
  ('ES', 'ESP', 'Spain', 'Europe', 'regulator', 'Spanish Agency for Medicines and Health Products (AEMPS)', 'https://www.aemps.gob.es/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('LK', 'LKA', 'Sri Lanka', 'Asia-Pacific', 'regulator', 'National Medicines Regulatory Authority (NMRA)', 'https://www.nmra.gov.lk/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('PS', 'PSE', 'State of Palestine', 'Middle East', 'regulator', 'Palestinian Ministry of Health', 'https://site.moh.ps/', 'https://site.moh.ps/'),
  ('SD', 'SDN', 'Sudan', 'Africa', 'regulator', 'National Medicines and Poisons Board (NMPB)', 'https://www.nmpb.gov.sd/en/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SR', 'SUR', 'Suriname', 'Americas', 'regulator', 'Ministry of Health', 'https://www.gov.sr/ministeries/ministerie-van-volksgezondheid', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SE', 'SWE', 'Sweden', 'Europe', 'who_profile', 'WHO country profile — Sweden', 'https://www.who.int/countries/swe', 'https://www.who.int/countries/swe'),
  ('CH', 'CHE', 'Switzerland', 'Europe', 'regulator', 'Swissmedic, Swiss Agency for Therapeutic Products', 'https://www.swissmedic.ch/swissmedic/en/home.html', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('SY', 'SYR', 'Syrian Arab Republic', 'Middle East', 'regulator', 'MOH- Directorate of Pharmaceutical Affairs, Ministry of Health', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TJ', 'TJK', 'Tajikistan', 'Asia-Pacific', 'who_profile', 'WHO country profile — Tajikistan', 'https://www.who.int/countries/tjk', 'https://www.who.int/countries/tjk'),
  ('TH', 'THA', 'Thailand', 'Asia-Pacific', 'regulator', 'Food and Drug Administration', 'https://en.fda.moph.go.th/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TL', 'TLS', 'Timor-Leste', 'Asia-Pacific', 'who_profile', 'WHO country profile — Timor-Leste', 'https://www.who.int/countries/tls', 'https://www.who.int/countries/tls'),
  ('TG', 'TGO', 'Togo', 'Africa', 'regulator', 'Directeur des Pharmacies et Laboratoires, Direction Générale de Santé Publique', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TO', 'TON', 'Tonga', 'Asia-Pacific', 'who_profile', 'WHO country profile — Tonga', 'https://www.who.int/countries/ton', 'https://www.who.int/countries/ton'),
  ('TT', 'TTO', 'Trinidad and Tobago', 'Americas', 'regulator', 'Chemistry, Food and Drugs Division of the Ministry of Health', 'https://www.health.gov.tt/services/chemistry-food-and-drugs-division', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TN', 'TUN', 'Tunisia', 'Africa', 'regulator', 'Direction de la Pharmacie et du Médicament', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TR', 'TUR', 'Türkiye', 'Middle East', 'regulator', 'Turkish Medicines and Medical Devices Agency (TITCK)', 'https://www.titck.gov.tr/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TM', 'TKM', 'Turkmenistan', 'Asia-Pacific', 'regulator', 'Centre for Registration of Medical Products and State Quality Control under the Ministry of Health and Medical Industry of Turkmenistan', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TV', 'TUV', 'Tuvalu', 'Asia-Pacific', 'who_profile', 'WHO country profile — Tuvalu', 'https://www.who.int/countries/tuv', 'https://www.who.int/countries/tuv'),
  ('UG', 'UGA', 'Uganda', 'Africa', 'who_profile', 'WHO country profile — Uganda', 'https://www.who.int/countries/uga', 'https://www.who.int/countries/uga'),
  ('UA', 'UKR', 'Ukraine', 'Europe', 'regulator', 'State Service of Ukraine on Medicines and Drugs Control (SMDC)', 'https://www.dls.gov.ua/en/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('AE', 'ARE', 'United Arab Emirates', 'Middle East', 'regulator', 'Dubai Health Authority (DHA)', 'https://www.dha.gov.ae/en/HealthRegulationSector/DrugControl', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('GB', 'GBR', 'United Kingdom of Great Britain and Northern Ireland', 'Europe', 'regulator', 'Medicines & Healthcare products Regulatory Agency (MHRA)', 'https://www.gov.uk/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('TZ', 'TZA', 'United Republic of Tanzania', 'Africa', 'regulator', 'Tanzania Medicines and Medical Devices Authority (TMDA)', 'https://www.tmda.go.tz/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('US', 'USA', 'United States of America', 'Americas', 'regulator', 'Food and Drug Administration (FDA)', 'https://www.fda.gov/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('UY', 'URY', 'Uruguay', 'Americas', 'who_profile', 'WHO country profile — Uruguay', 'https://www.who.int/countries/ury', 'https://www.who.int/countries/ury'),
  ('UZ', 'UZB', 'Uzbekistan', 'Asia-Pacific', 'who_profile', 'WHO country profile — Uzbekistan', 'https://www.who.int/countries/uzb', 'https://www.who.int/countries/uzb'),
  ('VU', 'VUT', 'Vanuatu', 'Asia-Pacific', 'regulator', 'Principal Pharmacist, Department of Health', 'https://moh.gov.vu/index.php/docspp/principal-pharmacist', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('VE', 'VEN', 'Venezuela (Bolivarian Republic of)', 'Americas', 'regulator', 'Instituto Nacional de Higiene Rafael Rangel (INHRR)', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('VN', 'VNM', 'Viet Nam', 'Asia-Pacific', 'who_profile', 'WHO country profile — Viet Nam', 'https://www.who.int/countries/vnm', 'https://www.who.int/countries/vnm'),
  ('YE', 'YEM', 'Yemen', 'Middle East', 'regulator', 'Supreme Board of Drugs and Medical Appliances', 'https://ysbda.com/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('ZM', 'ZMB', 'Zambia', 'Africa', 'regulator', 'Zambia Medicines Regulatory Authority (ZAMRA)', 'https://www.zamra.co.zm/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts'),
  ('ZW', 'ZWE', 'Zimbabwe', 'Africa', 'regulator', 'Medicines Control Authority of Zimbabwe', 'https://www.mcaz.co.zw/', 'https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts')
on conflict (jurisdiction_code) do update set
  iso3_code = excluded.iso3_code,
  jurisdiction_name = excluded.jurisdiction_name,
  region = excluded.region,
  source_kind = excluded.source_kind,
  authority_name = excluded.authority_name,
  authority_url = excluded.authority_url,
  reference_url = excluded.reference_url,
  updated_at = now();

insert into public.global_resources
  (id, name, resource_type, geographic_scope, jurisdiction_code, jurisdiction_name,
   region, authority_tier, description, limitations, homepage_url, data_url,
   terms_url, access_mode, reuse_status, integration_status, update_cadence, healthcheck_url)
select
  case when roster.source_kind = 'regulator' then 'global-authority-' else 'who-country-' end || lower(roster.jurisdiction_code),
  roster.authority_name,
  case when roster.source_kind = 'regulator' then 'regulator' else 'international_organization' end,
  'national',
  roster.jurisdiction_code,
  roster.jurisdiction_name,
  roster.region,
  2,
  case when roster.source_kind = 'regulator'
    then 'The World Health Organization Certification Scheme directory identifies ' || roster.authority_name || ' as a competent pharmaceutical authority serving ' || roster.jurisdiction_name || '.'
    else 'Official World Health Organization country profile for ' || roster.jurisdiction_name || ', providing national health data, programmes, priorities, publications, and WHO country-office information.'
  end,
  case when roster.source_kind = 'regulator'
    then 'Directory participation does not mean WHO Listed Authority status. Information applies only in ' || roster.jurisdiction_name || '; the authority’s current national-language record and legal decision control.'
    else 'This is a WHO country profile, not a national medicines approval database. Use it for country context and follow its official links for current national regulatory decisions.'
  end,
  roster.authority_url,
  roster.authority_url,
  roster.reference_url,
  'search',
  'link-only',
  'directory',
  'WHO reference directory checked every 6 hours',
  roster.reference_url
from public.global_country_roster roster
where not exists (
  select 1 from public.global_resources existing
  where existing.jurisdiction_code = roster.jurisdiction_code
    and existing.geographic_scope = 'national'
    and existing.resource_type in ('regulator', 'international_organization')
    and existing.id <> (case when roster.source_kind = 'regulator' then 'global-authority-' else 'who-country-' end || lower(roster.jurisdiction_code))
)
on conflict (id) do update set
  name = excluded.name,
  resource_type = excluded.resource_type,
  geographic_scope = excluded.geographic_scope,
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

select public.refresh_global_resource_eligibility();

do $$
declare roster_count integer;
declare covered_count integer;
begin
  select count(*) into roster_count from public.global_country_roster;
  select count(distinct roster.jurisdiction_code) into covered_count
  from public.global_country_roster roster
  join public.global_resources resource on resource.jurisdiction_code = roster.jurisdiction_code
    and resource.geographic_scope = 'national'
    and resource.is_eligible;
  if roster_count <> 195 or covered_count <> 195 then
    raise exception 'Global country coverage incomplete: roster %, covered %', roster_count, covered_count;
  end if;
end $$;

alter table public.global_country_roster enable row level security;
revoke all on table public.global_country_roster from public, anon, authenticated;
grant all on table public.global_country_roster to service_role;

select net.http_post(
  url := 'https://nifbuyoghesveotugday.supabase.co/functions/v1/check-resource-health',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-intelligence-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'intelligence_sync_secret' order by created_at desc limit 1)
  ),
  body := '{"trigger":"global-country-expansion"}'::jsonb,
  timeout_milliseconds := 150000
);

-- Replace endpoints that moved or require query parameters with durable official
-- documentation pages. Omit a terms link where the authority exposes no stable one.
update public.global_resources set
  data_url = 'https://europepmc.org/RestfulWebService'
where id = 'europe-pmc';

update public.global_resources set
  data_url = 'https://www.ncbi.nlm.nih.gov/books/NBK25501/'
where id = 'pubmed';

update public.global_resources set
  terms_url = 'https://www.crossref.org/documentation/retrieve-metadata/'
where id = 'crossref-retraction-watch';

update public.global_resources set
  terms_url = null
where id = 'sukl';

update public.global_resources set
  terms_url = 'https://www.pmda.go.jp/english/0013.html'
where id = 'pmda';

update public.global_resources set
  terms_url = 'https://www.swissmedic.ch/swissmedic/en/home/legal-framework.html'
where id = 'swissmedic';

update public.global_resources set
  data_url = 'https://www.isrctn.com/'
where id = 'isrctn';

select public.refresh_global_resource_eligibility();

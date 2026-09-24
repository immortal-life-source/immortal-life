-- Keep all national resource cards aligned with the canonical sovereign-state
-- directory. Older trial-registry and EU authority rows predate the worldwide
-- roster and may otherwise use a different region label for the same country.

update public.global_resources resource
set
  region = roster.region,
  updated_at = now()
from public.global_country_roster roster
where resource.geographic_scope = 'national'
  and resource.jurisdiction_code = roster.jurisdiction_code
  and resource.region is distinct from roster.region;

select public.refresh_global_resource_eligibility();

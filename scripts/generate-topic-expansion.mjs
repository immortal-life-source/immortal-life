import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const domains = JSON.parse(fs.readFileSync(path.join(root, 'intelligence-topic-domains.json'), 'utf8'))
const additions = JSON.parse(fs.readFileSync(path.join(root, 'intelligence-topics-round-three.json'), 'utf8'))
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`
const sqlArray = (values) => `array[${values.map(sql).join(', ')}]::text[]`
const domainByTopic = new Map(domains.flatMap((domain) => domain.topics.map((slug, index) => [slug, { ...domain, index }])))

const taxonomyRows = domains.flatMap((domain) => domain.topics.map((slug, index) =>
  `  (${sql(slug)}, ${sql(domain.slug)}, ${sql(domain.name)}, ${sql(domain.description)}, ${domain.sortOrder}, ${domain.sortOrder * 100 + index + 1})`
)).join(',\n')

const topicRows = additions.map((topic) => {
  const domain = domainByTopic.get(topic.slug)
  if (!domain) throw new Error(`No domain for ${topic.slug}`)
  return `  (${sql(topic.slug)}, ${sql(topic.name)}, ${sql(topic.description)}, ${sql(topic.literatureQuery)}, ${sql(topic.trialsQuery)}, ${domain.sortOrder * 100 + domain.index + 1}, ${sql(domain.slug)}, ${sql(domain.name)}, ${sql(domain.description)}, ${domain.sortOrder}, ${sqlArray(topic.matchingTerms)}, ${topic.requiresAgeingContext !== false})`
}).join(',\n')

const output = `-- Expand the public taxonomy from 82 to 180 maintained topics and group every
-- topic into a reader-facing domain. New topics use database-owned matching
-- terms so the ingestion engine can grow without hard-coded application maps.
-- Historical acquisition remains complete and resumable, but is intentionally
-- paced by the existing IO-protection schedule.

alter table public.intelligence_topics
  add column if not exists domain_slug text,
  add column if not exists domain_name text,
  add column if not exists domain_description text,
  add column if not exists domain_sort integer,
  add column if not exists matching_terms text[] not null default '{}'::text[],
  add column if not exists requires_ageing_context boolean not null default true;

update public.intelligence_topics topic
set domain_slug = taxonomy.domain_slug,
    domain_name = taxonomy.domain_name,
    domain_description = taxonomy.domain_description,
    domain_sort = taxonomy.domain_sort,
    sort_order = taxonomy.topic_sort,
    updated_at = now()
from (values
${taxonomyRows}
) as taxonomy(topic_slug, domain_slug, domain_name, domain_description, domain_sort, topic_sort)
where topic.slug = taxonomy.topic_slug;

insert into public.intelligence_topics
  (slug, name, description, literature_query, trials_query, sort_order,
   domain_slug, domain_name, domain_description, domain_sort,
   matching_terms, requires_ageing_context)
values
${topicRows}
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  literature_query = excluded.literature_query,
  trials_query = excluded.trials_query,
  sort_order = excluded.sort_order,
  domain_slug = excluded.domain_slug,
  domain_name = excluded.domain_name,
  domain_description = excluded.domain_description,
  domain_sort = excluded.domain_sort,
  matching_terms = excluded.matching_terms,
  requires_ageing_context = excluded.requires_ageing_context,
  enabled = true,
  updated_at = now();

alter table public.intelligence_topics alter column domain_slug set not null;
alter table public.intelligence_topics alter column domain_name set not null;
alter table public.intelligence_topics alter column domain_description set not null;
alter table public.intelligence_topics alter column domain_sort set not null;

alter table public.intelligence_topics drop constraint if exists intelligence_topics_domain_slug_check;
alter table public.intelligence_topics add constraint intelligence_topics_domain_slug_check
  check (domain_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

create index if not exists intelligence_topics_domain_sort_idx
  on public.intelligence_topics (enabled, domain_sort, sort_order);

insert into public.intelligence_topic_counts_cache (topic_slug, research_count, trial_count, refreshed_at)
select slug, 0, 0, now() from public.intelligence_topics where enabled
on conflict (topic_slug) do nothing;

drop function if exists public.get_intelligence_topic_counts();
create function public.get_intelligence_topic_counts()
returns table (
  slug text, name text, description text, sort_order integer,
  domain_slug text, domain_name text, domain_description text, domain_sort integer,
  research_count bigint, trial_count bigint
)
language sql stable security definer set search_path = public as $$
  select topic.slug, topic.name, topic.description, topic.sort_order,
    topic.domain_slug, topic.domain_name, topic.domain_description, topic.domain_sort,
    coalesce(cache.research_count, 0), coalesce(cache.trial_count, 0)
  from public.intelligence_topics topic
  left join public.intelligence_topic_counts_cache cache on cache.topic_slug = topic.slug
  where topic.enabled
  order by topic.domain_sort, topic.sort_order;
$$;
revoke all on function public.get_intelligence_topic_counts() from public, anon, authenticated;
grant execute on function public.get_intelligence_topic_counts() to service_role;

do $$
declare enabled_count integer;
declare domain_count integer;
begin
  select count(*) into enabled_count from public.intelligence_topics where enabled;
  select count(distinct domain_slug) into domain_count from public.intelligence_topics where enabled;
  if enabled_count < 180 then raise exception 'Expected at least 180 enabled topics, found %', enabled_count; end if;
  if domain_count < 9 then raise exception 'Expected 9 topic domains, found %', domain_count; end if;
end $$;
`

fs.writeFileSync(path.join(root, 'supabase', 'migrations', '20260925001800_expand_topics_by_domain.sql'), output)
console.log(`Generated 180-topic taxonomy migration with ${domains.length} domains and ${additions.length} new topics.`)

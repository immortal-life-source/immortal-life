-- Google and other crawlers request record sitemaps ordered by the permanent
-- record id.  The public browse indexes are date-oriented, so large research
-- corpora otherwise fall back to repeated scans and can exceed the edge/CDN
-- response budget.  These partial covering indexes keep sitemap generation
-- fast without changing which records are public.

create index if not exists research_items_public_sitemap_idx
  on public.research_items (id desc)
  include (last_seen_at)
  where publication_state = 'published';

create index if not exists clinical_trials_public_sitemap_idx
  on public.clinical_trials (id desc)
  include (last_seen_at)
  where publication_state = 'published';

create index if not exists regulatory_events_public_sitemap_idx
  on public.regulatory_events (id desc)
  include (last_seen_at)
  where publication_state = 'published';

create index if not exists research_integrity_events_public_sitemap_idx
  on public.research_integrity_events (id desc)
  include (detected_at)
  where publication_state = 'published';

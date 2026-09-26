-- The management report filters by first discovery time. Partial time indexes
-- avoid scanning the complete historical corpus for each exact 24-hour count.
create index if not exists research_items_public_first_seen_idx
  on public.research_items (first_seen_at desc)
  where publication_state = 'published';

create index if not exists clinical_trials_public_first_seen_idx
  on public.clinical_trials (first_seen_at desc)
  where publication_state = 'published';

create index if not exists university_research_works_first_seen_idx
  on public.university_research_works (first_seen_at desc);

-- Reader-facing evidence and access filters must stay responsive as the
-- uncapped research corpus grows. These indexes match the public directory's
-- publication-state filter and newest-first ordering.

create index if not exists research_items_public_evidence_browse_idx
  on public.research_items (publication_state, evidence_level, published_on desc nulls last, id desc);

create index if not exists research_items_public_access_browse_idx
  on public.research_items (publication_state, is_open_access, published_on desc nulls last, id desc);

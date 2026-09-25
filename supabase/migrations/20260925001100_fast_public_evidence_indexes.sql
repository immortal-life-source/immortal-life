-- Reader-facing indexes must scale with the uncapped historical corpus.
-- These match the exact sort/filter paths used by the Research and Trial
-- directories without limiting how much history is retained.

create index if not exists research_items_public_browse_idx
  on public.research_items (publication_state, published_on desc nulls last, id desc);

create index if not exists clinical_trials_public_browse_idx
  on public.clinical_trials (publication_state, last_update_date desc nulls last, id desc);

create index if not exists research_item_topics_public_parent_idx
  on public.research_item_topics (research_item_id, is_published, topic_slug);

create index if not exists clinical_trial_topics_public_parent_idx
  on public.clinical_trial_topics (clinical_trial_id, is_published, topic_slug);

-- Retry the one dense OAI page immediately with the worker's smaller adaptive
-- write batch. Existing page checkpoints and ingested records are preserved.

update public.ingestion_jobs set
  status = 'retry', available_at = now(), locked_at = null,
  updated_at = now()
where source_id = 'doaj' and job_key = 'oai:global:history'
  and status = 'retry'
  and last_error like 'global research topic links: canceling statement due to statement timeout%';


-- Publish recent product and site-development additions in Project News.
insert into public.project_news (id, title, content, published_at, is_published)
values
  (
    'evidence-graph-and-radar-expanded',
    'Evidence graph and radar sections expanded',
    'Trial Radar, Topics, Regulatory Signals, and the Evidence Graph now give readers clearer routes into the automated longevity intelligence system. Each route explains what it covers and links people to the relevant part of the site.',
    '2026-09-16T09:00:00+02:00',
    true
  ),
  (
    'quality-engine-added',
    'Automated relevance checks added',
    'New quality controls now score record relevance, reduce duplicates, hold back weak matches, check source freshness, and explain in plain language why a record appears under a topic.',
    '2026-09-16T09:20:00+02:00',
    true
  ),
  (
    'global-resource-atlas-expanded',
    'Global Resource Atlas expanded',
    'The resources area now reaches beyond Czech sources and focuses on major international infrastructure: trial registries, medicines regulators, systematic reviews, ageing datasets, and trusted public research sources.',
    '2026-09-16T09:40:00+02:00',
    true
  ),
  (
    'university-research-index-launched',
    'University Research Index launched',
    'A new university research area helps students and curious readers discover where longevity-related research is happening around the world, with institution profiles, topic coverage, and source-backed signals.',
    '2026-09-16T10:00:00+02:00',
    true
  ),
  (
    'student-learning-path-added',
    'Longevity learning path added',
    'A new beginner-friendly learning path now explains how to read the site, understand evidence levels, explore university research, follow trials, and separate early science from stronger human evidence.',
    '2026-09-16T10:20:00+02:00',
    true
  ),
  (
    'reader-growth-feeds-added',
    'Feeds and briefing routes added',
    'Public feeds, dataset routes, change pages, weekly briefings, and automated social-card routes are now part of the publication system so the site can grow without manual editorial updates.',
    '2026-09-16T10:40:00+02:00',
    true
  ),
  (
    'linkedin-member-access-added',
    'LinkedIn member access path added',
    'LinkedIn sign-in is being added as another member access path alongside X. At this stage, members still need an access code before they can enter the dashboard.',
    '2026-09-16T11:00:00+02:00',
    true
  ),
  (
    'navigation-and-visual-refresh',
    'Navigation and visual design refreshed',
    'The site navigation, mobile experience, section labels, and visual background details have been refreshed to make the portal easier to understand for new readers while keeping the black-and-gold identity.',
    '2026-09-16T11:20:00+02:00',
    true
  )
on conflict (id) do update set
  title = excluded.title,
  content = excluded.content,
  published_at = excluded.published_at,
  is_published = excluded.is_published,
  updated_at = now();

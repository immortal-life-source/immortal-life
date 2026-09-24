import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('global university index has automated source, identity, scoring, and schedule contracts', () => {
  const migration = read('supabase/migrations/20260916000400_global_university_research_index.sql')
  assert.match(migration, /OpenAlex/)
  assert.match(migration, /ROR-backed/)
  assert.match(migration, /university_research_institutions/)
  assert.match(migration, /university_research_topic_metrics/)
  assert.match(migration, /refresh_university_research_scores/)
  assert.match(migration, /50 \* s\.activity|0\.50 \* s\.activity/)
  assert.match(migration, /immortal-life-university-index/)
  assert.match(migration, /sync-university-index/)
})

test('OpenAlex sync is global, topic-aware, ROR-backed, and excludes non-educational institutions', () => {
  const sync = read('supabase/functions/sync-university-index/index.ts')
  assert.match(sync, /group_by.*authorships\.institutions\.id/)
  assert.match(sync, /per_page.*200/)
  assert.match(sync, /item\?\.type === 'education'/)
  assert.match(sync, /!item\?\.is_super_system/)
  assert.match(sync, /TOPIC_QUERIES/)
  assert.match(sync, /representative_works/)
  assert.match(sync, /OPENALEX_API_KEY/)
  assert.doesNotMatch(sync, /manual review|expert review/i)
})

test('university pages, profiles, datasets, social cards, and sitemap are public', () => {
  const config = read('vercel.json')
  const build = read('build.js')
  const pages = read('supabase/functions/public-pages/index.ts')
  const api = read('supabase/functions/public-intelligence/index.ts')
  const social = read('supabase/functions/social-card/index.ts')
  assert.match(build, /filename: 'universities\.html'/)
  assert.match(config, /universities\/:slug/)
  assert.match(pages, /mode === 'university'/)
  assert.match(pages, /datasets\/universities|kind === 'universities'/)
  assert.match(pages, /'universities'\]/)
  assert.match(api, /view === 'universities'/)
  assert.match(social, /kind === 'university'/)
})

test('public interface explains the ranking and provides global comparison controls', () => {
  const template = read('intelligence-template.html')
  const script = read('intelligence.js')
  assert.match(template, /Global research landscape/)
  assert.match(template, /Country/)
  assert.match(template, /Continent/)
  assert.match(template, /Rank by/)
  assert.match(template, /Compare selected universities/)
  assert.match(template, /What this ranking does—and does not—mean/)
  assert.match(script, /renderUniversityRegions/)
  assert.match(template, /universityRegionGrid/)
  assert.doesNotMatch(template, /universityMapNodes/)
  assert.match(script, /fetchUniversityIndex/)
  assert.match(script, /comparedUniversities/)
  assert.doesNotMatch(`${template}\n${script}`, /forum|comments section/i)
})

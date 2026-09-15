import { ImageResponse } from 'npm:@vercel/og@0.8.5'
import React from 'npm:react@19.1.1'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 180)
}

async function cardData(supabase: any, kind: string, key: string): Promise<{ title: string; kicker: string; confidence?: number } | null> {
  if (kind === 'briefing') {
    const { data } = await supabase.from('public_briefings').select('title').eq('slug', key).maybeSingle()
    return data ? { title: data.title, kicker: 'Weekly evidence briefing' } : null
  }
  if (kind === 'entity') {
    const split = key.indexOf('-')
    if (split < 1) return null
    const entityKind = key.slice(0, split)
    const slug = key.slice(split + 1)
    const { data } = await supabase.from('intelligence_entities').select('name,kind').eq('kind', entityKind).eq('slug', slug).maybeSingle()
    return data ? { title: data.name, kicker: `${data.kind} entity` } : null
  }
  if (!/^[0-9]{1,18}$/.test(key)) return null
  const tables: Record<string, string> = { research: 'research_items', trials: 'clinical_trials', regulatory: 'regulatory_events', integrity: 'research_integrity_events' }
  const table = tables[kind]
  if (!table) return null
  const { data } = await supabase.from(table).select('title,relevance_confidence').eq('id', key).eq('publication_state', 'published').maybeSingle()
  return data ? { title: data.title, kicker: kind === 'trials' ? 'Trial Radar' : `${kind} intelligence`, confidence: Number(data.relevance_confidence ?? 100) } : null
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const url = new URL(req.url)
  const kind = safeKey(url.searchParams.get('kind') || '')
  const key = safeKey(url.searchParams.get('key') || '')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const card = await cardData(supabase, kind, key)
  if (!card) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const element = React.createElement('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '64px 72px', color: '#f5f2e8', background: 'radial-gradient(circle at 78% 22%, #493b08 0%, #111009 32%, #070706 72%)',
      fontFamily: 'Georgia, serif', position: 'relative', overflow: 'hidden',
    },
  },
  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '18px', color: '#c8a82e', fontFamily: 'Arial, sans-serif', fontSize: '25px', letterSpacing: '5px' } },
    React.createElement('div', { style: { display: 'flex', width: '44px', height: '44px', border: '2px solid #c8a82e', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', fontSize: '27px' } }, 'I'),
    'IMMORTAL.LIFE'),
  React.createElement('div', { style: { display: 'flex', flexDirection: 'column', maxWidth: '980px' } },
    React.createElement('div', { style: { color: '#a89459', fontFamily: 'Arial, sans-serif', fontSize: '20px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '24px' } }, card.kicker),
    React.createElement('div', { style: { display: 'flex', fontSize: card.title.length > 85 ? '48px' : '59px', lineHeight: 1.08, letterSpacing: '-1.5px' } }, String(card.title).slice(0, 180))),
  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#918b78', fontFamily: 'Arial, sans-serif', fontSize: '17px', letterSpacing: '1.5px' } },
    React.createElement('span', null, 'SOURCE-LINKED · AUTOMATED · NOT MEDICAL ADVICE'),
    card.confidence != null ? React.createElement('span', { style: { color: '#c8a82e' } }, `${Math.max(0, Math.min(100, card.confidence))}% MATCH`) : React.createElement('span', null, SITE.replace('https://', ''))))

  return new ImageResponse(element, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  })
})

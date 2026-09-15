import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, serviceRoleKey } from '../_shared/security.ts'

const SITE = 'https://www.immortal.life'
const CONSENT = 'I request the automated immortal.life evidence briefing and accept the privacy notice. I can unsubscribe at any time.'

function page(title: string, message: string): Response {
  const safeTitle = title.replace(/[&<>"']/g, '')
  const safeMessage = message.replace(/[&<>"']/g, '')
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} — immortal.life</title><link rel="stylesheet" href="/intelligence.css"></head><body><main><section class="intel-hero record-hero"><div class="intel-kicker">Briefing subscription</div><h1>${safeTitle}</h1><p class="intel-lede">${safeMessage}</p><p><a class="section-link" href="/briefings">Return to briefings</a></p></section></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function unsubscribeToken(id: string): Promise<string> {
  const secret = Deno.env.get('SUBSCRIPTION_SIGNING_SECRET') || serviceRoleKey()
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${id}.${signature}`
}

function validEmail(value: unknown): string | null {
  const email = String(value ?? '').trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null
}

async function sendConfirmation(email: string, token: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const from = Deno.env.get('BRIEFING_FROM_EMAIL') ?? 'immortal.life <briefings@immortal.life>'
  if (!apiKey) return false
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [email], subject: 'Confirm your immortal.life briefing', html: `<p>Confirm your automated evidence briefing:</p><p><a href="${SITE}/api/subscribe?action=confirm&token=${encodeURIComponent(token)}">Confirm subscription</a></p><p>Research information only; not medical advice.</p>` }) })
  return response.ok
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const url = new URL(req.url)
  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || ''
    const token = url.searchParams.get('token') || ''
    if (!/^(?:[a-f0-9]{64}|[a-f0-9-]{36}\.[a-f0-9]{64})$/.test(token)) return page('Invalid link', 'This subscription link is invalid or incomplete.')
    const hash = await sha256(token)
    if (action === 'confirm') {
      const { data } = await supabase.from('briefing_subscribers').update({ status: 'active', confirmed_at: new Date().toISOString(), consented_at: new Date().toISOString(), confirmation_token_hash: null }).eq('confirmation_token_hash', hash).eq('status', 'pending').select('id').maybeSingle()
      return data ? page('Subscription confirmed', 'Your automated weekly evidence briefing is active.') : page('Link already used', 'This confirmation link has expired or has already been used.')
    }
    if (action === 'unsubscribe') {
      const { data } = await supabase.from('briefing_subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('unsubscribe_token_hash', hash).neq('status', 'unsubscribed').select('id').maybeSingle()
      return data ? page('Unsubscribed', 'You will no longer receive this briefing.') : page('Already unsubscribed', 'This subscription is already inactive.')
    }
    return page('Invalid link', 'This subscription action is not recognized.')
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405, 'POST')

  let body: any = {}
  const type = req.headers.get('content-type') || ''
  if (type.includes('application/json')) body = await req.json().catch(() => ({}))
  else body = Object.fromEntries((await req.formData()).entries())
  const email = validEmail(body.email)
  const topic = String(body.topic || '').trim().toLowerCase()
  if (!email || body.consent !== 'yes') return page('Check your details', 'Enter a valid email address and confirm the subscription request.')
  let topicSlug: string | null = null
  if (topic && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)) {
    const { data } = await supabase.from('intelligence_topics').select('slug').eq('slug', topic).eq('enabled', true).maybeSingle()
    topicSlug = data?.slug ?? null
  }
  const confirmationToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const confirmationHash = await sha256(confirmationToken)
  const temporaryHash = await sha256(crypto.randomUUID())
  const { data: subscriber, error } = await supabase.from('briefing_subscribers').upsert({ email, topic_slug: topicSlug, status: 'pending', confirmation_token_hash: confirmationHash, unsubscribe_token_hash: temporaryHash, consent_text: CONSENT, confirmation_sent_at: new Date().toISOString(), unsubscribed_at: null }, { onConflict: 'email_normalized,topic_key' }).select('id').single()
  if (error) return page('Subscription unavailable', 'The request could not be saved. Please try again shortly.')
  const unsubscribe = await unsubscribeToken(subscriber.id)
  await supabase.from('briefing_subscribers').update({ unsubscribe_token_hash: await sha256(unsubscribe) }).eq('id', subscriber.id)
  const sent = await sendConfirmation(email, confirmationToken)
  return sent ? page('Check your inbox', 'Open the confirmation email to activate your briefing.') : page('Request saved', 'Email delivery is being configured. Your request is saved but is not active until confirmation can be sent.')
})

const encoder = new TextEncoder()

export type MemberSession = {
  v: 1 | 2
  member_id: number
  provider: 'x' | 'linkedin'
  subject: string
  x_id?: string
  iat: number
  exp: number
}

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function sessionSecret(): string {
  const secret = Deno.env.get('SESSION_SECRET') ?? ''
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  return secret
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)))
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i]
  return mismatch === 0
}

export async function createMemberSession(memberId: number, providerOrSubject: string, subjectValue?: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const provider = subjectValue == null ? 'x' : providerOrSubject
  const subject = subjectValue == null ? providerOrSubject : subjectValue
  if (!['x', 'linkedin'].includes(provider) || !subject) throw new Error('Invalid session identity')
  const payload: MemberSession = {
    v: 2,
    member_id: memberId,
    provider: provider as 'x' | 'linkedin',
    subject,
    iat: now,
    exp: now + DEFAULT_SESSION_TTL_SECONDS,
  }
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signature = base64UrlEncode(await hmac(encodedPayload))
  return `${encodedPayload}.${signature}`
}

export async function verifyMemberSession(token: string): Promise<MemberSession | null> {
  if (token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  let suppliedSignature: Uint8Array
  let payload: MemberSession
  try {
    suppliedSignature = base64UrlDecode(parts[1])
    const raw = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
    payload = raw?.v === 1
      ? { ...raw, provider: 'x', subject: raw.x_id }
      : raw
  } catch {
    return null
  }

  const expectedSignature = await hmac(parts[0])
  if (!timingSafeEqual(suppliedSignature, expectedSignature)) return null

  const now = Math.floor(Date.now() / 1000)
  if (
    ![1, 2].includes(payload.v) ||
    !Number.isSafeInteger(payload.member_id) ||
    payload.member_id <= 0 ||
    !['x', 'linkedin'].includes(payload.provider) ||
    typeof payload.subject !== 'string' ||
    payload.subject.length === 0 || payload.subject.length > 500 ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.iat > now + 60 ||
    payload.exp <= now ||
    payload.exp - payload.iat > DEFAULT_SESSION_TTL_SECONDS
  ) {
    return null
  }

  return payload
}

export async function sessionFromRequest(req: Request): Promise<MemberSession | null> {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return null
  return verifyMemberSession(authorization.slice(7).trim())
}

export async function createOAuthState(provider: 'linkedin'): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(32))
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({
    provider,
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    nonce: base64UrlEncode(nonce),
  })))
  return `${payload}.${base64UrlEncode(await hmac(payload))}`
}

export async function verifyOAuthState(value: string, provider: 'linkedin'): Promise<boolean> {
  if (value.length > 1024) return false
  const parts = value.split('.')
  if (parts.length !== 2) return false
  try {
    const supplied = base64UrlDecode(parts[1])
    const expected = await hmac(parts[0])
    if (!timingSafeEqual(supplied, expected)) return false
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
    return payload?.provider === provider && Number.isSafeInteger(payload?.exp) && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return new Set([
    'https://immortal.life',
    'https://www.immortal.life',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...configured,
  ])
}

export function corsHeaders(req: Request, methods: string): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    Vary: 'Origin',
  }
  if (allowedOrigins().has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  methods = 'GET, POST, OPTIONS'
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req, methods), 'Content-Type': 'application/json' },
  })
}

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin')
  return origin == null || allowedOrigins().has(origin)
}

export function serviceRoleKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
}

export function isInternalServiceRequest(req: Request): boolean {
  const serviceKey = serviceRoleKey()
  const supplied = req.headers.get('apikey')?.trim() ?? ''
  if (!serviceKey || supplied.length !== serviceKey.length) return false
  let mismatch = 0
  for (let i = 0; i < supplied.length; i++) mismatch |= supplied.charCodeAt(i) ^ serviceKey.charCodeAt(i)
  return mismatch === 0
}

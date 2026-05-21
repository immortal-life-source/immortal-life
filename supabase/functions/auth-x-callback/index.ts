import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function generateInviteCodes(count: number): string[] {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: count }, () =>
    Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  )
}

type AuthOk = { ok: true; sessionData: string }
type AuthErr = { ok: false; joinError: string }

async function invokeAwardPoints(
  memberId: number,
  action: string,
  base_points: number,
  meta: Record<string, unknown>
): Promise<void> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/award-points`
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ member_id: memberId, action, base_points, meta }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`award-points failed: ${res.status} ${t}`)
  }
}

async function runOAuthFlow(
  code: string | null,
  stateParam: string | null,
  codeVerifierBody: string | null
): Promise<AuthOk | AuthErr> {
  if (!code) return { ok: false, joinError: 'no_code' }

  let inviteCode = ''
  let codeVerifierFromState = ''
  try {
    const stateData = JSON.parse(atob(stateParam ?? ''))
    inviteCode = stateData.invite_code ?? ''
    codeVerifierFromState = stateData.code_verifier ?? ''
  } catch {
    return { ok: false, joinError: 'invalid_state' }
  }

  const codeVerifier = (codeVerifierBody ?? codeVerifierFromState) || 'challenge'

  const clientId = Deno.env.get('X_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('X_CLIENT_SECRET') ?? ''
  const redirectUri = Deno.env.get('X_REDIRECT_URI') ?? ''

  const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    console.error('Token exchange failed:', await tokenRes.text())
    return { ok: false, joinError: 'token_failed' }
  }

  const { access_token } = await tokenRes.json()

  const profileRes = await fetch(
    'https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics',
    { headers: { Authorization: `Bearer ${access_token}` } }
  )

  if (!profileRes.ok) return { ok: false, joinError: 'profile_failed' }

  const profileJson = await profileRes.json()
  const xProfile = profileJson.data

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SERVICE_ROLE_KEY') ?? ''
  )

  const { data: existingMember } = await supabase
    .from('members')
    .select('id')
    .eq('x_id', xProfile.id)
    .single()

  let memberId: number

  /** Existing account: log in only (session + last_login / avatar). No points or invites. */
  if (existingMember) {
    memberId = existingMember.id
    const lastLogin = new Date()
    await supabase
      .from('members')
      .update({ last_login: lastLogin.toISOString(), x_avatar_url: xProfile.profile_image_url })
      .eq('id', memberId)
  } else {
    /** New account: require a valid unused invite code, then signup + referrals. */
    const { data: invite } = await supabase
      .from('invite_codes')
      .select('id, owner_id, is_used')
      .eq('code', inviteCode.toUpperCase())
      .single()

    if (!invite || invite.is_used) return { ok: false, joinError: 'invalid_code' }

    const { data: inviter } = await supabase
      .from('members')
      .select('id, referral_chain_depth, invited_by, network_size')
      .eq('id', invite.owner_id)
      .single()

    const newDepth = (inviter?.referral_chain_depth ?? 0) + 1

    const { data: newMember } = await supabase
      .from('members')
      .insert({
        x_id: xProfile.id,
        x_username: xProfile.username,
        x_display_name: xProfile.name,
        x_avatar_url: xProfile.profile_image_url,
        x_follower_count: xProfile.public_metrics?.followers_count ?? 0,
        invited_by: invite.owner_id,
        referral_chain_depth: newDepth,
        points: 300,
        is_og: false,
      })
      .select('id')
      .single()

    if (!newMember) throw new Error('Failed to create member')
    memberId = newMember.id

    await supabase.from('points_log').insert({
      member_id: memberId,
      action: 'signup',
      points: 300,
      meta: { x_username: xProfile.username },
    })

    await supabase
      .from('invite_codes')
      .update({ is_used: true, used_by: memberId, used_at: new Date().toISOString() })
      .eq('id', invite.id)

    const newCodes = generateInviteCodes(3)
    await supabase.from('invite_codes').insert(newCodes.map((c) => ({ code: c, owner_id: memberId })))

    if (inviter) {
      const inviterNewNetwork = (inviter.network_size ?? 0) + 1
      await supabase.from('members').update({ network_size: inviterNewNetwork }).eq('id', inviter.id)

      if (inviter.invited_by) {
        const { data: depth2 } = await supabase
          .from('members')
          .select('network_size, invited_by')
          .eq('id', inviter.invited_by)
          .single()
        if (depth2) {
          await supabase
            .from('members')
            .update({ network_size: (depth2.network_size ?? 0) + 1 })
            .eq('id', inviter.invited_by)
          if (depth2.invited_by) {
            const { data: depth3 } = await supabase
              .from('members')
              .select('network_size')
              .eq('id', depth2.invited_by)
              .single()
            if (depth3) {
              await supabase
                .from('members')
                .update({ network_size: (depth3.network_size ?? 0) + 1 })
                .eq('id', depth2.invited_by)
            }
          }
        }
      }

      await invokeAwardPoints(inviter.id, 'invite_signup', 500, {
        invited_x_username: xProfile.username,
      })

      if (inviter.invited_by) {
        await invokeAwardPoints(inviter.invited_by, 'chain_signup_depth2', 250, {
          invited_x_username: xProfile.username,
        })

        const { data: depth2Member } = await supabase
          .from('members')
          .select('invited_by')
          .eq('id', inviter.invited_by)
          .single()

        if (depth2Member?.invited_by) {
          await invokeAwardPoints(depth2Member.invited_by, 'chain_signup_depth3', 125, {
            invited_x_username: xProfile.username,
          })
        }
      }
    }
  }

  const sessionData = btoa(JSON.stringify({ member_id: memberId, x_id: xProfile.id, ts: Date.now() }))
  return { ok: true, sessionData }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method === 'POST') {
      let body: { code?: string; state?: string; code_verifier?: string }
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const result = await runOAuthFlow(body.code ?? null, body.state ?? null, body.code_verifier ?? null)
      if (!result.ok) {
        return new Response(JSON.stringify({ ok: false, error: result.joinError }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, session: result.sessionData }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      const result = await runOAuthFlow(code, state, null)
      if (!result.ok) {
        return new Response(null, {
          status: 302,
          headers: { Location: `https://immortal.life/join?error=${result.joinError}` },
        })
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: 'https://immortal.life/dashboard',
          'Set-Cookie': `il_session=${result.sessionData}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        },
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Auth callback error:', err)
    return new Response(JSON.stringify({ ok: false, error: 'server_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

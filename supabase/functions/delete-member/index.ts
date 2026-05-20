import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const auth = req.headers.get('Authorization') ?? ''
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!bearer) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sessionPayload: { member_id?: number }
    try {
      sessionPayload = JSON.parse(atob(bearer))
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sessionMemberId = sessionPayload.member_id
    if (sessionMemberId == null || typeof sessionMemberId !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { member_id } = await req.json()
    if (!member_id) throw new Error('member_id required')

    if (Number(member_id) !== sessionMemberId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    // Verify member exists
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('id', member_id)
      .single()

    if (!member) throw new Error('Member not found')

    // Invalidate unused invite codes owned by this member
    await supabase
      .from('invite_codes')
      .update({ is_used: true })
      .eq('owner_id', member_id)
      .eq('is_used', false)

    // Nullify used_by references to this member in invite_codes
    await supabase
      .from('invite_codes')
      .update({ used_by: null })
      .eq('used_by', member_id)

    // Delete points log
    await supabase
      .from('points_log')
      .delete()
      .eq('member_id', member_id)

    // Delete member
    await supabase
      .from('members')
      .delete()
      .eq('id', member_id)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

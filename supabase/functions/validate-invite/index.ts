import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code } = await req.json()

    if (!code) {
      return new Response(
        JSON.stringify({ valid: false, error: 'No code provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase
      .from('invite_codes')
      .select('id, code, is_used, owner_id, members!invite_codes_owner_id_fkey(x_username)')
      .eq('code', code.toUpperCase())
      .single()

    if (error || !data) {
      return new Response(
        JSON.stringify({ valid: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (data.is_used) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'already_used' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ownerRel = data.members as { x_username?: string } | { x_username?: string }[] | null
    const owner_username = Array.isArray(ownerRel)
      ? (ownerRel[0]?.x_username ?? 'unknown')
      : (ownerRel?.x_username ?? 'unknown')

    return new Response(
      JSON.stringify({
        valid: true,
        owner_username,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ valid: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

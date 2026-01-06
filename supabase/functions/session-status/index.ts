// Supabase Edge Function: session-status
// Returns the status of a session

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const sessionId = url.searchParams.get('id')

        if (!sessionId) {
            return new Response(
                JSON.stringify({ error: 'Session ID required' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { data, error } = await supabase
            .from('botspg.sessions')
            .select('*')
            .eq('session_id', sessionId)
            .single()

        if (error || !data) {
            return new Response(
                JSON.stringify({ error: 'Session not found', sessionId }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
            )
        }

        return new Response(
            JSON.stringify({
                sessionId: data.session_id,
                status: data.status,
                type: data.connection_type,
                megaLink: data.mega_link,
                createdAt: data.created_at,
                completedAt: data.completed_at
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Error:', err)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})

// Supabase Edge Function: get-pair-code
// Generates a pairing code for phone number authentication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generatePairCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

function generateSessionId(length = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const phone = url.searchParams.get('number') || ''

        if (!phone || phone.length < 10) {
            return new Response(
                JSON.stringify({ error: 'Invalid phone number', code: 'INVALID_PHONE' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseKey)

        const sessionId = generateSessionId()
        const pairCode = generatePairCode()

        // Insert session into database
        const { error: dbError } = await supabase
            .from('botspg.sessions')
            .insert({
                session_id: sessionId,
                connection_type: 'pair',
                phone_number: phone.replace(/[^0-9]/g, ''),
                status: 'pending'
            })

        if (dbError) {
            console.error('Database error:', dbError)
        }

        // Return the pairing code
        // Note: In a real implementation, this would interface with WhatsApp's pairing API
        return new Response(
            JSON.stringify({
                code: pairCode,
                sessionId: sessionId,
                phone: phone,
                message: 'Enter this code in WhatsApp to pair your device'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Error:', err)
        return new Response(
            JSON.stringify({ error: 'Service temporarily unavailable', code: 'SERVICE_ERROR' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})

// Supabase Edge Function: get-pair-code
// Uses Baileys via esm.sh for npm compatibility in Deno

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Import Baileys via esm.sh (npm to ES module conversion)
import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    delay
} from 'https://esm.sh/@whiskeysockets/baileys@6.7.21'
import pino from 'https://esm.sh/pino@9.5.0'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateSessionId(length = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

function generateRandomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
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
        let phone = url.searchParams.get('number') || ''
        phone = phone.replace(/[^0-9]/g, '')

        if (!phone || phone.length < 10 || phone.length > 15) {
            return new Response(
                JSON.stringify({ error: 'Invalid phone number', code: 'INVALID_PHONE' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const sessionId = generateSessionId()
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Get Baileys version
        const { version } = await fetchLatestBaileysVersion()
        console.log('Baileys version:', version)

        // Create in-memory auth state (Edge Functions don't have persistent storage)
        const authState = {
            creds: {},
            keys: {}
        }

        // Create socket connection
        const sock = makeWASocket({
            version,
            auth: authState,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Safari'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 30000
        })

        // Request pairing code
        await delay(1500)
        const randomCode = generateRandomCode()
        const code = await sock.requestPairingCode(phone, randomCode)

        console.log('Pairing code generated:', code)

        // Store session in database
        const { error: dbError } = await supabase
            .from('botspg.sessions')
            .insert({
                session_id: sessionId,
                connection_type: 'pair',
                phone_number: phone,
                status: 'pending'
            })

        if (dbError) {
            console.error('Database error:', dbError)
        }

        // Close socket after getting code
        setTimeout(async () => {
            try {
                await sock.ws?.close()
            } catch (e) {
                console.log('Socket close error:', e)
            }
        }, 5000)

        return new Response(
            JSON.stringify({
                code: code,
                sessionId: sessionId,
                phone: phone,
                message: 'Enter this code in WhatsApp to pair your device'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Error:', err)
        return new Response(
            JSON.stringify({
                error: 'Service temporarily unavailable',
                code: 'SERVICE_ERROR',
                details: err.message
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})

// lib/supabase.js - Supabase client for session storage
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://edxiyetfcnugrmxhmvpq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

let supabase = null;

function getSupabase() {
    if (!supabase && supabaseKey) {
        // Configure with botspg schema
        console.log('Supabase URL:', supabaseUrl);
        console.log('Service Role Key present:', !!supabaseKey);
        supabase = createClient(supabaseUrl, supabaseKey, {
            db: { schema: 'botspg' }
        });
    }
    if (!supabaseKey) {
        console.log('WARNING: No Supabase service role key configured!');
    }
    return supabase;
}

// Store session with MEGA link
async function storeSession(sessionId, megaLink, phoneNumber = null, connectionType = 'pair') {
    const client = getSupabase();
    if (!client) {
        console.log('Supabase not configured, skipping session storage');
        return null;
    }

    try {
        const { data, error } = await client
            .from('sessions')  // Uses botspg.sessions due to schema config
            .upsert({
                session_id: sessionId,
                mega_link: megaLink,
                phone_number: phoneNumber,
                connection_type: connectionType,
                status: 'completed',
                completed_at: new Date().toISOString()
            }, { onConflict: 'session_id' })
            .select()
            .single();

        if (error) {
            console.error('Supabase store error:', error);
            return null;
        }
        console.log('Session stored successfully:', sessionId);
        return data;
    } catch (e) {
        console.error('Supabase store exception:', e);
        return null;
    }
}

// Get session by ID
async function getSession(sessionId) {
    const client = getSupabase();
    if (!client) {
        console.log('Supabase not configured');
        return null;
    }

    try {
        const { data, error } = await client
            .from('sessions')  // Uses botspg.sessions due to schema config
            .select('*')
            .eq('session_id', sessionId)
            .single();

        if (error) {
            console.error('Supabase get error:', error);
            return null;
        }
        return data;
    } catch (e) {
        console.error('Supabase get exception:', e);
        return null;
    }
}

module.exports = {
    getSupabase,
    storeSession,
    getSession
};

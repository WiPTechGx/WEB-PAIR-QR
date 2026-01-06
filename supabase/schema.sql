-- Supabase Database Schema for PGWIZ Session
-- Run this in the Supabase SQL Editor
-- Uses custom schema: botspg

-- Create the botspg schema
CREATE SCHEMA IF NOT EXISTS botspg;

-- Sessions table to store WhatsApp session data
CREATE TABLE IF NOT EXISTS botspg.sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id VARCHAR(50) UNIQUE NOT NULL,
    mega_link TEXT,
    phone_number VARCHAR(20),
    connection_type VARCHAR(10) DEFAULT 'qr', -- 'qr' or 'pair'
    status VARCHAR(20) DEFAULT 'pending', -- pending, connected, completed, failed
    creds_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON botspg.sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON botspg.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON botspg.sessions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE botspg.sessions ENABLE ROW LEVEL SECURITY;

-- Policy to allow insert and select for all (since we use service role for mutations)
CREATE POLICY "Allow public read" ON botspg.sessions FOR SELECT USING (true);
CREATE POLICY "Allow service role insert" ON botspg.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update" ON botspg.sessions FOR UPDATE USING (true);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION botspg.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS sessions_updated_at ON botspg.sessions;
CREATE TRIGGER sessions_updated_at
    BEFORE UPDATE ON botspg.sessions
    FOR EACH ROW
    EXECUTE FUNCTION botspg.update_updated_at();

-- Cleanup old sessions (older than 7 days)
CREATE OR REPLACE FUNCTION botspg.cleanup_old_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM botspg.sessions WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Grant usage on schema to authenticated and anon roles
GRANT USAGE ON SCHEMA botspg TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA botspg TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA botspg TO authenticated, anon;

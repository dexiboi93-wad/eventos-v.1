-- Database Setup for OAuth Integration System
-- Run this in your Supabase SQL Editor

-- ==========================================
-- 1. CREATE TABLES
-- ==========================================

-- Table to store OAuth tokens per company
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  service TEXT NOT NULL, -- 'google', 'outlook', 'slack', 'zoom', 'quickbooks'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  user_email TEXT,
  scope TEXT,
  metadata JSONB DEFAULT '{}', -- Store additional service-specific data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one token set per company per service
  CONSTRAINT unique_company_service UNIQUE(company_id, service)
);

-- Table to store OAuth state tokens for CSRF protection
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  service TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
);

-- ==========================================
-- 2. CREATE INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_company 
  ON oauth_tokens(company_id);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_service 
  ON oauth_tokens(service);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_company_service 
  ON oauth_tokens(company_id, service);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires 
  ON oauth_states(expires_at);

CREATE INDEX IF NOT EXISTS idx_oauth_states_company 
  ON oauth_states(company_id);

-- ==========================================
-- 3. CREATE FUNCTIONS
-- ==========================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for oauth_tokens
DROP TRIGGER IF EXISTS update_oauth_tokens_updated_at ON oauth_tokens;
CREATE TRIGGER update_oauth_tokens_updated_at
  BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to delete expired OAuth states
CREATE OR REPLACE FUNCTION delete_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_states 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 4. CREATE SCHEDULED JOB (pg_cron)
-- ==========================================

-- Clean up expired states every hour
-- Note: Requires pg_cron extension
-- SELECT cron.schedule(
--   'delete-expired-oauth-states',
--   '0 * * * *', -- Every hour
--   $$SELECT delete_expired_oauth_states()$$
-- );

-- ==========================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS on tables
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access on oauth_tokens"
  ON oauth_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on oauth_states"
  ON oauth_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can only read their company's tokens
-- (Adjust based on your auth setup - assumes user_id = company_id or has company_id in metadata)
CREATE POLICY "Users can read own company tokens"
  ON oauth_tokens
  FOR SELECT
  TO authenticated
  USING (company_id = auth.uid()::text);

-- ==========================================
-- 6. GRANT PERMISSIONS
-- ==========================================

-- Grant usage to service role
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON oauth_tokens TO service_role;
GRANT ALL ON oauth_states TO service_role;

-- Grant select to authenticated users
GRANT SELECT ON oauth_tokens TO authenticated;

-- ==========================================
-- 7. CREATE VIEWS (OPTIONAL)
-- ==========================================

-- View to see active OAuth connections per company
CREATE OR REPLACE VIEW oauth_connections_summary AS
SELECT 
  company_id,
  COUNT(*) as total_connections,
  ARRAY_AGG(service) as connected_services,
  MAX(updated_at) as last_updated
FROM oauth_tokens
GROUP BY company_id;

-- View to see token expiration status
CREATE OR REPLACE VIEW oauth_token_status AS
SELECT 
  id,
  company_id,
  service,
  user_email,
  CASE 
    WHEN expires_at IS NULL THEN 'never_expires'
    WHEN expires_at > NOW() THEN 'valid'
    ELSE 'expired'
  END as status,
  expires_at,
  updated_at
FROM oauth_tokens;

-- Grant access to views
GRANT SELECT ON oauth_connections_summary TO authenticated, service_role;
GRANT SELECT ON oauth_token_status TO authenticated, service_role;

-- ==========================================
-- 8. TEST DATA (OPTIONAL - for development)
-- ==========================================

-- Insert a test OAuth state (expires in 10 minutes)
-- INSERT INTO oauth_states (state, company_id, service)
-- VALUES ('test-state-12345', 'test-company', 'google');

-- Insert a test OAuth token (never expires)
-- INSERT INTO oauth_tokens (company_id, service, access_token, refresh_token, user_email)
-- VALUES (
--   'test-company',
--   'google',
--   'test-access-token',
--   'test-refresh-token',
--   'test@example.com'
-- );

-- ==========================================
-- 9. VERIFICATION QUERIES
-- ==========================================

-- Check if tables were created successfully
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('oauth_tokens', 'oauth_states');

-- Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('oauth_tokens', 'oauth_states');

-- Check RLS policies
SELECT tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename IN ('oauth_tokens', 'oauth_states');

-- ==========================================
-- 10. CLEANUP (if needed)
-- ==========================================

-- To drop everything and start fresh:
-- DROP VIEW IF EXISTS oauth_connections_summary;
-- DROP VIEW IF EXISTS oauth_token_status;
-- DROP TABLE IF EXISTS oauth_tokens CASCADE;
-- DROP TABLE IF EXISTS oauth_states CASCADE;
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
-- DROP FUNCTION IF EXISTS delete_expired_oauth_states() CASCADE;

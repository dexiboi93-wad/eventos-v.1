-- =====================================================
-- Event Orchestrator Database Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. COMPANIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

-- =====================================================
-- 2. USER PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Viewer' CHECK (role IN ('Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer')),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster company queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_company_id ON user_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- =====================================================
-- 3. OAUTH CONNECTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_user_id VARCHAR(255),
  provider_email VARCHAR(255),
  access_token TEXT NOT NULL, -- Encrypt in production
  refresh_token TEXT, -- Encrypt in production
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_provider UNIQUE(user_id, provider)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_provider ON oauth_connections(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_company_id ON oauth_connections(company_id);

-- =====================================================
-- 4. OAUTH STATES TABLE (CSRF Protection)
-- =====================================================
CREATE TABLE IF NOT EXISTS oauth_states (
  state VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- =====================================================
-- 5. TEAM INVITATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_team_invitations_company_id ON team_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

-- Constraint to prevent duplicate pending invitations
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_invitation 
ON team_invitations(company_id, email) 
WHERE status = 'pending';

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Companies Policies
-- =====================================================
-- Users can view their own company
CREATE POLICY "Users can view their own company"
ON companies FOR SELECT
USING (
  id IN (
    SELECT company_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- Mastermind can update their company
CREATE POLICY "Mastermind can update their company"
ON companies FOR UPDATE
USING (
  id IN (
    SELECT company_id FROM user_profiles 
    WHERE id = auth.uid() AND role = 'Mastermind'
  )
);

-- =====================================================
-- User Profiles Policies
-- =====================================================
-- Users can view profiles in their company
CREATE POLICY "Users can view company profiles"
ON user_profiles FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
USING (id = auth.uid());

-- Mastermind can update any profile in their company
CREATE POLICY "Mastermind can update company profiles"
ON user_profiles FOR UPDATE
USING (
  company_id IN (
    SELECT company_id FROM user_profiles 
    WHERE id = auth.uid() AND role = 'Mastermind'
  )
);

-- =====================================================
-- OAuth Connections Policies
-- =====================================================
-- Users can view their own OAuth connections
CREATE POLICY "Users can view own oauth connections"
ON oauth_connections FOR SELECT
USING (user_id = auth.uid());

-- Users can insert their own OAuth connections
CREATE POLICY "Users can insert own oauth connections"
ON oauth_connections FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own OAuth connections
CREATE POLICY "Users can update own oauth connections"
ON oauth_connections FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own OAuth connections
CREATE POLICY "Users can delete own oauth connections"
ON oauth_connections FOR DELETE
USING (user_id = auth.uid());

-- =====================================================
-- OAuth States Policies
-- =====================================================
-- Users can manage their own OAuth states
CREATE POLICY "Users can manage own oauth states"
ON oauth_states FOR ALL
USING (user_id = auth.uid());

-- =====================================================
-- Team Invitations Policies
-- =====================================================
-- Users can view invitations in their company
CREATE POLICY "Users can view company invitations"
ON team_invitations FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- Mastermind and Coordinator can insert invitations
CREATE POLICY "Authorized users can send invitations"
ON team_invitations FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id FROM user_profiles 
    WHERE id = auth.uid() 
    AND role IN ('Mastermind', 'Coordinator')
  )
);

-- Users can update invitations they sent
CREATE POLICY "Users can update own invitations"
ON team_invitations FOR UPDATE
USING (invited_by = auth.uid());

-- Mastermind and Coordinator can delete invitations
CREATE POLICY "Authorized users can delete invitations"
ON team_invitations FOR DELETE
USING (
  company_id IN (
    SELECT company_id FROM user_profiles 
    WHERE id = auth.uid() 
    AND role IN ('Mastermind', 'Coordinator')
  )
);

-- =====================================================
-- 7. FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_companies_updated_at 
BEFORE UPDATE ON companies 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at 
BEFORE UPDATE ON user_profiles 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_connections_updated_at 
BEFORE UPDATE ON oauth_connections 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to expire old team invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void AS $$
BEGIN
  UPDATE team_invitations 
  SET status = 'expired' 
  WHERE status = 'pending' 
  AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. SCHEDULED JOBS (Optional - requires pg_cron)
-- =====================================================
-- Run cleanup every hour (if pg_cron is available)
-- SELECT cron.schedule('cleanup-oauth-states', '0 * * * *', 'SELECT cleanup_expired_oauth_states()');
-- SELECT cron.schedule('expire-invitations', '0 * * * *', 'SELECT expire_old_invitations()');

-- =====================================================
-- 9. SEED DATA (Optional for testing)
-- =====================================================

-- Create a default company for testing
INSERT INTO companies (id, name, slug) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Company', 'default')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- END OF SCHEMA
-- =====================================================

-- Verify tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('companies', 'user_profiles', 'oauth_connections', 'oauth_states', 'team_invitations')
ORDER BY table_name;

COMMENT ON TABLE companies IS 'Organizations/companies using the event orchestrator';
COMMENT ON TABLE user_profiles IS 'Extended user profile data with company association and role';
COMMENT ON TABLE oauth_connections IS 'OAuth tokens for Google Calendar and Microsoft 365 integrations';
COMMENT ON TABLE oauth_states IS 'Temporary storage for OAuth state parameters (CSRF protection)';
COMMENT ON TABLE team_invitations IS 'Pending team member invitations';

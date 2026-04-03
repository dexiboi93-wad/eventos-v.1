# Reference SQL Schema & RLS Policies

## ⚠️ IMPORTANT NOTICE

**This file is for REFERENCE ONLY.** 

The Figma Make environment uses a Key-Value store and **cannot execute SQL migrations or create custom tables**. The enterprise multi-tenant architecture has been implemented using the existing KV store with company-scoped keys.

However, when you're ready to migrate to a production Supabase instance, this document provides the complete SQL schema and Row Level Security (RLS) policies you'll need.

---

## Production Migration Path

When moving to production Supabase:

1. **Export data from KV store** (company-scoped format)
2. **Create these tables** in production database
3. **Enable RLS policies** as shown below
4. **Import data** into proper tables
5. **Update backend** to use Supabase client instead of KV
6. **Test thoroughly** with multiple companies

---

## Database Schema

### 1. Companies Table

```sql
-- Companies (Organizations/Tenants)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own company"
  ON companies FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company owners can update their company"
  ON companies FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Indexes
CREATE INDEX companies_owner_id_idx ON companies(owner_id);
```

### 2. Company Members Table

```sql
-- Company Members (Team Roster)
CREATE TABLE company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer')),
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Enable RLS
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view members of their company"
  ON company_members FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Masterminds can manage company members"
  ON company_members FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role = 'Mastermind'
    )
  );

-- Indexes
CREATE INDEX company_members_company_id_idx ON company_members(company_id);
CREATE INDEX company_members_user_id_idx ON company_members(user_id);
CREATE INDEX company_members_role_idx ON company_members(role);
```

### 3. Invitations Table

```sql
-- Team Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  UNIQUE(company_id, email, status) WHERE status = 'pending'
);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view invitations for their company"
  ON invitations FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coordinators and Masterminds can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role IN ('Mastermind', 'Coordinator')
    )
  );

CREATE POLICY "Anyone can view their own invitation" 
  ON invitations FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Indexes
CREATE INDEX invitations_company_id_idx ON invitations(company_id);
CREATE INDEX invitations_email_idx ON invitations(email);
CREATE INDEX invitations_status_idx ON invitations(status);
```

### 4. Events Table

```sql
-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  date TEXT,
  location TEXT,
  phase TEXT,
  attendees TEXT,
  budget TEXT,
  progress TEXT,
  image TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view events from their company"
  ON events FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Planners and above can create events"
  ON events FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role IN ('Mastermind', 'Coordinator', 'Planner')
    )
  );

CREATE POLICY "Planners and above can update events"
  ON events FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role IN ('Mastermind', 'Coordinator', 'Planner')
    )
  );

CREATE POLICY "Coordinators and above can delete events"
  ON events FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role IN ('Mastermind', 'Coordinator')
    )
  );

-- Indexes
CREATE INDEX events_company_id_idx ON events(company_id);
CREATE INDEX events_created_by_idx ON events(created_by);
```

### 5. Vendors Table

```sql
-- Vendors
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  category TEXT,
  avatar TEXT,
  assigned_event_ids TEXT[],
  documents JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- Policies (same pattern as events)
CREATE POLICY "Users can view vendors from their company"
  ON vendors FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Planners and above can manage vendors"
  ON vendors FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role IN ('Mastermind', 'Coordinator', 'Planner')
    )
  );

-- Indexes
CREATE INDEX vendors_company_id_idx ON vendors(company_id);
CREATE INDEX vendors_category_idx ON vendors(category);
```

### 6. Venues Table

```sql
-- Venues
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  capacity INTEGER,
  price_range TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  amenities TEXT[],
  layout_pdf_url TEXT,
  is_retired BOOLEAN DEFAULT false,
  notes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Policies (same pattern as vendors)
CREATE POLICY "Users can view venues from their company"
  ON venues FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Planners and above can manage venues"
  ON venues FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role IN ('Mastermind', 'Coordinator', 'Planner')
    )
  );

-- Indexes
CREATE INDEX venues_company_id_idx ON venues(company_id);
CREATE INDEX venues_is_retired_idx ON venues(is_retired);
```

### 7. Clients Table (CRM)

```sql
-- Clients
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  status TEXT,
  assigned_events UUID[],
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view clients from their company"
  ON clients FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Planners and above can manage clients"
  ON clients FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() AND role IN ('Mastermind', 'Coordinator', 'Planner')
    )
  );

-- Indexes
CREATE INDEX clients_company_id_idx ON clients(company_id);
CREATE INDEX clients_email_idx ON clients(email);
```

### 8. User Profiles Table (Extended Auth)

```sql
-- User Profiles (extends auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Users can view profiles of their team members
CREATE POLICY "Users can view team member profiles"
  ON user_profiles FOR SELECT
  USING (
    id IN (
      SELECT cm.user_id FROM company_members cm
      WHERE cm.company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );
```

---

## Helper Functions

### Get User's Company ID

```sql
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;
```

### Check User Role

```sql
CREATE OR REPLACE FUNCTION user_has_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE user_id = auth.uid() AND role = ANY(required_roles)
  );
$$ LANGUAGE SQL SECURITY DEFINER;
```

### Check Permission

```sql
CREATE OR REPLACE FUNCTION user_can_manage_company(target_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = target_company_id
      AND user_id = auth.uid()
      AND role = 'Mastermind'
  );
$$ LANGUAGE SQL SECURITY DEFINER;
```

---

## Triggers

### Update Timestamps

```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Data Migration Script

When migrating from KV to SQL:

```sql
-- Example migration for events
-- You'd run this after exporting data from KV

INSERT INTO events (id, company_id, name, type, date, location, phase, attendees, budget, progress, image, created_by, created_at)
SELECT 
  gen_random_uuid(),
  'COMPANY_ID_HERE', -- Replace with actual company ID
  data->>'name',
  data->>'type',
  data->>'date',
  data->>'location',
  data->>'phase',
  data->>'attendees',
  data->>'budget',
  data->>'progress',
  data->>'image',
  'USER_ID_HERE', -- Replace with creator user ID
  now()
FROM imported_kv_events;
```

---

## Security Considerations

### 1. Never Bypass RLS
```sql
-- BAD - Bypasses RLS
SELECT * FROM events; -- As postgres/service_role

-- GOOD - Uses RLS
SELECT * FROM events; -- As authenticated user
```

### 2. Service Role Usage
Only use `service_role` key for:
- Admin operations
- Server-side batch operations
- Background jobs

Never expose `service_role` key to frontend.

### 3. Test RLS Policies

```sql
-- Test as different users
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-id-here';

-- Try to access another company's data (should fail)
SELECT * FROM events WHERE company_id = 'other-company-id';
```

---

## Performance Optimization

### Indexes Strategy

```sql
-- Composite indexes for common queries
CREATE INDEX events_company_date_idx ON events(company_id, date);
CREATE INDEX vendors_company_category_idx ON vendors(company_id, category);
CREATE INDEX company_members_company_role_idx ON company_members(company_id, role);
```

### Materialized Views for Analytics

```sql
-- Company statistics
CREATE MATERIALIZED VIEW company_stats AS
SELECT 
  c.id as company_id,
  c.name as company_name,
  COUNT(DISTINCT e.id) as total_events,
  COUNT(DISTINCT v.id) as total_vendors,
  COUNT(DISTINCT cm.user_id) as team_size
FROM companies c
LEFT JOIN events e ON e.company_id = c.id
LEFT JOIN vendors v ON v.company_id = c.id
LEFT JOIN company_members cm ON cm.company_id = c.id
GROUP BY c.id, c.name;

-- Refresh periodically
REFRESH MATERIALIZED VIEW company_stats;
```

---

## Backup & Recovery

### Automated Backups

```sql
-- Enable point-in-time recovery (PITR)
-- This is configured in Supabase dashboard

-- Manual backup script
pg_dump -h your-db.supabase.co -U postgres -Fc -f backup_$(date +%Y%m%d).dump
```

### Company Data Export

```sql
-- Export all data for one company
COPY (
  SELECT json_agg(row_to_json(e.*))
  FROM events e
  WHERE company_id = 'company-id-here'
) TO '/tmp/company_events.json';
```

---

## Summary

This SQL schema provides:

✅ **Complete data isolation** per company
✅ **Row-level security** on all tables
✅ **Role-based access control** via policies
✅ **Audit trail** with timestamps and user tracking
✅ **Referential integrity** with foreign keys
✅ **Performance optimization** with strategic indexes
✅ **Secure defaults** with RLS enabled

When you're ready to move to production, use this schema as your foundation and adjust as needed for your specific requirements.

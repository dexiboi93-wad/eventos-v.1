# Supabase Backend Implementation - Configuration Answers

## ✅ Question 1: Single Function or Multiple?

**Answer: SINGLE FUNCTION** - Deploy as one Edge Function with slug `make-server-6c8332a9`

All frontend calls use this base URL pattern:
```
https://{projectId}.supabase.co/functions/v1/make-server-6c8332a9/{endpoint}
```

The function should act as a **router** that handles multiple endpoints:
- `/auth/*` - Authentication endpoints
- `/integrations/google-calendar/*` - Google Calendar OAuth & API
- `/integrations/microsoft/*` - Microsoft 365 OAuth & API
- `/team/*` - Team management endpoints
- `/upload-avatar` - Avatar upload endpoint

---

## ✅ Question 2: Database Schema

### Current Schema (Needs to be Created/Confirmed):

#### **Table: `user_profiles`**
Stores user profile information including company association and role.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Viewer',
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster company queries
CREATE INDEX idx_user_profiles_company_id ON user_profiles(company_id);
```

**Frontend expects from `/auth/profile`:**
```typescript
{
  profile: {
    name: string;
    role: 'Mastermind' | 'Coordinator' | 'Planner' | 'Assistant' | 'Viewer';
    companyId: string;
    avatarUrl: string | null;
  }
}
```

---

#### **Table: `companies`**
Stores company/organization information.

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

#### **Table: `oauth_connections`**
Stores OAuth tokens for Google Calendar and Microsoft 365 integrations.

```sql
CREATE TABLE oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google' or 'microsoft'
  provider_user_id VARCHAR(255),
  provider_email VARCHAR(255),
  access_token TEXT NOT NULL, -- Should be encrypted in production
  refresh_token TEXT, -- Should be encrypted in production
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Index for faster lookups
CREATE INDEX idx_oauth_connections_user_provider ON oauth_connections(user_id, provider);
```

---

#### **Table: `oauth_states`**
Temporary storage for OAuth state parameters (CSRF protection).

```sql
CREATE TABLE oauth_states (
  state VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Auto-cleanup old states
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);
```

---

#### **Table: `team_invitations`**
Stores pending team member invitations.

```sql
CREATE TABLE team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'Mastermind' | 'Coordinator' | 'Planner' | 'Assistant' | 'Viewer'
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'accepted' | 'expired' | 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  CONSTRAINT unique_pending_invitation UNIQUE(company_id, email, status)
);

-- Index for faster company queries
CREATE INDEX idx_team_invitations_company_id ON team_invitations(company_id);
CREATE INDEX idx_team_invitations_email ON team_invitations(email);
```

---

### How Company ID is Stored:

1. **User's Company Association:**
   - Stored in `user_profiles.company_id` (foreign key to `companies.id`)
   - One user belongs to ONE company (not multi-tenant per user)
   
2. **Getting User's Company:**
   ```sql
   SELECT company_id, role 
   FROM user_profiles 
   WHERE id = {authenticated_user_id};
   ```

3. **Company Membership Model:**
   - Direct foreign key relationship: `user_profiles.company_id → companies.id`
   - No separate `company_memberships` junction table needed (simpler model)
   - Role is stored directly in `user_profiles.role`

---

### Team Membership Roles:

**5 Role Types (in order of permissions):**

1. **`Mastermind`** - Super admin, full access to everything
   - Can manage company settings
   - Can invite/remove any team member
   - Can assign any role including Mastermind
   - Can manage integrations and billing

2. **`Coordinator`** - Senior team member
   - Can manage events, vendors, finances
   - Can invite users (except Mastermind)
   - Can view all company data

3. **`Planner`** - Event planner
   - Can create and edit events
   - Can manage vendors and venues
   - Cannot invite users or manage finances

4. **`Assistant`** - Support role
   - Can view and assist with events
   - Can manage tasks
   - Limited editing permissions

5. **`Viewer`** - Read-only access
   - Can view events and resources
   - Cannot edit or create anything

**Role Enforcement:**
- Stored as VARCHAR in `user_profiles.role`
- Backend should validate role permissions on all endpoints
- Frontend checks `user.role` from AuthContext

---

## ✅ Question 3: CORS Support

**Answer: YES - CORS is REQUIRED**

The frontend makes **direct browser calls** to the Edge Function, so CORS headers are mandatory.

### CORS Configuration Needed:

```typescript
// In your Edge Function, add OPTIONS handler and CORS headers:

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or specify your domain
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Max-Age': '86400', // 24 hours
};

// Handle preflight OPTIONS requests
if (req.method === 'OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Add CORS headers to all responses
return new Response(JSON.stringify(data), {
  status: 200,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
  },
});
```

### Authentication:

All authenticated endpoints receive:
```
Authorization: Bearer {supabase_access_token}
```

Extract user from JWT:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? ''
);

// Get user from JWT
const authHeader = req.headers.get('Authorization');
const token = authHeader?.replace('Bearer ', '');
const { data: { user }, error } = await supabaseClient.auth.getUser(token);

if (error || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: corsHeaders,
  });
}
```

---

## 📋 Edge Function Router Structure

Here's the recommended structure for your single Edge Function:

```typescript
// supabase/functions/make-server-6c8332a9/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // Route to appropriate handler
    if (path.startsWith('/auth/')) {
      return handleAuth(req, path);
    } else if (path.startsWith('/integrations/google-calendar/')) {
      return handleGoogleCalendar(req, path);
    } else if (path.startsWith('/integrations/microsoft/')) {
      return handleMicrosoft(req, path);
    } else if (path.startsWith('/team/')) {
      return handleTeam(req, path);
    } else if (path === '/upload-avatar') {
      return handleUploadAvatar(req);
    } else {
      return jsonResponse({ error: 'Not found' }, 404);
    }
  } catch (error) {
    console.error('Function error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

---

## 🔑 Environment Variables Required

Add these to your Supabase Edge Function secrets:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-application-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=common

# App Settings
APP_BASE_URL=https://your-app-domain.com

# Optional: Token Encryption Key (32 bytes, base64 encoded)
OAUTH_TOKEN_ENCRYPTION_KEY=your-base64-encoded-32-byte-key
```

Set secrets via Supabase CLI:
```bash
supabase secrets set GOOGLE_CLIENT_ID=your-value
supabase secrets set GOOGLE_CLIENT_SECRET=your-value
# ... etc
```

---

## 📝 Additional Notes

### Priority Endpoints to Implement First:

1. **Authentication:**
   - `GET /auth/profile` - Frontend needs this immediately on login
   - `POST /auth/signup` - User registration
   - `PUT /auth/profile` - Profile updates

2. **Team Management:**
   - `GET /team/members` - Show team list
   - `GET /team/invitations` - Show pending invites
   - `POST /team/invite` - Send invitation

3. **Google Calendar:**
   - `GET /integrations/google-calendar/status` - Check connection
   - `POST /integrations/google-calendar/oauth/url` - Start OAuth
   - `POST /integrations/google-calendar/oauth/callback` - Complete OAuth
   - `GET /integrations/google-calendar/events` - Fetch events

### Security Checklist:

- ✅ Validate JWT token on all protected endpoints
- ✅ Check user's role for permission-based operations
- ✅ Validate OAuth state parameter (CSRF protection)
- ✅ Encrypt/decrypt OAuth tokens before storing
- ✅ Rate limit sensitive endpoints (invitations, OAuth)
- ✅ Log all OAuth operations for audit trail
- ✅ Set proper token expiration times

### Testing Recommendations:

1. Use Postman/Thunder Client to test endpoints
2. Mock OAuth responses for initial testing
3. Test with real Google/Microsoft OAuth once credentials are set up
4. Test role-based access control (RBAC) scenarios
5. Test token refresh logic thoroughly

---

## 🎯 Summary for Supabase AI

**Deploy:** Single Edge Function with slug `make-server-6c8332a9`

**CORS:** Yes, required for browser calls

**Database Tables Required:**
- `companies` - Organization data
- `user_profiles` - User data with `company_id` and `role` columns
- `oauth_connections` - Google/Microsoft tokens
- `oauth_states` - OAuth CSRF protection
- `team_invitations` - Pending invites

**Company ID Storage:** 
- `user_profiles.company_id` (UUID, foreign key to `companies.id`)
- Direct relationship, no junction table

**Team Roles:** 
- 5 roles: `Mastermind`, `Coordinator`, `Planner`, `Assistant`, `Viewer`
- Stored in `user_profiles.role` (VARCHAR)

**Authentication:** 
- JWT token via `Authorization: Bearer {token}` header
- Extract user with `supabase.auth.getUser(token)`

Ready to generate the Edge Function implementation! 🚀

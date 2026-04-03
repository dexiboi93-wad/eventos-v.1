# 🚀 Complete Backend Setup Guide for Supabase AI

## 📋 Quick Summary for Supabase AI

### What You Need to Build:

**ONE Edge Function** named `make-server-6c8332a9` that acts as a router handling these endpoint groups:

1. **Authentication** (`/auth/*`)
2. **Google Calendar OAuth** (`/integrations/google-calendar/*`)
3. **Microsoft 365 OAuth** (`/integrations/microsoft/*`)
4. **Team Management** (`/team/*`)
5. **Misc** (`/upload-avatar`)

---

## 🎯 Direct Answers to Your Questions

### 1. Deployment Type?
**✅ SINGLE FUNCTION** with slug: `make-server-6c8332a9`

### 2. Database Tables Available?
**❌ Need to be created** - Run `/DATABASE_SCHEMA.sql` in Supabase SQL Editor

**Key tables:**
- `companies` - Organization data
- `user_profiles` - User data with `company_id` UUID and `role` VARCHAR
- `oauth_connections` - OAuth tokens
- `oauth_states` - OAuth CSRF protection  
- `team_invitations` - Pending invites

**Company ID location:** `user_profiles.company_id` (UUID, foreign key to `companies.id`)

**Team roles:** Stored in `user_profiles.role` as one of: `Mastermind`, `Coordinator`, `Planner`, `Assistant`, `Viewer`

### 3. CORS Support?
**✅ YES - REQUIRED** for browser calls

Add OPTIONS handler + CORS headers to all responses:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};
```

---

## 📂 Files Reference

1. **`/SUPABASE_IMPLEMENTATION_ANSWERS.md`** - Detailed answers to all your questions
2. **`/DATABASE_SCHEMA.sql`** - Complete SQL schema with RLS policies
3. **`/BACKEND_INTEGRATION_GUIDE.md`** - Full API specification with request/response examples

---

## 🔑 Required Environment Variables

Set these via `supabase secrets set`:

```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx
MICROSOFT_TENANT_ID=common
APP_BASE_URL=https://your-app-domain.com
```

---

## 🛣️ Endpoint Priority (Implement in this order)

### Phase 1: Critical (App won't work without these)
1. ✅ `GET /auth/profile` - Get user profile (called on every page load)
2. ✅ `POST /auth/signup` - User registration
3. ✅ `PUT /auth/profile` - Update profile

### Phase 2: Team Features
4. ✅ `GET /team/members` - List team members
5. ✅ `POST /team/invite` - Send invitation
6. ✅ `GET /team/invitations` - List pending invites
7. ✅ `PUT /team/member/{userId}/role` - Update role
8. ✅ `DELETE /team/member/{userId}` - Remove member
9. ✅ `DELETE /team/invitation/{invitationId}` - Cancel invite

### Phase 3: Google Calendar Integration
10. ✅ `GET /integrations/google-calendar/status` - Check connection
11. ✅ `POST /integrations/google-calendar/oauth/url` - Start OAuth flow
12. ✅ `POST /integrations/google-calendar/oauth/callback` - Complete OAuth
13. ✅ `GET /integrations/google-calendar/events` - Fetch calendar events

### Phase 4: Microsoft 365 (Similar to Google)
14. ✅ `GET /integrations/microsoft/status`
15. ✅ `POST /integrations/microsoft/oauth/url`
16. ✅ `POST /integrations/microsoft/oauth/callback`
17. ✅ `GET /integrations/microsoft/calendar/events`

---

## 🏗️ Edge Function Structure Template

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/make-server-6c8332a9', '');

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user from JWT
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let user = null;
    
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    }

    // Router
    if (path.startsWith('/auth/')) {
      return handleAuth(req, path, supabase, user);
    } else if (path.startsWith('/integrations/google-calendar/')) {
      return handleGoogleCalendar(req, path, supabase, user);
    } else if (path.startsWith('/integrations/microsoft/')) {
      return handleMicrosoft(req, path, supabase, user);
    } else if (path.startsWith('/team/')) {
      return handleTeam(req, path, supabase, user);
    } else if (path === '/upload-avatar') {
      return handleUploadAvatar(req, supabase, user);
    } else {
      return jsonResponse({ error: 'Not found' }, 404);
    }
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ==================== AUTH HANDLERS ====================
async function handleAuth(req: Request, path: string, supabase: any, user: any) {
  if (path === '/auth/profile' && req.method === 'GET') {
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Fetch user profile
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      profile: {
        name: data.name,
        role: data.role,
        companyId: data.company_id,
        avatarUrl: data.avatar_url,
      }
    });
  }

  if (path === '/auth/profile' && req.method === 'PUT') {
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();

    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        name: body.name,
        avatar_url: body.avatarUrl,
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ profile: data });
  }

  if (path === '/auth/signup' && req.method === 'POST') {
    const body = await req.json();
    const { email, password, name, companyName } = body;

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return jsonResponse({ error: authError.message }, 400);
    }

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyName || `${name}'s Company` })
      .select()
      .single();

    if (companyError) {
      return jsonResponse({ error: companyError.message }, 400);
    }

    // Create user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email,
        name,
        role: 'Mastermind',
        company_id: company.id,
      })
      .select()
      .single();

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    return jsonResponse({ user: authData.user, profile });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

// ==================== TEAM HANDLERS ====================
async function handleTeam(req: Request, path: string, supabase: any, user: any) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Get user's profile with company
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();

  if (!userProfile) {
    return jsonResponse({ error: 'Profile not found' }, 404);
  }

  if (path === '/team/members' && req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, name, role, created_at')
      .eq('company_id', userProfile.company_id);

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      members: data.map((m: any) => ({
        userId: m.id,
        email: m.email,
        name: m.name,
        role: m.role,
        createdAt: m.created_at,
      }))
    });
  }

  if (path === '/team/invitations' && req.method === 'GET') {
    // Only Mastermind and Coordinator can view
    if (!['Mastermind', 'Coordinator'].includes(userProfile.role)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const { data, error } = await supabase
      .from('team_invitations')
      .select(`
        *,
        invited_by_profile:user_profiles!invited_by(name)
      `)
      .eq('company_id', userProfile.company_id)
      .eq('status', 'pending');

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      invitations: data.map((inv: any) => ({
        id: inv.id,
        email: inv.email,
        name: inv.name,
        role: inv.role,
        status: inv.status,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at,
        invitedByName: inv.invited_by_profile?.name || 'Unknown',
      }))
    });
  }

  if (path === '/team/invite' && req.method === 'POST') {
    // Only Mastermind and Coordinator can invite
    if (!['Mastermind', 'Coordinator'].includes(userProfile.role)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const body = await req.json();
    const { email, name, role } = body;

    // Insert invitation
    const { data, error } = await supabase
      .from('team_invitations')
      .insert({
        company_id: userProfile.company_id,
        email,
        name,
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ invitation: data });
  }

  // Add more team handlers for update/delete...

  return jsonResponse({ error: 'Not found' }, 404);
}

// ==================== GOOGLE CALENDAR HANDLERS ====================
async function handleGoogleCalendar(req: Request, path: string, supabase: any, user: any) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (path === '/integrations/google-calendar/status' && req.method === 'GET') {
    const { data, error } = await supabase
      .from('oauth_connections')
      .select('provider_email, token_expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (error || !data) {
      return jsonResponse({ connected: false });
    }

    return jsonResponse({
      connected: true,
      email: data.provider_email,
      expiresAt: data.token_expires_at,
    });
  }

  if (path === '/integrations/google-calendar/oauth/url' && req.method === 'POST') {
    const body = await req.json();
    const { redirectUri } = body;

    // Generate state
    const state = crypto.randomUUID();

    // Store state
    await supabase.from('oauth_states').insert({
      state,
      user_id: user.id,
      provider: 'google',
      redirect_uri: redirectUri,
    });

    // Build OAuth URL
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    return jsonResponse({ authUrl });
  }

  // Add more Google Calendar handlers (callback, events fetch)...

  return jsonResponse({ error: 'Not found' }, 404);
}

// Add handleMicrosoft and handleUploadAvatar functions...
```

---

## ✅ Setup Steps

### 1. **Create Database Tables**
Run `/DATABASE_SCHEMA.sql` in Supabase SQL Editor

### 2. **Set Environment Variables**
```bash
supabase secrets set GOOGLE_CLIENT_ID=your-value
supabase secrets set GOOGLE_CLIENT_SECRET=your-value
# ... (see above for full list)
```

### 3. **Deploy Edge Function**
```bash
supabase functions deploy make-server-6c8332a9
```

### 4. **Test Endpoints**
Use the structure above to implement all endpoints from `/BACKEND_INTEGRATION_GUIDE.md`

---

## 🔒 Security Checklist

- ✅ Validate JWT token on protected endpoints
- ✅ Check user role for permission-based operations
- ✅ Validate OAuth state parameter
- ✅ Encrypt OAuth tokens (production)
- ✅ Rate limit sensitive endpoints
- ✅ Enable RLS policies (done in schema)

---

## 📞 Questions?

Refer to:
- `/BACKEND_INTEGRATION_GUIDE.md` for complete API specs
- `/SUPABASE_IMPLEMENTATION_ANSWERS.md` for detailed configuration
- `/DATABASE_SCHEMA.sql` for complete database structure

**The frontend is ready and waiting! Just implement these endpoints and everything will work. 🚀**

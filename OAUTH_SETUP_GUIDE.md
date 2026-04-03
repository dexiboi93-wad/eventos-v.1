# OAuth Integration Backend Setup Guide

## Overview
This guide explains how to create real OAuth endpoints in Supabase Edge Functions for all 7 integrations.

## Architecture

```
User clicks "Connect" 
  → Frontend calls /[service]/auth-url/{companyId}
  → Backend generates OAuth URL with state token
  → User redirected to provider's login page
  → Provider redirects back to /[service]/callback
  → Backend exchanges code for access token
  → Stores tokens in Supabase
  → Sends success message to frontend
```

## Prerequisites

### 1. Create OAuth Apps for Each Service

#### Google Calendar
1. Go to https://console.cloud.google.com
2. Create project → Enable Google Calendar API
3. Create OAuth 2.0 Client ID (Web application)
4. Add authorized redirect URI: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/google/callback`
5. Save Client ID and Client Secret

#### Microsoft Outlook
1. Go to https://portal.azure.com
2. Azure Active Directory → App registrations → New registration
3. Add redirect URI: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/outlook/callback`
4. Add Microsoft Graph permissions: `Calendars.ReadWrite`, `offline_access`
5. Create client secret in "Certificates & secrets"

#### Slack
1. Go to https://api.slack.com/apps → Create New App
2. Add redirect URI: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/slack/callback`
3. Add OAuth scopes: `channels:read`, `chat:write`, `users:read`
4. Install app to workspace

#### Zoom
1. Go to https://marketplace.zoom.us/develop/create
2. Create Server-to-Server OAuth app
3. Add redirect URI: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/zoom/callback`
4. Add scopes: `meeting:write`, `user:read`

#### QuickBooks
1. Go to https://developer.intuit.com/app/developer/myapps
2. Create new app → Get keys
3. Add redirect URI: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/quickbooks/callback`
4. Add scopes: `com.intuit.quickbooks.accounting`

### 2. Store Credentials in Supabase Secrets

```bash
# Set secrets for each integration
supabase secrets set GOOGLE_CLIENT_ID=your_client_id
supabase secrets set GOOGLE_CLIENT_SECRET=your_client_secret

supabase secrets set MICROSOFT_CLIENT_ID=your_client_id
supabase secrets set MICROSOFT_CLIENT_SECRET=your_client_secret
supabase secrets set MICROSOFT_TENANT_ID=common

supabase secrets set SLACK_CLIENT_ID=your_client_id
supabase secrets set SLACK_CLIENT_SECRET=your_client_secret

supabase secrets set ZOOM_CLIENT_ID=your_client_id
supabase secrets set ZOOM_CLIENT_SECRET=your_client_secret

supabase secrets set QUICKBOOKS_CLIENT_ID=your_client_id
supabase secrets set QUICKBOOKS_CLIENT_SECRET=your_client_secret
```

### 3. Create Database Tables

```sql
-- Table to store OAuth tokens per company
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id TEXT NOT NULL,
  service TEXT NOT NULL, -- 'google', 'outlook', 'slack', etc.
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  user_email TEXT,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, service)
);

-- Table to store OAuth state tokens (for CSRF protection)
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  service TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
);

-- Indexes
CREATE INDEX idx_oauth_tokens_company ON oauth_tokens(company_id);
CREATE INDEX idx_oauth_tokens_service ON oauth_tokens(service);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- Auto-delete expired states
CREATE OR REPLACE FUNCTION delete_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

## Edge Function Structure

Your Edge Function should have this structure:

```
supabase/functions/make-server-6c8332a9/
├── index.ts (main router)
├── google/
│   ├── auth-url.ts
│   ├── callback.ts
│   └── refresh.ts
├── outlook/
│   ├── auth-url.ts
│   ├── callback.ts
│   └── refresh.ts
├── slack/
│   ├── auth-url.ts
│   └── callback.ts
├── zoom/
│   ├── auth-url.ts
│   └── callback.ts
├── quickbooks/
│   ├── auth-url.ts
│   └── callback.ts
└── utils/
    ├── crypto.ts
    └── oauth.ts
```

## Implementation Steps

1. **Install Edge Function locally** (if not already done):
   ```bash
   supabase functions new make-server-6c8332a9
   ```

2. **Copy the provided code files** (see following sections)

3. **Deploy the function**:
   ```bash
   supabase functions deploy make-server-6c8332a9
   ```

4. **Test each OAuth flow** by clicking "Connect" in the frontend

## Code Examples

See the following files for complete implementation:
- `/oauth-backend/index.ts` - Main router
- `/oauth-backend/google-auth.ts` - Google Calendar OAuth
- `/oauth-backend/outlook-auth.ts` - Microsoft Outlook OAuth
- `/oauth-backend/slack-auth.ts` - Slack OAuth
- `/oauth-backend/zoom-auth.ts` - Zoom OAuth
- `/oauth-backend/quickbooks-auth.ts` - QuickBooks OAuth
- `/oauth-backend/utils.ts` - Shared utilities

## Security Best Practices

1. **Always use HTTPS** - OAuth requires secure connections
2. **Validate state tokens** - Prevents CSRF attacks
3. **Store tokens encrypted** - Use Supabase's built-in encryption
4. **Use short-lived access tokens** - Implement refresh token rotation
5. **Validate redirect URIs** - Only accept registered URIs
6. **Rate limit requests** - Prevent abuse
7. **Log all OAuth events** - For security auditing

## Testing

1. **Test OAuth flow**:
   - Click "Connect" in frontend
   - Should redirect to provider login
   - After login, should redirect back with success

2. **Test token refresh**:
   - Wait for token to expire
   - System should auto-refresh using refresh token

3. **Test error handling**:
   - Try with invalid credentials
   - Should show appropriate error message

## Troubleshooting

### "redirect_uri_mismatch" error
- Check that redirect URI in OAuth app matches exactly
- Must include https:// and full path

### "invalid_client" error
- Check Client ID and Secret are correct
- Ensure secrets are set in Supabase

### "access_denied" error
- User cancelled OAuth flow
- Or app doesn't have required permissions

### Tokens not persisting
- Check database table exists
- Verify Supabase connection string
- Check RLS policies allow insert/update

## Next Steps

After setting up OAuth:

1. **Implement calendar sync** - Fetch events from Google/Outlook
2. **Add webhook subscriptions** - Real-time event updates
3. **Implement token refresh** - Automatic token renewal
4. **Add error handling** - Graceful degradation
5. **Monitor usage** - Track API quotas and limits

# OAuth Backend Deployment Guide

## Quick Start (5 Steps)

### Step 1: Set Up Database

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `database-setup.sql`
4. Click "Run" to create all tables, indexes, and policies

### Step 2: Create OAuth Apps

#### Google Calendar
```
1. Visit: https://console.cloud.google.com
2. Create new project (or select existing)
3. Enable "Google Calendar API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: Web application
6. Add redirect URI: https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/google/callback
7. Copy Client ID and Client Secret
```

#### Microsoft Outlook
```
1. Visit: https://portal.azure.com
2. Azure Active Directory → App registrations → New registration
3. Add redirect URI: https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/outlook/callback
4. API permissions → Add Microsoft Graph: Calendars.ReadWrite, User.Read, offline_access
5. Certificates & secrets → New client secret
6. Copy Application (client) ID and Client secret value
```

### Step 3: Set Environment Secrets

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link your project (find project ref in dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set GOOGLE_CLIENT_ID="your_google_client_id"
supabase secrets set GOOGLE_CLIENT_SECRET="your_google_client_secret"
supabase secrets set MICROSOFT_CLIENT_ID="your_microsoft_client_id"
supabase secrets set MICROSOFT_CLIENT_SECRET="your_microsoft_client_secret"
supabase secrets set MICROSOFT_TENANT_ID="common"
```

### Step 4: Deploy Edge Function

```bash
# Create function directory
mkdir -p supabase/functions/make-server-6c8332a9

# Copy all .ts files to the directory
cp oauth-backend/*.ts supabase/functions/make-server-6c8332a9/

# Deploy
supabase functions deploy make-server-6c8332a9
```

### Step 5: Test the Integration

1. Open your app
2. Go to Settings → Integrations
3. Click "Connect" on Google Calendar or Microsoft Outlook
4. You should be redirected to the provider's login page
5. After login, you'll be redirected back with success message

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Problem:** The redirect URI doesn't match what's registered in OAuth app

**Solution:** 
1. Check the exact URL in your OAuth app settings
2. Make sure it matches: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/google/callback`
3. Must include `https://` and the full path
4. No trailing slash

### Error: "invalid_client"

**Problem:** Client ID or Secret is incorrect

**Solution:**
1. Verify secrets are set correctly: `supabase secrets list`
2. Check for copy/paste errors (extra spaces, quotes, etc.)
3. Regenerate secrets if needed

### Error: "insufficient_scope"

**Problem:** OAuth app doesn't have required permissions

**Solution:**
1. Google: Make sure Calendar API is enabled
2. Microsoft: Check Graph API permissions are added and admin consented
3. Re-authorize after adding new scopes

### Error: "Function not found"

**Problem:** Edge function isn't deployed or named incorrectly

**Solution:**
1. Check deployment: `supabase functions list`
2. Verify function name is exactly: `make-server-6c8332a9`
3. Redeploy if needed

### Error: "Database connection failed"

**Problem:** Edge function can't connect to database

**Solution:**
1. Check RLS policies are set up correctly
2. Verify service_role has access to tables
3. Check database-setup.sql was run completely

## Testing Checklist

- [ ] Database tables created successfully
- [ ] OAuth apps created and configured
- [ ] Secrets set in Supabase
- [ ] Edge function deployed
- [ ] Google Calendar OAuth flow works end-to-end
- [ ] Microsoft Outlook OAuth flow works end-to-end
- [ ] Tokens stored in database
- [ ] Token refresh works when expired
- [ ] State tokens cleaned up after use

## Monitoring

### Check Active Connections
```sql
SELECT * FROM oauth_connections_summary;
```

### Check Token Status
```sql
SELECT * FROM oauth_token_status;
```

### View Recent OAuth Activity
```sql
SELECT company_id, service, user_email, updated_at
FROM oauth_tokens
ORDER BY updated_at DESC
LIMIT 10;
```

### Check for Expired Tokens
```sql
SELECT company_id, service, user_email, expires_at
FROM oauth_tokens
WHERE expires_at < NOW()
ORDER BY expires_at DESC;
```

## Next Steps After Deployment

1. **Implement Calendar Sync**
   - Create endpoints to fetch calendar events
   - Set up webhooks for real-time updates
   - Add sync schedule (daily, hourly, etc.)

2. **Add More Integrations**
   - Copy google-auth.ts as template
   - Implement Slack, Zoom, QuickBooks following same pattern
   - Update index.ts router

3. **Add Error Handling**
   - Notify users when tokens expire
   - Auto-refresh tokens before expiry
   - Graceful degradation when API is down

4. **Add Usage Tracking**
   - Log API calls to stay within quotas
   - Monitor rate limits
   - Alert on quota approaching

5. **Security Enhancements**
   - Encrypt tokens at rest
   - Add token rotation
   - Implement IP whitelisting
   - Add audit logging

## Production Checklist

Before going live:

- [ ] All secrets stored securely (not in code)
- [ ] RLS policies tested and working
- [ ] Error handling for all edge cases
- [ ] Logging configured for debugging
- [ ] Rate limiting implemented
- [ ] Monitoring and alerts set up
- [ ] Documentation updated
- [ ] OAuth apps in production mode (not test)
- [ ] Token refresh automation working
- [ ] Backup and recovery plan in place

# OAuth Backend - Quick Start Guide

## 🚀 5-Minute Setup

### 1️⃣ Database Setup (1 minute)
```sql
-- Copy and run database-setup.sql in Supabase SQL Editor
-- This creates oauth_tokens and oauth_states tables
```

### 2️⃣ Create Google OAuth App (2 minutes)
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: **Web application**
4. Add redirect URI: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/google/callback`
5. Copy **Client ID** and **Client Secret**

### 3️⃣ Set Secrets (1 minute)
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GOOGLE_CLIENT_ID="paste_your_client_id"
supabase secrets set GOOGLE_CLIENT_SECRET="paste_your_client_secret"
```

### 4️⃣ Deploy Function (1 minute)
```bash
# Create directory
mkdir -p supabase/functions/make-server-6c8332a9

# Copy files
cp oauth-backend/index.ts supabase/functions/make-server-6c8332a9/
cp oauth-backend/utils.ts supabase/functions/make-server-6c8332a9/
cp oauth-backend/google-auth.ts supabase/functions/make-server-6c8332a9/
cp oauth-backend/outlook-auth.ts supabase/functions/make-server-6c8332a9/

# Deploy
supabase functions deploy make-server-6c8332a9
```

### 5️⃣ Test It!
1. Open your app
2. Go to Settings → Integrations
3. Click "Connect" on Google Calendar
4. ✅ You should see Google's login page!

---

## 📋 What You Get

### Working OAuth Flows
- ✅ **Google Calendar** - Full OAuth with token refresh
- ✅ **Microsoft Outlook** - Full OAuth with token refresh
- 🚧 **Slack** - Template ready (needs credentials)
- 🚧 **Zoom** - Template ready (needs credentials)
- 🚧 **QuickBooks** - Template ready (needs credentials)

### Security Features
- ✅ CSRF protection with state tokens
- ✅ Secure token storage in database
- ✅ Automatic token refresh
- ✅ Row Level Security (RLS) policies
- ✅ Environment-based secrets

### API Endpoints

**Google Calendar:**
```
GET  /google/auth-url/:companyId    - Get OAuth URL
GET  /google/callback               - OAuth callback
GET  /google/status/:companyId      - Check connection status
POST /google/refresh/:companyId     - Refresh access token
```

**Microsoft Outlook:**
```
GET  /outlook/auth-url/:companyId   - Get OAuth URL
GET  /outlook/callback              - OAuth callback
GET  /outlook/status/:companyId     - Check connection status
```

---

## 🔧 File Structure

```
supabase/functions/make-server-6c8332a9/
├── index.ts              ← Main router (handles all requests)
├── utils.ts              ← Shared utilities (state, tokens, etc.)
├── google-auth.ts        ← Google Calendar OAuth
├── outlook-auth.ts       ← Microsoft Outlook OAuth
└── (add more as needed)
```

---

## 🎯 Next Steps

### Add More Integrations

To add Slack, Zoom, or QuickBooks:

1. **Create OAuth app** for the service
2. **Set secrets**:
   ```bash
   supabase secrets set SLACK_CLIENT_ID="..."
   supabase secrets set SLACK_CLIENT_SECRET="..."
   ```
3. **Copy template** from `slack-zoom-quickbooks.ts`
4. **Update router** in `index.ts`:
   ```typescript
   import { handleSlackAuthUrl, handleSlackCallback } from './slack-auth.ts';
   
   // Add routes
   if (path.match(/^\/slack\/auth-url\/(.+)$/)) {
     const companyId = path.split('/')[3];
     return await handleSlackAuthUrl(req, companyId);
   }
   ```
5. **Redeploy**: `supabase functions deploy make-server-6c8332a9`

### Implement Calendar Sync

```typescript
// Example: Fetch Google Calendar events
export async function fetchGoogleEvents(companyId: string) {
  const supabase = getSupabaseClient();
  const token = await getValidGoogleToken(supabase, companyId);
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  
  return await response.json();
}
```

### Set Up Webhooks

For real-time calendar updates, set up webhooks:

**Google Calendar:**
```typescript
// Subscribe to calendar changes
const response = await fetch(
  'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: `channel-${companyId}`,
      type: 'web_hook',
      address: `${SUPABASE_URL}/functions/v1/make-server-6c8332a9/google/webhook`,
    }),
  }
);
```

---

## 🐛 Common Issues

### "Not Found" Error
- Check function name is exactly: `make-server-6c8332a9`
- Verify it's deployed: `supabase functions list`

### "redirect_uri_mismatch"
- Redirect URI must EXACTLY match OAuth app settings
- Include `https://` and full path
- No trailing slash

### "invalid_client"
- Check secrets: `supabase secrets list`
- Look for typos or extra spaces
- Try regenerating secrets

### OAuth popup blocked
- Tell users to allow popups for your domain
- Or open OAuth in same tab (change frontend code)

---

## 📚 Documentation Links

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Microsoft Identity Platform](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Slack OAuth](https://api.slack.com/authentication/oauth-v2)
- [Zoom OAuth](https://marketplace.zoom.us/docs/guides/auth/oauth)
- [QuickBooks OAuth](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization)

---

## ✅ Deployment Checklist

Before going live:

- [ ] Database tables created
- [ ] OAuth apps created for all integrations
- [ ] Secrets set in Supabase
- [ ] Edge function deployed successfully
- [ ] Tested OAuth flow end-to-end
- [ ] Tokens stored in database
- [ ] Token refresh working
- [ ] Error handling tested
- [ ] Monitoring set up

---

## 💬 Support

If you run into issues:

1. Check the **DEPLOYMENT.md** troubleshooting section
2. Review Supabase function logs: `supabase functions logs make-server-6c8332a9`
3. Check database for errors: `SELECT * FROM oauth_tokens;`
4. Verify secrets are set: `supabase secrets list`

Good luck! 🎉

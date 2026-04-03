# 🔐 OAuth Redirect Flow - Complete Frontend Setup

## ✅ Frontend is 100% Ready for OAuth Redirects

Your frontend is now fully configured to handle OAuth redirects from both Google and Microsoft for **authentication** and **calendar/email integrations**.

---

## 🎯 Two Types of OAuth Flows

### 1️⃣ **Authentication OAuth** (Sign In with Google/Microsoft)
**Purpose:** Users sign in to your app using their Google or Microsoft account

**Flow:**
```
User clicks "Sign In with Google/Microsoft" on /login
    ↓
Supabase redirects to Google/Microsoft OAuth consent screen
    ↓
User approves and gets redirected to: your-app.com/
    ↓
AuthContext.tsx automatically detects session via URL hash
    ↓
User is signed in! ✅
```

**Configuration:**
- ✅ **Login.tsx** has OAuth buttons
- ✅ **AuthContext.tsx** has `detectSessionInUrl: true`
- ✅ **AuthContext.tsx** has `onAuthStateChange` listener
- ✅ Error handling via URL params on `/login`

---

### 2️⃣ **Integration OAuth** (Connect Google Calendar/Microsoft 365)
**Purpose:** Already-signed-in users connect their calendar/email for syncing

**Flow:**
```
Authenticated user clicks "Connect Google Calendar" in settings
    ↓
Backend generates OAuth URL with state parameter
    ↓
User approves on Google/Microsoft
    ↓
Redirected to: your-app.com/oauth/callback/google (or /microsoft)
    ↓
OAuthCallback.tsx exchanges code for tokens via backend
    ↓
Tokens stored in database
    ↓
User redirected to dashboard ✅
```

**Configuration:**
- ✅ **OAuthCallback.tsx** handles `/oauth/callback/:provider` routes
- ✅ Crown spinner with Mastermind aesthetic
- ✅ Success/error states with auto-redirect
- ✅ Validates user is authenticated before processing

---

## 📂 File Changes Summary

### ✅ `/src/app/pages/Login.tsx`
**Added:**
- Google OAuth button with official logo
- Microsoft OAuth button with official logo
- `handleOAuthSignIn()` function
- OAuth error handling from URL params
- `useSearchParams` to detect OAuth errors
- Loading states for OAuth buttons
- Enterprise integration only shows on signup tab

### ✅ `/utils/supabase/client.tsx`
**Created:**
- Supabase client singleton
- Exports `supabase` for OAuth calls

### ✅ `/src/app/pages/OAuthCallback.tsx`
**Updated:**
- Mastermind aesthetic (charcoal/emerald/amber)
- Crown spinner animation
- Better error messages
- Validates user authentication
- Proper redirect handling

### ✅ `/src/app/context/AuthContext.tsx`
**Already configured:**
- `detectSessionInUrl: true` - Auto-detects OAuth session
- `onAuthStateChange` - Listens for auth events
- `flowType: 'pkce'` - Secure OAuth flow
- Custom storage adapter

### ✅ `/src/app/routes.tsx`
**Already configured:**
- `/oauth/callback` route
- `/oauth/callback/:provider` route
- Both lazy-loaded with error boundaries

---

## 🔧 Backend Configuration Needed

### In Supabase Dashboard:

**1. Enable OAuth Providers:**
   - Go to: **Authentication → Providers**
   - **Enable Google:**
     - Get credentials from: [Google Cloud Console](https://console.cloud.google.com)
     - Add Client ID and Client Secret
     - Authorized redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   
   - **Enable Azure (Microsoft):**
     - Get credentials from: [Azure Portal](https://portal.azure.com)
     - Add Application (client) ID and Client Secret
     - Redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`

**2. Configure Redirect URLs:**
   - Go to: **Authentication → URL Configuration**
   - Add your site URL: `https://your-app-domain.com`
   - Add redirect URLs:
     - `https://your-app-domain.com/`
     - `https://your-app-domain.com/oauth/callback/google`
     - `https://your-app-domain.com/oauth/callback/microsoft`

---

## 🚀 OAuth Flow Details

### Authentication OAuth (Sign In)

**When user clicks "Sign In with Google":**

```typescript
// Login.tsx
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/`,
  },
});
```

**What happens:**
1. Supabase redirects to Google OAuth
2. User approves
3. Google redirects to: `https://your-app.com/#access_token=xxx&refresh_token=yyy`
4. AuthContext detects session in URL hash
5. `onAuthStateChange` fires
6. User profile loaded
7. User is signed in!

**Error handling:**
- Errors redirect to `/login?error=xxx&error_description=yyy`
- Login.tsx shows error toast
- URL cleaned up automatically

---

### Integration OAuth (Calendar Sync)

**When authenticated user connects calendar:**

**Step 1:** Frontend requests OAuth URL
```typescript
const res = await fetch(`${API_BASE}/integrations/google/oauth/url`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({
    redirectUri: `${window.location.origin}/oauth/callback/google`,
  }),
});
const { authUrl } = await res.json();
window.location.href = authUrl;
```

**Step 2:** Google redirects back
```
https://your-app.com/oauth/callback/google?code=xxx&state=yyy
```

**Step 3:** OAuthCallback.tsx exchanges code
```typescript
const res = await fetch(`${API_BASE}/integrations/google/oauth/callback`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ code, state, redirectUri }),
});
```

**Step 4:** Backend stores tokens, frontend redirects to dashboard

---

## 🎨 UI/UX Flow

### Sign In with Google/Microsoft:
1. User on `/login` page
2. Sees beautiful OAuth buttons below form
3. Clicks "Google" or "Microsoft"
4. Loading spinner appears
5. Redirected to provider
6. Returns to app, automatically signed in
7. Redirected to dashboard

### Connect Calendar/Email:
1. User on `/` dashboard (authenticated)
2. Goes to integrations/settings
3. Clicks "Connect Google Calendar"
4. Popup or redirect to OAuth
5. Returns to `/oauth/callback/google`
6. Sees crown spinner with "Connecting..."
7. Success message: "Successfully connected to Google Calendar!"
8. Auto-redirect to dashboard after 2 seconds

---

## 🛡️ Security Features

### ✅ Implemented:
- **State parameter** for CSRF protection (integration OAuth)
- **PKCE flow** for authentication OAuth
- **Token validation** on callback
- **User authentication check** before processing integrations
- **Error handling** with user-friendly messages
- **Automatic cleanup** of URL parameters
- **Redirect validation** to prevent open redirects

### ✅ Best Practices:
- Tokens never exposed in frontend code
- All token exchange happens on backend
- AccessToken required for integration callbacks
- Session detection via Supabase SDK
- Proper error states and fallbacks

---

## 📋 Testing Checklist

### Authentication OAuth:
- [ ] Click "Sign In with Google" on `/login`
- [ ] Redirected to Google consent screen
- [ ] Approve and return to app
- [ ] Check: User is signed in
- [ ] Check: User profile loaded
- [ ] Check: Redirected to dashboard

### Integration OAuth:
- [ ] Sign in first (required)
- [ ] Navigate to calendar settings
- [ ] Click "Connect Google Calendar"
- [ ] Redirected to Google consent
- [ ] Approve and return to `/oauth/callback/google`
- [ ] Check: Crown spinner appears
- [ ] Check: Success message shows
- [ ] Check: Redirected to dashboard after 2s
- [ ] Check: Calendar events sync

### Error Cases:
- [ ] User denies OAuth consent
- [ ] Check: Error message on `/login`
- [ ] Invalid state parameter
- [ ] Check: Error shown in OAuthCallback
- [ ] Network error
- [ ] Check: Error message with retry button

---

## 🎯 Next Steps

1. **Configure Supabase Dashboard:**
   - Enable Google OAuth provider
   - Enable Azure OAuth provider
   - Add redirect URLs

2. **Test Authentication Flow:**
   - Try signing in with Google
   - Try signing in with Microsoft
   - Verify error handling

3. **Test Integration Flow:**
   - Sign in with email/password
   - Connect Google Calendar
   - Connect Microsoft 365
   - Verify calendar sync works

4. **Production Checklist:**
   - [ ] OAuth credentials secured in environment variables
   - [ ] Production URLs configured in Supabase
   - [ ] HTTPS enabled (required for OAuth)
   - [ ] Error monitoring setup
   - [ ] Token refresh logic tested

---

## 🚨 Common Issues & Solutions

### Issue: OAuth redirect loops
**Solution:** Check `redirectTo` matches Supabase dashboard URLs

### Issue: "Invalid redirect URI" error
**Solution:** Add exact redirect URI to Google/Azure console

### Issue: User not authenticated after OAuth
**Solution:** Verify `detectSessionInUrl: true` in AuthContext

### Issue: Integration callback fails
**Solution:** Check user is signed in before redirecting to OAuth

### Issue: State parameter mismatch
**Solution:** Backend should store state in database with expiry

---

## ✅ Summary

**Your frontend is production-ready for OAuth!**

- ✅ Beautiful Google/Microsoft buttons on login page
- ✅ Automatic session detection on redirect
- ✅ Separate flows for auth vs integrations
- ✅ Mastermind-styled callback page
- ✅ Comprehensive error handling
- ✅ Enterprise integration visible only on signup tab
- ✅ Loading states and user feedback
- ✅ Security best practices implemented

**All you need now:** Configure OAuth providers in Supabase Dashboard! 🎉

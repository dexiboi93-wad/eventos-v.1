# OAuth Integration Architecture

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OAUTH AUTHENTICATION FLOW                        │
└─────────────────────────────────────────────────────────────────────────┘

1️⃣ USER INITIATES CONNECTION
   
   Frontend (React)                Edge Function              Database
   ────────────                    ─────────────              ────────
   
   User clicks "Connect"
        │
        │ GET /google/auth-url/company123
        ├──────────────────────────►
        │                           Generate state token
        │                           │
        │                           │ INSERT state token
        │                           ├─────────────────────►
        │                           │                      Store in
        │                           │◄─────────────────────oauth_states
        │                           │
        │                           Build OAuth URL:
        │                           - client_id
        │                           - redirect_uri
        │                           - scope
        │                           - state (CSRF protection)
        │                           │
        │◄──────────────────────────┤
        │ { authUrl: "https://..." }
        │
        │ window.open(authUrl)
        └────────────────────►


2️⃣ USER AUTHENTICATES WITH PROVIDER

   Browser                    Google/Microsoft/etc
   ───────                    ────────────────────
   
   Opens OAuth popup
        │
        │ Redirects to provider
        ├────────────────────────────►
        │                             Show login page
        │                             │
        │                             User enters credentials
        │                             │
        │                             User grants permissions
        │                             │
        │◄────────────────────────────┤
        │ Redirect to callback URL
        │ with ?code=xxx&state=xxx


3️⃣ CALLBACK & TOKEN EXCHANGE

   Browser                    Edge Function              Google API         Database
   ───────                    ─────────────              ──────────         ────────
   
   GET /google/callback
   ?code=AUTH_CODE
   &state=STATE_TOKEN
        │
        ├──────────────────────►
        │                       Validate state token
        │                       │
        │                       │ SELECT state
        │                       ├───────────────────────────────────►
        │                       │                                    Verify state
        │                       │◄───────────────────────────────────exists &
        │                       │                                    not expired
        │                       │
        │                       │ DELETE used state
        │                       ├───────────────────────────────────►
        │                       │
        │                       Exchange code for token
        │                       │
        │                       │ POST /oauth2/token
        │                       ├──────────────────────►
        │                       │                       Validate code
        │                       │                       │
        │                       │◄──────────────────────┤
        │                       │ {                     Return tokens
        │                       │   access_token: ...,
        │                       │   refresh_token: ...,
        │                       │   expires_in: 3600
        │                       │ }
        │                       │
        │                       Get user info
        │                       │
        │                       │ GET /userinfo
        │                       ├──────────────────────►
        │                       │◄──────────────────────┤
        │                       │ { email: "..." }
        │                       │
        │                       Store tokens
        │                       │
        │                       │ UPSERT tokens
        │                       ├───────────────────────────────────►
        │                       │                                    Store in
        │                       │                                    oauth_tokens
        │                       │
        │                       Return HTML with
        │                       postMessage script
        │◄──────────────────────┤
        │ <script>
        │   window.opener.postMessage({
        │     type: 'google-auth-success',
        │     email: 'user@gmail.com'
        │   });
        │   window.close();
        │ </script>


4️⃣ FRONTEND RECEIVES SUCCESS

   Frontend (React)           Popup Window
   ────────────                ────────────
   
   Listening for message
        │
        │◄──────────────────────┤
        │ postMessage event     window.close()
        │ {
        │   type: 'google-auth-success',
        │   email: 'user@gmail.com'
        │ }
        │
        │ Update UI:
        │ - Show "Connected"
        │ - Display email
        │ - Enable sync features
        │
        │ Call loadConfigurations()
        │ to refresh status


5️⃣ USING THE TOKEN (Later)

   Edge Function              Database              Google API
   ─────────────              ────────              ──────────
   
   Need to sync calendar
        │
        │ Get token for company
        ├───────────────────────►
        │                        SELECT * FROM oauth_tokens
        │                        WHERE company_id = 'company123'
        │                        AND service = 'google'
        │◄───────────────────────┤
        │ {
        │   access_token: "...",
        │   expires_at: "2024-01-01 15:00:00"
        │ }
        │
        │ Check if expired
        │ if (expires_at < now) {
        │   Use refresh_token to get new access_token
        │   Update database
        │ }
        │
        │ Make API call
        ├────────────────────────────────────►
        │                                     GET /calendar/events
        │                                     Authorization: Bearer TOKEN
        │◄────────────────────────────────────┤
        │ { events: [...] }
        │
        │ Return events to frontend
```

## Database Schema

```
┌─────────────────────────────────────────────────┐
│               oauth_tokens                      │
├─────────────────────────────────────────────────┤
│ id              UUID PRIMARY KEY                │
│ company_id      TEXT NOT NULL                   │
│ service         TEXT NOT NULL                   │ ← 'google', 'outlook', etc.
│ access_token    TEXT NOT NULL                   │ ← Used for API calls
│ refresh_token   TEXT                            │ ← Used to get new access_token
│ expires_at      TIMESTAMPTZ                     │ ← When access_token expires
│ user_email      TEXT                            │ ← Display in UI
│ scope           TEXT                            │ ← Permissions granted
│ metadata        JSONB                           │ ← Service-specific data
│ created_at      TIMESTAMPTZ                     │
│ updated_at      TIMESTAMPTZ                     │
│                                                 │
│ UNIQUE(company_id, service)                     │ ← One token per service
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│               oauth_states                      │
├─────────────────────────────────────────────────┤
│ state           TEXT PRIMARY KEY                │ ← Random CSRF token
│ company_id      TEXT NOT NULL                   │
│ service         TEXT NOT NULL                   │
│ created_at      TIMESTAMPTZ                     │
│ expires_at      TIMESTAMPTZ                     │ ← Auto-delete after 10min
└─────────────────────────────────────────────────┘
```

## Security Layers

```
┌──────────────────────────────────────────────────────────┐
│                    SECURITY FEATURES                     │
└──────────────────────────────────────────────────────────┘

1. HTTPS Only
   ├─ All OAuth traffic encrypted in transit
   └─ Required by OAuth 2.0 spec

2. CSRF Protection (State Token)
   ├─ Random state token generated
   ├─ Stored in database before redirect
   ├─ Validated on callback
   ├─ Deleted after one-time use
   └─ Expires in 10 minutes

3. Token Storage
   ├─ Tokens stored in Supabase database
   ├─ Not exposed to frontend
   ├─ Row Level Security (RLS) enabled
   └─ Service role access only

4. Environment Secrets
   ├─ Client ID/Secret in Supabase secrets
   ├─ Never in code or frontend
   └─ Injected at runtime

5. Redirect URI Validation
   ├─ Exact match required
   ├─ Registered in OAuth app
   └─ Can't be spoofed

6. Token Refresh
   ├─ Access tokens short-lived (1 hour)
   ├─ Refresh tokens long-lived (months)
   ├─ Auto-refresh before expiry
   └─ Minimizes exposure window

7. Scope Limitation
   ├─ Request only needed permissions
   ├─ Users see what access is granted
   └─ Can be revoked by user anytime
```

## Token Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    TOKEN LIFECYCLE                      │
└─────────────────────────────────────────────────────────┘

Initial OAuth:
   ┌────────────┐
   │   User     │
   │ authorizes │
   └──────┬─────┘
          │
          ▼
   ┌────────────────────┐
   │  Get access_token  │ ← Valid for 1 hour
   │ Get refresh_token  │ ← Valid for 6 months
   └─────────┬──────────┘
             │
             │ Store in database
             ▼
   ┌────────────────────┐
   │  oauth_tokens      │
   │  - access_token    │
   │  - refresh_token   │
   │  - expires_at      │
   └─────────┬──────────┘
             │
             ▼

API Call Flow:
   ┌────────────────────┐
   │  Need to call API  │
   └─────────┬──────────┘
             │
             ▼
   ┌────────────────────┐
   │ Get token from DB  │
   └─────────┬──────────┘
             │
             ▼
        Is expired?
        ┌───┴───┐
       Yes     No
        │       │
        │       └──────────────┐
        │                      │
        ▼                      ▼
   ┌────────────────┐    ┌──────────────┐
   │ Use refresh_   │    │ Use access_  │
   │ token to get   │    │ token        │
   │ new access_    │    └──────┬───────┘
   │ token          │           │
   └────────┬───────┘           │
            │                   │
            │ Update DB         │
            │                   │
            └───────┬───────────┘
                    │
                    ▼
            ┌───────────────┐
            │  Make API call│
            │  with token   │
            └───────────────┘

Token Expiry:
   Refresh token expired?
        ├─ Yes: User must re-authorize
        └─ No: Can auto-refresh access token
```

## Multi-Tenant Architecture

```
┌──────────────────────────────────────────────────────┐
│              MULTI-TENANT ISOLATION                  │
└──────────────────────────────────────────────────────┘

Company A                Company B                Company C
─────────                ─────────                ─────────

oauth_tokens:            oauth_tokens:            oauth_tokens:
├─ company_id: A         ├─ company_id: B         ├─ company_id: C
├─ service: google       ├─ service: google       ├─ service: google
├─ access_token: AAA     ├─ access_token: BBB     ├─ access_token: CCC
└─ user: a@gmail.com     └─ user: b@gmail.com     └─ user: c@gmail.com

Each company has:
✓ Separate OAuth tokens
✓ Own calendar access
✓ Isolated data
✓ Independent authentication
✓ No cross-company access

RLS Policy:
WHERE company_id = current_user_company_id()
```

## Error Handling

```
┌──────────────────────────────────────────────────────┐
│                   ERROR SCENARIOS                    │
└──────────────────────────────────────────────────────┘

User Cancellation:
   User clicks "Cancel" on OAuth page
   ├─ URL: ?error=access_denied
   ├─ Show friendly message
   └─ Close popup without saving

Invalid State:
   State token doesn't match or expired
   ├─ Possible CSRF attack
   ├─ Return 400 Bad Request
   └─ Log security event

Token Expired:
   Access token no longer valid
   ├─ Check expires_at timestamp
   ├─ Use refresh_token automatically
   └─ If refresh fails, prompt re-auth

Missing Credentials:
   Client ID/Secret not configured
   ├─ Return 500 error
   ├─ Show admin setup message
   └─ Link to documentation

API Rate Limit:
   Too many requests to provider
   ├─ Respect retry-after header
   ├─ Queue requests
   └─ Show "Please try again" message

Network Failure:
   Can't reach OAuth provider
   ├─ Retry with exponential backoff
   ├─ Cache tokens when possible
   └─ Graceful degradation
```

## Monitoring & Observability

```
┌──────────────────────────────────────────────────────┐
│                  MONITORING POINTS                   │
└──────────────────────────────────────────────────────┘

Metrics to Track:
├─ OAuth success rate
├─ Token refresh success rate
├─ API call latency
├─ Error rate by type
├─ Active connections per service
└─ Token expiry warnings

Logs to Keep:
├─ OAuth initiated (company_id, service)
├─ OAuth completed (success/failure)
├─ Token refreshed
├─ API errors
└─ Security events (invalid state)

Queries:
┌────────────────────────────────────────────┐
│ -- Active connections by service          │
│ SELECT service, COUNT(*)                  │
│ FROM oauth_tokens                         │
│ GROUP BY service;                         │
├────────────────────────────────────────────┤
│ -- Tokens expiring soon                   │
│ SELECT company_id, service, expires_at    │
│ FROM oauth_tokens                         │
│ WHERE expires_at < NOW() + INTERVAL '1d'; │
├────────────────────────────────────────────┤
│ -- Failed auth attempts (orphaned states) │
│ SELECT company_id, service, created_at    │
│ FROM oauth_states                         │
│ WHERE created_at < NOW() - INTERVAL '1h'; │
└────────────────────────────────────────────┘
```

This architecture provides a secure, scalable, multi-tenant OAuth solution that handles all edge cases and follows industry best practices!

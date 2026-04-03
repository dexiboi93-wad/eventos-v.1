# Backend Integration Guide for Event Orchestrator

This document outlines all the backend API endpoints that need to be implemented in your Supabase Edge Functions for the Event Orchestrator to function with real-time integrations.

## Base URL
All endpoints are prefixed with:
```
https://{projectId}.supabase.co/functions/v1/make-server-6c8332a9
```

---

## 🔐 Authentication
All authenticated endpoints require the `Authorization: Bearer {accessToken}` header with a valid Supabase session token.

---

## 📅 Google Calendar Integration

### 1. Check Connection Status
**Endpoint:** `GET /integrations/google-calendar/status`

**Purpose:** Check if the current user has connected their Google Calendar

**Headers:**
- `Authorization: Bearer {accessToken}`

**Response:**
```json
{
  "connected": true,
  "email": "user@example.com",
  "expiresAt": "2026-04-15T10:30:00Z"
}
```

---

### 2. Initiate OAuth Flow
**Endpoint:** `POST /integrations/google-calendar/oauth/url`

**Purpose:** Generate Google OAuth authorization URL

**Headers:**
- `Authorization: Bearer {accessToken}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "redirectUri": "https://your-app.com/oauth/callback/google"
}
```

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=...&state=..."
}
```

**Implementation Notes:**
- Generate a secure random `state` parameter and store it in the session/database
- Request these scopes: `https://www.googleapis.com/auth/calendar.readonly`
- Store the state parameter temporarily (expires in 10 minutes)

---

### 3. OAuth Callback Handler
**Endpoint:** `POST /integrations/google-calendar/oauth/callback`

**Purpose:** Exchange authorization code for access/refresh tokens

**Headers:**
- `Authorization: Bearer {accessToken}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "code": "4/0AY0e-g7...",
  "state": "random-state-string",
  "redirectUri": "https://your-app.com/oauth/callback/google"
}
```

**Response:**
```json
{
  "success": true,
  "connection": {
    "provider": "google",
    "email": "user@example.com",
    "connectedAt": "2026-03-27T10:00:00Z"
  }
}
```

**Implementation Notes:**
- Verify the state parameter matches what was generated
- Exchange code for tokens using Google OAuth token endpoint
- Store refresh token securely in database (encrypted)
- Store access token with expiry time
- Link tokens to the authenticated user

---

### 4. Fetch Calendar Events
**Endpoint:** `GET /integrations/google-calendar/events`

**Purpose:** Fetch upcoming events from user's Google Calendar

**Headers:**
- `Authorization: Bearer {accessToken}`

**Query Parameters:**
- `timeMin` (optional): RFC3339 timestamp, default to current time
- `timeMax` (optional): RFC3339 timestamp, default to 6 months ahead
- `maxResults` (optional): number, default 50

**Response:**
```json
{
  "events": [
    {
      "id": "event-id-123",
      "summary": "Client Meeting",
      "description": "Discuss event details",
      "start": {
        "dateTime": "2026-06-15T14:00:00-07:00",
        "timeZone": "America/Los_Angeles"
      },
      "end": {
        "dateTime": "2026-06-15T15:00:00-07:00",
        "timeZone": "America/Los_Angeles"
      },
      "location": "123 Main St, City",
      "attendees": [
        {
          "email": "client@example.com",
          "displayName": "John Client"
        }
      ],
      "creator": {
        "email": "planner@company.com",
        "displayName": "Event Planner"
      }
    }
  ]
}
```

**Implementation Notes:**
- Check if access token is expired, refresh if needed
- Call Google Calendar API v3: `GET https://www.googleapis.com/calendar/v3/calendars/primary/events`
- Handle token refresh automatically
- Return 401 if refresh token is invalid/expired

---

## 🏢 Microsoft 365 Integration

### 1. Check Connection Status
**Endpoint:** `GET /integrations/microsoft/status`

**Purpose:** Check if the current user has connected their Microsoft 365 account

**Headers:**
- `Authorization: Bearer {accessToken}`

**Response:** (Same as Google Calendar status)

---

### 2. Initiate OAuth Flow
**Endpoint:** `POST /integrations/microsoft/oauth/url`

**Purpose:** Generate Microsoft OAuth authorization URL

**Implementation:** Similar to Google, but use Microsoft identity platform
- Authority: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
- Scopes: `Calendars.Read`, `User.Read`

---

### 3. OAuth Callback Handler
**Endpoint:** `POST /integrations/microsoft/oauth/callback`

**Purpose:** Exchange authorization code for access/refresh tokens

**Implementation:** Similar to Google, but use Microsoft token endpoint

---

### 4. Fetch Calendar Events
**Endpoint:** `GET /integrations/microsoft/calendar/events`

**Purpose:** Fetch upcoming events from user's Microsoft 365 Calendar

**Implementation:** Use Microsoft Graph API
- Endpoint: `GET https://graph.microsoft.com/v1.0/me/calendar/events`

---

## 👥 Team Management

### 1. Get Team Members
**Endpoint:** `GET /team/members`

**Headers:**
- `Authorization: Bearer {accessToken}`

**Response:**
```json
{
  "members": [
    {
      "userId": "user-uuid",
      "email": "member@company.com",
      "name": "John Doe",
      "role": "Coordinator",
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

### 2. Get Pending Invitations
**Endpoint:** `GET /team/invitations`

**Headers:**
- `Authorization: Bearer {accessToken}`

**Response:**
```json
{
  "invitations": [
    {
      "id": "invite-uuid",
      "email": "newmember@company.com",
      "name": "Jane Smith",
      "role": "Planner",
      "status": "pending",
      "createdAt": "2026-03-20T10:00:00Z",
      "expiresAt": "2026-03-27T10:00:00Z",
      "invitedByName": "John Doe"
    }
  ]
}
```

---

### 3. Send Invitation
**Endpoint:** `POST /team/invite`

**Headers:**
- `Authorization: Bearer {accessToken}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "email": "newmember@company.com",
  "name": "Jane Smith",
  "role": "Planner"
}
```

**Response:**
```json
{
  "invitation": {
    "id": "invite-uuid",
    "email": "newmember@company.com",
    "expiresAt": "2026-04-03T10:00:00Z"
  }
}
```

---

### 4. Update Member Role
**Endpoint:** `PUT /team/member/{userId}/role`

**Headers:**
- `Authorization: Bearer {accessToken}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "role": "Coordinator"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "user-uuid",
  "newRole": "Coordinator"
}
```

---

### 5. Remove Team Member
**Endpoint:** `DELETE /team/member/{userId}`

**Headers:**
- `Authorization: Bearer {accessToken}`

**Response:**
```json
{
  "success": true,
  "message": "Team member removed successfully"
}
```

---

### 6. Cancel Invitation
**Endpoint:** `DELETE /team/invitation/{invitationId}`

**Headers:**
- `Authorization: Bearer {accessToken}`

**Response:**
```json
{
  "success": true,
  "message": "Invitation cancelled successfully"
}
```

---

## 🔧 Google Cloud Console Setup

### Steps to Enable Google Calendar API:

1. **Create Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing

2. **Enable APIs:**
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

3. **Create OAuth Credentials:**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Add authorized redirect URIs:
     - `https://your-domain.com/oauth/callback/google`
     - `http://localhost:3000/oauth/callback/google` (for development)

4. **Configure OAuth Consent Screen:**
   - Go to "OAuth consent screen"
   - User type: External (or Internal for Google Workspace)
   - Add scopes: `https://www.googleapis.com/auth/calendar.readonly`

5. **Get Credentials:**
   - Save your Client ID and Client Secret
   - Store these securely in your backend environment variables

---

## 🔧 Microsoft Azure AD Setup

### Steps to Enable Microsoft Graph API:

1. **Register Application:**
   - Go to [Azure Portal](https://portal.azure.com/)
   - Navigate to "Azure Active Directory" > "App registrations"
   - Click "New registration"

2. **Configure Application:**
   - Name: "Event Orchestrator"
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: `https://your-domain.com/oauth/callback/microsoft`

3. **Add API Permissions:**
   - Go to "API permissions"
   - Add permissions: "Microsoft Graph"
   - Delegated permissions:
     - `Calendars.Read`
     - `User.Read`
   - Click "Grant admin consent"

4. **Create Client Secret:**
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Save the secret value immediately (you can't view it again)

5. **Get Credentials:**
   - Note your Application (client) ID
   - Note your Directory (tenant) ID
   - Store these securely in your backend environment variables

---

## 🗄️ Database Schema Recommendations

### OAuth Connections Table
```sql
CREATE TABLE oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google' or 'microsoft'
  provider_user_id VARCHAR(255),
  provider_email VARCHAR(255),
  access_token TEXT, -- Encrypted
  refresh_token TEXT, -- Encrypted
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);
```

### Team Invitations Table
```sql
CREATE TABLE team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'expired'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  UNIQUE(company_id, email)
);
```

---

## 🔒 Security Best Practices

1. **Token Storage:**
   - Always encrypt OAuth tokens before storing in database
   - Use Supabase Vault or similar encryption service
   - Never expose refresh tokens to frontend

2. **State Parameter:**
   - Generate cryptographically secure random state for OAuth
   - Validate state parameter on callback
   - Expire state after 10 minutes

3. **Rate Limiting:**
   - Implement rate limiting on OAuth endpoints
   - Limit invitation sends per user/company

4. **Token Refresh:**
   - Implement automatic token refresh before expiry
   - Handle refresh failures gracefully
   - Prompt user to reconnect if refresh token expires

5. **Scope Management:**
   - Request minimal necessary scopes
   - Document why each scope is needed
   - Allow users to disconnect integrations

---

## 📝 Environment Variables Needed

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-app.com/oauth/callback/google

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-application-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=common # or your-tenant-id
MICROSOFT_REDIRECT_URI=https://your-app.com/oauth/callback/microsoft

# Encryption
OAUTH_TOKEN_ENCRYPTION_KEY=your-32-byte-encryption-key

# App Settings
APP_BASE_URL=https://your-app.com
```

---

## 🧪 Testing Recommendations

1. **OAuth Flow Testing:**
   - Test authorization URL generation
   - Test callback with valid code
   - Test callback with error scenarios
   - Test state parameter validation

2. **Token Management:**
   - Test token refresh logic
   - Test expired token handling
   - Test revoked token scenarios

3. **Integration Testing:**
   - Test calendar event fetching
   - Test with multiple calendars
   - Test with recurring events
   - Test with all-day events

4. **Security Testing:**
   - Test CSRF protection (state parameter)
   - Test with invalid/expired tokens
   - Test rate limiting
   - Test unauthorized access attempts

---

## 📞 Support & Resources

- **Google Calendar API:** https://developers.google.com/calendar/api/v3/reference
- **Microsoft Graph API:** https://learn.microsoft.com/en-us/graph/api/calendar-get
- **OAuth 2.0 Spec:** https://oauth.net/2/
- **Supabase Edge Functions:** https://supabase.com/docs/guides/functions

---

## ✅ Implementation Checklist

- [ ] Set up Google Cloud Console project
- [ ] Set up Azure AD app registration
- [ ] Create database tables for OAuth connections
- [ ] Implement token encryption/decryption
- [ ] Create OAuth URL generation endpoints
- [ ] Create OAuth callback handlers
- [ ] Implement token refresh logic
- [ ] Create calendar event fetch endpoints
- [ ] Create team management endpoints
- [ ] Set up error handling and logging
- [ ] Test OAuth flows end-to-end
- [ ] Document API for frontend team
- [ ] Set up monitoring and alerts

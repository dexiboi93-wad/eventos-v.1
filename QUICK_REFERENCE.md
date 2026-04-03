# Enterprise SaaS Quick Reference Card

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `/supabase/functions/server/auth-middleware.tsx` | Auth & permissions |
| `/supabase/functions/server/data-scoping.tsx` | Data isolation |
| `/supabase/functions/server/team-routes.tsx` | Team management API |
| `/src/app/components/TeamManagement.tsx` | Team UI |
| `/src/app/context/CompanyContext.tsx` | Company state |

## 👥 Roles

| Role | Level | Permissions |
|------|-------|-------------|
| Mastermind | 5 | Everything |
| Coordinator | 4 | Manage events, finances, invite users |
| Planner | 3 | Create/edit events, vendors, venues |
| Assistant | 2 | View and assist |
| Viewer | 1 | Read-only |

## 🛡️ Common Middleware

```typescript
// Require authentication
app.get('/route', requireAuth(kv), async (c) => {
  const user = getAuthUser(c);
  // ...
});

// Require specific role
app.post('/route', requireRole(kv, ['Mastermind']), async (c) => {
  // Only Masterminds can access
});

// Require permission
app.post('/route', requirePermission(kv, PERMISSIONS.CREATE_EVENTS), async (c) => {
  // Only roles with CREATE_EVENTS permission
});
```

## 📦 Data Scoping

```typescript
// Get company data
const events = await dataService.getEvents(companyId);
const vendors = await dataService.getVendors(companyId);
const team = await dataService.getTeamMembers(companyId);

// Set company data
await dataService.setEvents(companyId, events);
await dataService.setVendors(companyId, vendors);
```

## 🔐 Frontend Auth

```typescript
import { useAuth } from './context/AuthContext';

const { user, accessToken } = useAuth();

// Check role
const isMastermind = user?.role === 'Mastermind';
const canInvite = ['Mastermind', 'Coordinator'].includes(user?.role || '');

// Make request
fetch(`${API_BASE}/events`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

## 🎯 Team Management Flow

1. **Mastermind signs up** → Creates company
2. **Go to Settings → Team**
3. **Click "Invite Member"**
4. **Fill email, name, role**
5. **Copy invitation code**
6. **New user signs up with code**
7. **Joins company automatically**

## 📊 API Endpoints

### Team Management
```
GET    /team/members              # List team
POST   /team/invite               # Invite user
GET    /team/invitations          # Pending invites
DELETE /team/invitation/:id       # Cancel invite
PUT    /team/member/:id/role      # Update role
DELETE /team/member/:id           # Remove member
GET    /team/company-info         # Company details
PUT    /team/company-settings     # Update company
```

### Auth
```
POST   /auth/signup               # Sign up (with optional invitationId)
GET    /auth/profile              # Get profile
PUT    /auth/profile              # Update profile
```

### Data (All company-scoped)
```
GET    /sync                      # Get events & phases
POST   /blueprint/task            # Update task
POST   /events/new                # Create event
```

## 🔍 Debugging

### Check Logs
```
[Auth] User signed up: email, company
[Auth] Role updated for userId
[Team] Invitation created
[Team] User removed from company
```

### Common Errors

| Error | Solution |
|-------|----------|
| "No authorization token" | Re-login |
| "Insufficient permissions" | Check role |
| "User not found" | Profile missing |
| "Company not found" | Check companyId |

## 📝 Permission Checks

```typescript
import { PERMISSIONS, hasPermission } from './auth-middleware.tsx';

// Check if role has permission
if (hasPermission(user.role, PERMISSIONS.CREATE_EVENTS)) {
  // User can create events
}

// Available permissions
PERMISSIONS.MANAGE_COMPANY
PERMISSIONS.MANAGE_TEAM
PERMISSIONS.INVITE_USERS
PERMISSIONS.CREATE_EVENTS
PERMISSIONS.EDIT_EVENTS
PERMISSIONS.DELETE_EVENTS
PERMISSIONS.VIEW_EVENTS
PERMISSIONS.CREATE_VENDORS
PERMISSIONS.MANAGE_FINANCES
PERMISSIONS.VIEW_FINANCES
PERMISSIONS.MANAGE_INTEGRATIONS
```

## 🎨 UI Patterns

```typescript
// Show based on role
{user?.role === 'Mastermind' && (
  <button>Admin Action</button>
)}

// Show based on permission
{['Mastermind', 'Coordinator'].includes(user?.role || '') && (
  <button>Invite User</button>
)}

// Disable based on role
<button disabled={user?.role === 'Viewer'}>
  Edit Event
</button>
```

## 🚀 Quick Commands

### Create Protected Route
```typescript
import { requireAuth, getAuthUser } from './auth-middleware.tsx';

app.post(`${PREFIX}/my-route`, requireAuth(kv), async (c) => {
  const authUser = getAuthUser(c);
  const data = await dataService.get(authUser.companyId, 'resource');
  return c.json({ data });
});
```

### Add New Resource Type
```typescript
// In data-scoping.tsx
export const RESOURCE_TYPES = {
  MY_RESOURCE: 'my-resource',
  // ...
};

// Use it
const data = await dataService.get(companyId, RESOURCE_TYPES.MY_RESOURCE);
```

### Create New Permission
```typescript
// In auth-middleware.tsx
export const PERMISSIONS = {
  MY_PERMISSION: ['Mastermind', 'Coordinator'] as AppRole[],
  // ...
};

// Use it
app.post('/route', requirePermission(kv, PERMISSIONS.MY_PERMISSION), ...);
```

## 📚 Documentation

| File | What's Inside |
|------|---------------|
| `ENTERPRISE_SAAS_SUMMARY.md` | Complete overview |
| `IMPLEMENTATION_GUIDE.md` | Step-by-step guide |
| `ENTERPRISE_SAAS_ARCHITECTURE.md` | Detailed architecture |
| `REFERENCE_SQL_SCHEMA.md` | Production SQL schema |
| `QUICK_REFERENCE.md` | This file |

## ⚡ Quick Wins

### Add Auth to Existing Endpoint
```diff
- app.get(`${PREFIX}/vendors`, async (c) => {
-   const vendors = await kv.get('vendors');
+ app.get(`${PREFIX}/vendors`, requireAuth(kv), async (c) => {
+   const authUser = getAuthUser(c);
+   const vendors = await dataService.getVendors(authUser.companyId);
    return c.json({ vendors });
  });
```

### Check User Role in Component
```typescript
import { useAuth } from './context/AuthContext';

const { user } = useAuth();
const canEdit = user?.role !== 'Viewer';
```

### Get Company Info
```typescript
import { useCompany } from './context/CompanyContext';

const { companySettings, teamMembers } = useCompany();
```

## 🎯 Remember

1. **Always scope by companyId** on server
2. **Always use middleware** for auth
3. **Check permissions** not just roles
4. **Log security events** for audit
5. **Never expose service role key** to frontend

## 🏁 You're Ready!

- Read: `IMPLEMENTATION_GUIDE.md`
- Reference: `ENTERPRISE_SAAS_ARCHITECTURE.md`
- Migrate to SQL: `REFERENCE_SQL_SCHEMA.md`
- This cheat sheet: Bookmark it! 📌

---

**Need help?** Check the detailed docs or examine the implemented components for patterns.

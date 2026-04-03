# Enterprise Multi-Tenant SaaS Architecture

## Overview

Your event planning platform now features a complete enterprise-grade multi-tenant Software-as-a-Service (SaaS) architecture with strict data isolation, role-based access control, and team management capabilities.

## Architecture Components

### 1. Multi-Tenancy Data Isolation

**Company-Scoped Data Structure:**
```
company:{companyId}:{resourceType}[:resourceId]
```

**Examples:**
- `company:comp-123:events` - All events for company 123
- `company:comp-123:vendors` - All vendors for company 123
- `company:comp-123:team-members` - Team roster
- `company:comp-123:settings` - Company settings
- `company:comp-123:stripe-keys` - Company-specific Stripe credentials

**Key Files:**
- `/supabase/functions/server/data-scoping.tsx` - Data scoping utilities and service
- `/supabase/functions/server/auth-middleware.tsx` - Authentication and authorization

### 2. Role-Based Access Control (RBAC)

**Role Hierarchy (lowest to highest):**
1. **Viewer** - Read-only access
2. **Assistant** - Can view and assist with tasks
3. **Planner** - Can create/edit events, vendors, venues
4. **Coordinator** - All Planner permissions + manage finances, invite users
5. **Mastermind** - Full access - company owner/administrator

**Permission System:**
```typescript
PERMISSIONS = {
  MANAGE_COMPANY: ['Mastermind'],
  MANAGE_TEAM: ['Mastermind'],
  INVITE_USERS: ['Mastermind', 'Coordinator'],
  CREATE_EVENTS: ['Mastermind', 'Coordinator', 'Planner'],
  EDIT_EVENTS: ['Mastermind', 'Coordinator', 'Planner'],
  DELETE_EVENTS: ['Mastermind', 'Coordinator'],
  VIEW_EVENTS: ['Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer'],
  // ... and more
}
```

### 3. Authentication & Authorization Flow

**User Signup:**
1. **New Company:** Creates new company, user becomes Mastermind
2. **Via Invitation:** Joins existing company with assigned role

**Request Flow:**
```
Client Request
  ↓
CORS & Logging Middleware
  ↓
Authentication Middleware (requireAuth)
  ↓
Permission Check (requirePermission / requireRole)
  ↓
Data Scoping Service (ensures company isolation)
  ↓
Route Handler
  ↓
Response
```

**Middleware Functions:**
- `requireAuth(kv)` - Validates JWT token, loads user profile
- `requireRole(kv, ['Mastermind'])` - Requires specific role(s)
- `requirePermission(kv, PERMISSIONS.CREATE_EVENTS)` - Checks permission

### 4. Team Management

**Invitation System:**
1. Mastermind/Coordinator sends invitation with email, name, and role
2. System generates unique invitation ID
3. Invitation valid for 7 days
4. New user signs up with invitation code
5. Automatically joins company with assigned role

**Team Operations:**
- View team members
- Invite new members
- Update member roles (Mastermind only)
- Remove members (Mastermind only)
- View pending invitations
- Cancel invitations

**Key Endpoints:**
```
GET    /team/members              - List all team members
POST   /team/invite               - Invite new member
GET    /team/invitations          - List pending invitations
GET    /team/invitation/:id       - Get invitation details (public)
DELETE /team/invitation/:id       - Cancel invitation
PUT    /team/member/:userId/role  - Update member role
DELETE /team/member/:userId       - Remove member
GET    /team/company-info         - Get company information
PUT    /team/company-settings     - Update company settings
```

## Security Best Practices

### 1. Data Isolation
✅ **All data is scoped by companyId**
- Users can only access their company's data
- Middleware enforces company access on every request
- KV keys include company identifier

### 2. Authentication
✅ **Supabase Auth JWT tokens**
- Every protected endpoint requires valid token
- Token verified on server-side with service role key
- User profile loaded from KV store

### 3. Authorization
✅ **Role-based permissions**
- Fine-grained permissions for every action
- Hierarchical role system
- Cannot escalate own privileges

### 4. Audit Trail
✅ **Tracking & Logging**
- All modifications logged with userId and timestamp
- User removal archives profile (doesn't delete)
- Server logs all auth and permission events

## Implementation Guide

### Backend: Protecting an Endpoint

**Before (unprotected):**
```typescript
app.get(`${PREFIX}/events`, async (c) => {
  const events = await kv.get('events');
  return c.json({ events });
});
```

**After (protected & company-scoped):**
```typescript
app.get(`${PREFIX}/events`, requirePermission(kv, PERMISSIONS.VIEW_EVENTS), async (c) => {
  const authUser = getAuthUser(c);
  const events = await dataService.getEvents(authUser.companyId);
  return c.json({ events });
});
```

### Frontend: Using Team Management

```typescript
import { TeamManagement } from './components/TeamManagement';

// In Settings or Admin page:
<TeamManagement />
```

### Using Auth Context

```typescript
import { useAuth } from './context/AuthContext';

function MyComponent() {
  const { user, accessToken } = useAuth();
  
  // Check role
  const canManageTeam = user?.role === 'Mastermind';
  
  // Make authenticated request
  const response = await fetch(`${API_BASE}/events`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
```

## Company Onboarding Flow

### 1. First User (Company Founder)
```
Sign Up → Creates Company → Becomes Mastermind → Can invite team
```

### 2. Invited Team Members
```
Receive Invitation Code → Sign Up with Code → Join Company → Assigned Role
```

### 3. Initial Data Setup
When a new company is created, the system automatically:
- Creates company settings
- Initializes team members list
- Seeds initial events/phases (optional)
- Sets up empty vendors/venues lists

## Data Migration

### Migrating Existing Data to Company Scope

If you have existing global data, use the migration helper:

```typescript
// Server-side
await dataService.migrateToCompanyScope(
  'company-123',           // Target company ID
  'events',                // Old global key
  RESOURCE_TYPES.EVENTS   // New resource type
);
```

### Legacy Support

The system maintains backward compatibility:
- Old keys (e.g., 'events', 'vendors') still work for default company
- New signups create proper company-scoped data
- Gradual migration path available

## API Changes Summary

### Updated Endpoints (Now Require Auth)

| Endpoint | Auth | Permission | Scoped |
|----------|------|------------|--------|
| `/sync` | ✅ | Any | ✅ |
| `/blueprint/task` | ✅ | Any | ✅ |
| `/events/new` | ✅ | CREATE_EVENTS | ✅ |
| `/events/*` | ✅ | VIEW_EVENTS | ✅ |
| `/vendors/*` | ✅ | Role-based | ✅ |
| `/venues/*` | ✅ | Role-based | ✅ |

### New Team Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/team/members` | GET | Any authenticated | List team |
| `/team/invite` | POST | INVITE_USERS | Send invitation |
| `/team/invitations` | GET | INVITE_USERS | List pending |
| `/team/invitation/:id` | GET | Public | Get invite details |
| `/team/invitation/:id` | DELETE | INVITE_USERS | Cancel invite |
| `/team/member/:id/role` | PUT | Mastermind | Update role |
| `/team/member/:id` | DELETE | Mastermind | Remove member |
| `/team/company-info` | GET | Any authenticated | Get company |
| `/team/company-settings` | PUT | Mastermind | Update company |

## Frontend Components

### New Components Added

1. **TeamManagement.tsx** - Complete team management UI
   - View team members
   - Invite dialog
   - Role management
   - Pending invitations table
   - Role permissions reference

### Integration with Existing Components

Add to Settings page or create dedicated Admin section:

```typescript
import { TeamManagement } from './components/TeamManagement';

// In Settings.tsx or Admin.tsx:
{user?.role === 'Mastermind' || user?.role === 'Coordinator' ? (
  <TeamManagement />
) : null}
```

## User Experience

### For Masterminds (Company Owners)
- Create company on first signup
- Invite unlimited team members
- Assign and change roles
- Manage company settings
- Full access to all features
- View audit logs

### For Coordinators
- Invite new team members (Planner, Assistant, Viewer)
- Manage events, vendors, finances
- Cannot modify other Masterminds or Coordinators
- Cannot access company billing settings

### For Planners
- Create and edit events
- Manage vendors and venues
- View financial data (read-only)
- Cannot invite users or change roles

### For Assistants
- View events and resources
- Help with tasks
- Cannot create or modify events
- Limited to support role

### For Viewers
- Read-only access
- Can view events, vendors, venues
- Cannot make changes
- Perfect for clients or observers

## Best Practices for Your Team

1. **Start with one Mastermind** - The company founder
2. **Invite Coordinators carefully** - They have significant permissions
3. **Use Planners for day-to-day** - Most event staff should be Planners
4. **Assistants for support** - Junior staff or temporary help
5. **Viewers for clients** - Let clients view progress without editing

## Troubleshooting

### Issue: User can't access data after signup
**Solution:** Ensure they signed up with an invitation code, or create new company

### Issue: Permission denied on endpoint
**Solution:** Check user role has required permission in PERMISSIONS constant

### Issue: Data not showing up
**Solution:** Verify data is being stored with correct companyId scope

### Issue: Old data missing
**Solution:** Run migration script to move global data to company scope

## Future Enhancements

Potential additions to the enterprise architecture:

1. **Multiple Companies per User** - Users can belong to multiple companies
2. **Advanced Audit Logs** - Detailed activity tracking with search/filter
3. **Company Billing** - Subscription management per company
4. **Custom Roles** - Company-defined roles beyond the 5 defaults
5. **SSO Integration** - SAML/OAuth for enterprise customers
6. **Data Export** - Company can export all their data
7. **Company Transfer** - Transfer Mastermind ownership
8. **Team Analytics** - Activity metrics per team member

## Summary

Your event planning platform now operates as a true enterprise SaaS application with:

✅ **Complete data isolation** - Companies cannot access each other's data
✅ **Role-based security** - 5-tier permission system
✅ **Team management** - Invite, manage, and remove team members
✅ **Audit trails** - Track who did what and when
✅ **Scalable architecture** - Can support unlimited companies
✅ **Backward compatible** - Existing data continues to work
✅ **Production ready** - Follows security best practices

Each company subscription provides:
- Initial Mastermind account (company owner)
- Ability to invite unlimited team members
- Isolated data storage
- Role-based access control
- Company-specific settings and integrations
- Full team collaboration features

This architecture positions your platform for enterprise clients who require strict data security, team collaboration, and granular permission controls.

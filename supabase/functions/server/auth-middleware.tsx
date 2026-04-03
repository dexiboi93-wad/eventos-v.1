import { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export type AppRole = 'Mastermind' | 'Coordinator' | 'Planner' | 'Assistant' | 'Viewer';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  companyName: string;
}

/**
 * Role hierarchy for permission checking
 * Higher number = more permissions
 */
const ROLE_HIERARCHY: Record<AppRole, number> = {
  'Mastermind': 5,
  'Coordinator': 4,
  'Planner': 3,
  'Assistant': 2,
  'Viewer': 1,
};

/**
 * Permission definitions for role-based access control
 */
export const PERMISSIONS = {
  // Company Management
  MANAGE_COMPANY: ['Mastermind'] as AppRole[],
  MANAGE_TEAM: ['Mastermind'] as AppRole[],
  INVITE_USERS: ['Mastermind', 'Coordinator'] as AppRole[],
  
  // Event Management
  CREATE_EVENTS: ['Mastermind', 'Coordinator', 'Planner'] as AppRole[],
  EDIT_EVENTS: ['Mastermind', 'Coordinator', 'Planner'] as AppRole[],
  DELETE_EVENTS: ['Mastermind', 'Coordinator'] as AppRole[],
  VIEW_EVENTS: ['Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer'] as AppRole[],
  
  // Vendor/Venue Management
  CREATE_VENDORS: ['Mastermind', 'Coordinator', 'Planner'] as AppRole[],
  EDIT_VENDORS: ['Mastermind', 'Coordinator', 'Planner'] as AppRole[],
  DELETE_VENDORS: ['Mastermind', 'Coordinator'] as AppRole[],
  VIEW_VENDORS: ['Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer'] as AppRole[],
  
  // Financial Management
  MANAGE_FINANCES: ['Mastermind', 'Coordinator'] as AppRole[],
  VIEW_FINANCES: ['Mastermind', 'Coordinator', 'Planner'] as AppRole[],
  
  // Settings
  MANAGE_INTEGRATIONS: ['Mastermind'] as AppRole[],
  VIEW_SETTINGS: ['Mastermind', 'Coordinator', 'Planner', 'Assistant'] as AppRole[],
  
  // CRM & Clients
  MANAGE_CLIENTS: ['Mastermind', 'Coordinator', 'Planner'] as AppRole[],
  VIEW_CLIENTS: ['Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer'] as AppRole[],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: AppRole, permission: AppRole[]): boolean {
  return permission.includes(role);
}

/**
 * Check if role1 has equal or higher hierarchy than role2
 */
export function hasRoleHierarchy(role1: AppRole, role2: AppRole): boolean {
  return ROLE_HIERARCHY[role1] >= ROLE_HIERARCHY[role2];
}

/**
 * Authenticate user from Authorization header and load their profile from KV
 */
export async function authenticateUser(c: Context, kv: any): Promise<{ user: AuthenticatedUser | null; error?: string }> {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return { user: null, error: 'No authorization token provided' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user: supaUser }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !supaUser) {
      return { user: null, error: 'Invalid or expired token' };
    }

    // Load user profile from KV
    const profile = await kv.get(`user_profile_${supaUser.id}`);
    
    if (!profile) {
      // Create default profile if it doesn't exist (for backwards compatibility)
      const defaultProfile = {
        userId: supaUser.id,
        email: supaUser.email || '',
        name: supaUser.user_metadata?.name || supaUser.email || 'User',
        role: 'Mastermind' as AppRole,
        companyId: 'default',
        companyName: supaUser.user_metadata?.companyName || 'Default Company',
        createdAt: new Date().toISOString(),
      };
      await kv.set(`user_profile_${supaUser.id}`, defaultProfile);
      return { user: defaultProfile };
    }

    return { user: profile };
  } catch (err: any) {
    console.error('[Auth] Authentication error:', err.message);
    return { user: null, error: `Authentication failed: ${err.message}` };
  }
}

/**
 * Middleware to require authentication
 */
export function requireAuth(kv: any) {
  return async (c: Context, next: () => Promise<void>) => {
    const { user, error } = await authenticateUser(c, kv);
    
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401);
    }
    
    // Attach user to context for use in route handlers
    c.set('authUser', user);
    await next();
  };
}

/**
 * Middleware to require specific role(s)
 */
export function requireRole(kv: any, allowedRoles: AppRole[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const { user, error } = await authenticateUser(c, kv);
    
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401);
    }
    
    if (!allowedRoles.includes(user.role)) {
      return c.json({ 
        error: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}. Your role: ${user.role}` 
      }, 403);
    }
    
    c.set('authUser', user);
    await next();
  };
}

/**
 * Middleware to require specific permission
 */
export function requirePermission(kv: any, permission: AppRole[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const { user, error } = await authenticateUser(c, kv);
    
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401);
    }
    
    if (!hasPermission(user.role, permission)) {
      return c.json({ 
        error: `Insufficient permissions. This action requires one of: ${permission.join(', ')}` 
      }, 403);
    }
    
    c.set('authUser', user);
    await next();
  };
}

/**
 * Verify user belongs to a specific company
 */
export function verifyCompanyAccess(user: AuthenticatedUser, companyId: string): boolean {
  // Masterminds might have access to multiple companies in the future
  // For now, users can only access their own company
  return user.companyId === companyId;
}

/**
 * Get authenticated user from context (after requireAuth middleware)
 */
export function getAuthUser(c: Context): AuthenticatedUser {
  const user = c.get('authUser');
  if (!user) {
    throw new Error('No authenticated user in context. Did you forget to use requireAuth middleware?');
  }
  return user;
}

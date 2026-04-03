import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { 
  getAuthUser, 
  requireAuth, 
  requireRole, 
  requirePermission,
  PERMISSIONS,
  hasPermission,
  type AuthenticatedUser,
  type AppRole 
} from "./auth-middleware.tsx";
import { createDataScopingService, RESOURCE_TYPES } from "./data-scoping.tsx";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export function createTeamRoutes(prefix: string) {
  const app = new Hono();
  const dataService = createDataScopingService(kv);

  // ═══════════════════════════════════════════════════════════════
  // ===== TEAM MANAGEMENT ROUTES =====
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /team/members
   * Get all team members for the authenticated user's company
   * Required: Any authenticated user
   */
  app.get(`${prefix}/team/members`, requireAuth(kv), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const members = await dataService.getTeamMembers(authUser.companyId);
      
      // Also get full profiles for each member
      const profilesPromises = members.map(async (member: any) => {
        const profile = await kv.get(`user_profile_${member.userId}`);
        return profile || member;
      });
      
      const profiles = await Promise.all(profilesPromises);
      
      return c.json({ 
        success: true,
        members: profiles,
        companyId: authUser.companyId,
      });
    } catch (error: any) {
      console.error('[Team] Error fetching team members:', error.message);
      return c.json({ error: `Failed to fetch team members: ${error.message}` }, 500);
    }
  });

  /**
   * POST /team/invite
   * Invite a new team member to the company
   * Required: Mastermind or Coordinator role
   */
  app.post(`${prefix}/team/invite`, requirePermission(kv, PERMISSIONS.INVITE_USERS), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const { email, name, role } = await c.req.json();

      if (!email || !name || !role) {
        return c.json({ error: 'Email, name, and role are required' }, 400);
      }

      const validRoles: AppRole[] = ['Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer'];
      if (!validRoles.includes(role)) {
        return c.json({ error: 'Invalid role. Must be one of: Mastermind, Coordinator, Planner, Assistant, Viewer' }, 400);
      }

      // Only Mastermind can invite other Masterminds
      if (role === 'Mastermind' && authUser.role !== 'Mastermind') {
        return c.json({ error: 'Only Masterminds can invite other Masterminds' }, 403);
      }

      // Create invitation record
      const invitationId = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const invitation = {
        id: invitationId,
        email,
        name,
        role,
        companyId: authUser.companyId,
        companyName: authUser.companyName,
        invitedBy: authUser.userId,
        invitedByName: authUser.name,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      };

      // Store invitation
      const existingInvitations = await dataService.get(authUser.companyId, RESOURCE_TYPES.INVITATIONS) || [];
      await dataService.set(authUser.companyId, RESOURCE_TYPES.INVITATIONS, [...existingInvitations, invitation]);

      console.log(`[Team] Invitation created: ${email} → ${authUser.companyName} as ${role}`);

      return c.json({
        success: true,
        invitation: {
          id: invitationId,
          email,
          role,
          status: 'pending',
        },
        message: `Invitation sent to ${email}. They can sign up using this invitation code: ${invitationId}`,
      });
    } catch (error: any) {
      console.error('[Team] Error creating invitation:', error.message);
      return c.json({ error: `Failed to create invitation: ${error.message}` }, 500);
    }
  });

  /**
   * GET /team/invitations
   * Get all pending invitations for the company
   * Required: Mastermind or Coordinator
   */
  app.get(`${prefix}/team/invitations`, requirePermission(kv, PERMISSIONS.INVITE_USERS), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const invitations = await dataService.get(authUser.companyId, RESOURCE_TYPES.INVITATIONS) || [];
      
      // Filter out expired invitations
      const now = new Date();
      const activeInvitations = invitations.filter((inv: any) => {
        const expiresAt = new Date(inv.expiresAt);
        return inv.status === 'pending' && expiresAt > now;
      });

      return c.json({
        success: true,
        invitations: activeInvitations,
      });
    } catch (error: any) {
      console.error('[Team] Error fetching invitations:', error.message);
      return c.json({ error: `Failed to fetch invitations: ${error.message}` }, 500);
    }
  });

  /**
   * GET /team/invitation/:invitationId
   * Get invitation details (public endpoint for signup)
   */
  app.get(`${prefix}/team/invitation/:invitationId`, async (c) => {
    try {
      const invitationId = c.req.param('invitationId');
      
      // We need to search across all companies for this invitation
      // This is one of the few cases where we need to do a broader search
      const allInvitationsKeys = await kv.getByPrefix('company:');
      
      let foundInvitation = null;
      for (const key of allInvitationsKeys) {
        if (key.includes(':invitations')) {
          const invitations = await kv.get(key);
          if (invitations && Array.isArray(invitations)) {
            const inv = invitations.find((i: any) => i.id === invitationId);
            if (inv) {
              foundInvitation = inv;
              break;
            }
          }
        }
      }

      if (!foundInvitation) {
        return c.json({ error: 'Invitation not found' }, 404);
      }

      // Check if expired
      const expiresAt = new Date(foundInvitation.expiresAt);
      if (expiresAt < new Date()) {
        return c.json({ error: 'Invitation has expired' }, 400);
      }

      if (foundInvitation.status !== 'pending') {
        return c.json({ error: 'Invitation has already been used' }, 400);
      }

      return c.json({
        success: true,
        invitation: {
          id: foundInvitation.id,
          email: foundInvitation.email,
          name: foundInvitation.name,
          role: foundInvitation.role,
          companyName: foundInvitation.companyName,
          invitedBy: foundInvitation.invitedByName,
          expiresAt: foundInvitation.expiresAt,
        },
      });
    } catch (error: any) {
      console.error('[Team] Error fetching invitation:', error.message);
      return c.json({ error: `Failed to fetch invitation: ${error.message}` }, 500);
    }
  });

  /**
   * DELETE /team/invitation/:invitationId
   * Cancel a pending invitation
   * Required: Mastermind or Coordinator
   */
  app.delete(`${prefix}/team/invitation/:invitationId`, requirePermission(kv, PERMISSIONS.INVITE_USERS), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const invitationId = c.req.param('invitationId');

      const invitations = await dataService.get(authUser.companyId, RESOURCE_TYPES.INVITATIONS) || [];
      const updatedInvitations = invitations.filter((inv: any) => inv.id !== invitationId);

      if (invitations.length === updatedInvitations.length) {
        return c.json({ error: 'Invitation not found' }, 404);
      }

      await dataService.set(authUser.companyId, RESOURCE_TYPES.INVITATIONS, updatedInvitations);

      console.log(`[Team] Invitation cancelled: ${invitationId}`);
      return c.json({ success: true, message: 'Invitation cancelled' });
    } catch (error: any) {
      console.error('[Team] Error cancelling invitation:', error.message);
      return c.json({ error: `Failed to cancel invitation: ${error.message}` }, 500);
    }
  });

  /**
   * PUT /team/member/:userId/role
   * Update a team member's role
   * Required: Mastermind only
   */
  app.put(`${prefix}/team/member/:userId/role`, requireRole(kv, ['Mastermind']), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const targetUserId = c.req.param('userId');
      const { role } = await c.req.json();

      const validRoles: AppRole[] = ['Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer'];
      if (!validRoles.includes(role)) {
        return c.json({ error: 'Invalid role' }, 400);
      }

      // Get target user's profile
      const targetProfile = await kv.get(`user_profile_${targetUserId}`);
      if (!targetProfile) {
        return c.json({ error: 'User not found' }, 404);
      }

      // Verify target user is in the same company
      if (targetProfile.companyId !== authUser.companyId) {
        return c.json({ error: 'User not in your company' }, 403);
      }

      // Prevent changing own role
      if (targetUserId === authUser.userId) {
        return c.json({ error: 'Cannot change your own role' }, 400);
      }

      // Update role
      const updatedProfile = { ...targetProfile, role, updatedAt: new Date().toISOString() };
      await kv.set(`user_profile_${targetUserId}`, updatedProfile);

      console.log(`[Team] Role updated: ${targetProfile.email} → ${role} by ${authUser.email}`);

      return c.json({
        success: true,
        message: `Role updated to ${role}`,
        user: {
          userId: targetUserId,
          email: targetProfile.email,
          name: targetProfile.name,
          role,
        },
      });
    } catch (error: any) {
      console.error('[Team] Error updating role:', error.message);
      return c.json({ error: `Failed to update role: ${error.message}` }, 500);
    }
  });

  /**
   * DELETE /team/member/:userId
   * Remove a team member from the company
   * Required: Mastermind only
   */
  app.delete(`${prefix}/team/member/:userId`, requireRole(kv, ['Mastermind']), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const targetUserId = c.req.param('userId');

      // Cannot remove yourself
      if (targetUserId === authUser.userId) {
        return c.json({ error: 'Cannot remove yourself from the company' }, 400);
      }

      // Get target user's profile
      const targetProfile = await kv.get(`user_profile_${targetUserId}`);
      if (!targetProfile) {
        return c.json({ error: 'User not found' }, 404);
      }

      // Verify target user is in the same company
      if (targetProfile.companyId !== authUser.companyId) {
        return c.json({ error: 'User not in your company' }, 403);
      }

      // Remove from team members list
      await dataService.removeTeamMember(authUser.companyId, targetUserId);

      // Archive the user profile (don't delete, for audit trail)
      const archivedProfile = {
        ...targetProfile,
        status: 'removed',
        removedBy: authUser.userId,
        removedAt: new Date().toISOString(),
        formerCompanyId: targetProfile.companyId,
        companyId: null, // Revoke access
      };
      await kv.set(`user_profile_${targetUserId}`, archivedProfile);

      console.log(`[Team] User removed: ${targetProfile.email} from ${authUser.companyName} by ${authUser.email}`);

      return c.json({
        success: true,
        message: `${targetProfile.name} has been removed from the team`,
      });
    } catch (error: any) {
      console.error('[Team] Error removing team member:', error.message);
      return c.json({ error: `Failed to remove team member: ${error.message}` }, 500);
    }
  });

  /**
   * GET /team/company-info
   * Get company information
   * Required: Any authenticated user
   */
  app.get(`${prefix}/team/company-info`, requireAuth(kv), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const companySettings = await dataService.getCompanySettings(authUser.companyId);
      const teamMembers = await dataService.getTeamMembers(authUser.companyId);

      return c.json({
        success: true,
        company: {
          companyId: authUser.companyId,
          companyName: authUser.companyName,
          ...companySettings,
          teamSize: teamMembers.length,
        },
      });
    } catch (error: any) {
      console.error('[Team] Error fetching company info:', error.message);
      return c.json({ error: `Failed to fetch company info: ${error.message}` }, 500);
    }
  });

  /**
   * PUT /team/company-settings
   * Update company settings
   * Required: Mastermind only
   */
  app.put(`${prefix}/team/company-settings`, requireRole(kv, ['Mastermind']), async (c) => {
    try {
      const authUser = getAuthUser(c);
      const updates = await c.req.json();

      const existingSettings = await dataService.getCompanySettings(authUser.companyId) || {};
      const updatedSettings = {
        ...existingSettings,
        ...updates,
        companyId: authUser.companyId, // Ensure companyId can't be changed
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.userId,
      };

      await dataService.setCompanySettings(authUser.companyId, updatedSettings);

      // Also update company name in user profiles if changed
      if (updates.companyName && updates.companyName !== authUser.companyName) {
        const teamMembers = await dataService.getTeamMembers(authUser.companyId);
        for (const member of teamMembers) {
          const profile = await kv.get(`user_profile_${member.userId}`);
          if (profile) {
            await kv.set(`user_profile_${member.userId}`, {
              ...profile,
              companyName: updates.companyName,
            });
          }
        }
      }

      console.log(`[Team] Company settings updated for ${authUser.companyId}`);

      return c.json({
        success: true,
        message: 'Company settings updated',
        settings: updatedSettings,
      });
    } catch (error: any) {
      console.error('[Team] Error updating company settings:', error.message);
      return c.json({ error: `Failed to update company settings: ${error.message}` }, 500);
    }
  });

  return app;
}

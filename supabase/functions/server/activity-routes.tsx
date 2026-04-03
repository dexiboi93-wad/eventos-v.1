/**
 * Activity & Real-Time Collaboration Routes
 * Handles activity logging, presence tracking, and collaborative editing awareness
 */

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

const PREFIX = '/make-server-6c8332a9';

interface ActivityEntry {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  resourceType: string; // 'event', 'task', 'document', 'invoice', 'vendor', 'venue', 'client'
  resourceId: string;
  resourceName: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

interface PresenceEntry {
  userId: string;
  userName: string;
  userRole: string;
  companyId: string;
  status: 'online' | 'away' | 'offline';
  currentView?: string; // URL path or resource identifier
  editingResource?: {
    type: string;
    id: string;
    name: string;
  };
  lastSeen: string;
}

interface CollaborationSession {
  sessionId: string;
  resourceType: string;
  resourceId: string;
  companyId: string;
  activeUsers: Array<{
    userId: string;
    userName: string;
    joinedAt: string;
  }>;
  startedAt: string;
  lastActivity: string;
}

const app = new Hono();

// Helper to generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Helper to get auth user from context (simplified - integrate with auth-middleware in production)
function getAuthUser(c: any) {
  return c.get('authUser') || {
    id: 'demo-user',
    companyId: 'demo-company',
    name: 'Demo User',
    role: 'Coordinator',
  };
}

// ==================== Activity Logging ====================

/**
 * POST /activity
 * Log a new activity entry
 */
app.post(`${PREFIX}/activity`, async (c) => {
  try {
    const authUser = getAuthUser(c);
    const body = await c.req.json();

    const activity: ActivityEntry = {
      id: generateId(),
      companyId: authUser.companyId,
      userId: authUser.id,
      userName: authUser.name,
      userRole: authUser.role,
      action: body.action,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      resourceName: body.resourceName,
      metadata: body.metadata || {},
      timestamp: new Date().toISOString(),
    };

    // Store activity in KV store
    const activityKey = `activity:${authUser.companyId}:${activity.id}`;
    await kv.set(activityKey, activity);

    // Add to company's activity timeline (recent 1000 activities)
    const timelineKey = `activity-timeline:${authUser.companyId}`;
    const timeline = (await kv.get(timelineKey)) || [];
    timeline.unshift(activity);
    // Keep only recent 1000 activities
    if (timeline.length > 1000) {
      timeline.length = 1000;
    }
    await kv.set(timelineKey, timeline);

    console.log(`✅ Activity logged: ${authUser.name} ${body.action} ${body.resourceType} "${body.resourceName}"`);

    return c.json({
      success: true,
      activity,
    });
  } catch (error) {
    console.error('❌ Error logging activity:', error);
    return c.json({ error: 'Failed to log activity', details: error.message }, 500);
  }
});

/**
 * GET /activity
 * Get activity feed for company
 * Query params: limit, resourceType, resourceId, userId
 */
app.get(`${PREFIX}/activity`, async (c) => {
  try {
    const authUser = getAuthUser(c);
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const resourceType = c.req.query('resourceType');
    const resourceId = c.req.query('resourceId');
    const userId = c.req.query('userId');

    const timelineKey = `activity-timeline:${authUser.companyId}`;
    let activities: ActivityEntry[] = (await kv.get(timelineKey)) || [];

    // Apply filters
    if (resourceType) {
      activities = activities.filter((a) => a.resourceType === resourceType);
    }
    if (resourceId) {
      activities = activities.filter((a) => a.resourceId === resourceId);
    }
    if (userId) {
      activities = activities.filter((a) => a.userId === userId);
    }

    // Apply limit
    activities = activities.slice(0, limit);

    console.log(`📊 Fetched ${activities.length} activities for company ${authUser.companyId}`);

    return c.json({
      activities,
      total: activities.length,
    });
  } catch (error) {
    console.error('❌ Error fetching activities:', error);
    return c.json({ error: 'Failed to fetch activities', details: error.message }, 500);
  }
});

// ==================== Presence Management ====================

/**
 * POST /presence/update
 * Update user's presence status
 */
app.post(`${PREFIX}/presence/update`, async (c) => {
  try {
    const authUser = getAuthUser(c);
    const body = await c.req.json();

    const presence: PresenceEntry = {
      userId: authUser.id,
      userName: authUser.name,
      userRole: authUser.role,
      companyId: authUser.companyId,
      status: body.status || 'online',
      currentView: body.currentView,
      editingResource: body.editingResource,
      lastSeen: new Date().toISOString(),
    };

    // Store presence
    const presenceKey = `presence:${authUser.companyId}:${authUser.id}`;
    await kv.set(presenceKey, presence);

    // Update company presence list
    const companyPresenceKey = `presence-list:${authUser.companyId}`;
    const presenceList = (await kv.get(companyPresenceKey)) || {};
    presenceList[authUser.id] = presence;
    await kv.set(companyPresenceKey, presenceList);

    console.log(`👤 Presence updated: ${authUser.name} is ${body.status} at ${body.currentView || 'unknown'}`);

    return c.json({
      success: true,
      presence,
    });
  } catch (error) {
    console.error('❌ Error updating presence:', error);
    return c.json({ error: 'Failed to update presence', details: error.message }, 500);
  }
});

/**
 * GET /presence
 * Get all online users in company
 */
app.get(`${PREFIX}/presence`, async (c) => {
  try {
    const authUser = getAuthUser(c);

    const companyPresenceKey = `presence-list:${authUser.companyId}`;
    const presenceList: Record<string, PresenceEntry> = (await kv.get(companyPresenceKey)) || {};

    // Filter out stale presence (older than 5 minutes)
    const now = Date.now();
    const activePresence = Object.values(presenceList).filter((p) => {
      const lastSeen = new Date(p.lastSeen).getTime();
      return now - lastSeen < 5 * 60 * 1000; // 5 minutes
    });

    console.log(`👥 ${activePresence.length} active users in company ${authUser.companyId}`);

    return c.json({
      users: activePresence,
      onlineCount: activePresence.filter((p) => p.status === 'online').length,
    });
  } catch (error) {
    console.error('❌ Error fetching presence:', error);
    return c.json({ error: 'Failed to fetch presence', details: error.message }, 500);
  }
});

/**
 * GET /presence/resource/:type/:id
 * Get users currently viewing/editing a specific resource
 */
app.get(`${PREFIX}/presence/resource/:type/:id`, async (c) => {
  try {
    const authUser = getAuthUser(c);
    const resourceType = c.req.param('type');
    const resourceId = c.req.param('id');

    const companyPresenceKey = `presence-list:${authUser.companyId}`;
    const presenceList: Record<string, PresenceEntry> = (await kv.get(companyPresenceKey)) || {};

    // Filter users viewing/editing this resource
    const now = Date.now();
    const resourceUsers = Object.values(presenceList).filter((p) => {
      const lastSeen = new Date(p.lastSeen).getTime();
      const isActive = now - lastSeen < 5 * 60 * 1000;

      return (
        isActive &&
        p.editingResource &&
        p.editingResource.type === resourceType &&
        p.editingResource.id === resourceId &&
        p.userId !== authUser.id // Exclude current user
      );
    });

    console.log(`👀 ${resourceUsers.length} users viewing ${resourceType} ${resourceId}`);

    return c.json({
      users: resourceUsers,
      count: resourceUsers.length,
    });
  } catch (error) {
    console.error('❌ Error fetching resource presence:', error);
    return c.json({ error: 'Failed to fetch resource presence', details: error.message }, 500);
  }
});

// ==================== Collaboration Sessions ====================

/**
 * POST /collaboration/start
 * Start a collaboration session on a resource
 */
app.post(`${PREFIX}/collaboration/start`, async (c) => {
  try {
    const authUser = getAuthUser(c);
    const body = await c.req.json();

    const sessionId = `session:${body.resourceType}:${body.resourceId}:${generateId()}`;
    const session: CollaborationSession = {
      sessionId,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      companyId: authUser.companyId,
      activeUsers: [
        {
          userId: authUser.id,
          userName: authUser.name,
          joinedAt: new Date().toISOString(),
        },
      ],
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    const sessionKey = `collaboration:${authUser.companyId}:${sessionId}`;
    await kv.set(sessionKey, session);

    console.log(`🤝 Collaboration session started: ${authUser.name} on ${body.resourceType} ${body.resourceId}`);

    return c.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('❌ Error starting collaboration session:', error);
    return c.json({ error: 'Failed to start collaboration session', details: error.message }, 500);
  }
});

/**
 * POST /collaboration/join/:sessionId
 * Join an existing collaboration session
 */
app.post(`${PREFIX}/collaboration/join/:sessionId`, async (c) => {
  try {
    const authUser = getAuthUser(c);
    const sessionId = c.req.param('sessionId');

    const sessionKey = `collaboration:${authUser.companyId}:${sessionId}`;
    const session: CollaborationSession | null = await kv.get(sessionKey);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Add user if not already in session
    const existingUser = session.activeUsers.find((u) => u.userId === authUser.id);
    if (!existingUser) {
      session.activeUsers.push({
        userId: authUser.id,
        userName: authUser.name,
        joinedAt: new Date().toISOString(),
      });
    }

    session.lastActivity = new Date().toISOString();
    await kv.set(sessionKey, session);

    console.log(`👋 ${authUser.name} joined collaboration session ${sessionId}`);

    return c.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('❌ Error joining collaboration session:', error);
    return c.json({ error: 'Failed to join collaboration session', details: error.message }, 500);
  }
});

/**
 * POST /collaboration/leave/:sessionId
 * Leave a collaboration session
 */
app.post(`${PREFIX}/collaboration/leave/:sessionId`, async (c) => {
  try {
    const authUser = getAuthUser(c);
    const sessionId = c.req.param('sessionId');

    const sessionKey = `collaboration:${authUser.companyId}:${sessionId}`;
    const session: CollaborationSession | null = await kv.get(sessionKey);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Remove user from session
    session.activeUsers = session.activeUsers.filter((u) => u.userId !== authUser.id);
    session.lastActivity = new Date().toISOString();

    if (session.activeUsers.length === 0) {
      // Delete session if no users left
      await kv.del(sessionKey);
      console.log(`🗑️ Collaboration session deleted (no users): ${sessionId}`);
    } else {
      await kv.set(sessionKey, session);
      console.log(`👋 ${authUser.name} left collaboration session ${sessionId}`);
    }

    return c.json({
      success: true,
      session: session.activeUsers.length > 0 ? session : null,
    });
  } catch (error) {
    console.error('❌ Error leaving collaboration session:', error);
    return c.json({ error: 'Failed to leave collaboration session', details: error.message }, 500);
  }
});

// ==================== Activity Statistics ====================

/**
 * GET /activity/stats
 * Get activity statistics for the company
 */
app.get(`${PREFIX}/activity/stats`, async (c) => {
  try {
    const authUser = getAuthUser(c);

    const timelineKey = `activity-timeline:${authUser.companyId}`;
    const activities: ActivityEntry[] = (await kv.get(timelineKey)) || [];

    // Calculate stats
    const now = Date.now();
    const last24h = activities.filter((a) => {
      const activityTime = new Date(a.timestamp).getTime();
      return now - activityTime < 24 * 60 * 60 * 1000;
    });

    const actionCounts: Record<string, number> = {};
    const resourceTypeCounts: Record<string, number> = {};
    const userActivityCounts: Record<string, number> = {};

    last24h.forEach((a) => {
      actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
      resourceTypeCounts[a.resourceType] = (resourceTypeCounts[a.resourceType] || 0) + 1;
      userActivityCounts[a.userName] = (userActivityCounts[a.userName] || 0) + 1;
    });

    return c.json({
      totalActivities: activities.length,
      last24Hours: last24h.length,
      topActions: Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([action, count]) => ({ action, count })),
      topResourceTypes: Object.entries(resourceTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count })),
      topUsers: Object.entries(userActivityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([user, count]) => ({ user, count })),
    });
  } catch (error) {
    console.error('❌ Error fetching activity stats:', error);
    return c.json({ error: 'Failed to fetch activity stats', details: error.message }, 500);
  }
});

export default app;

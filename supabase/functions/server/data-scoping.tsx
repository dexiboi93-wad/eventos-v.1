/**
 * Data Scoping Utilities for Multi-Tenant SaaS
 * 
 * This module provides utilities to ensure all data is properly scoped to companies.
 * It prevents data leakage between companies and enforces strict data isolation.
 */

export interface CompanyScopedKey {
  prefix: string;
  companyId: string;
  resourceType: string;
  resourceId?: string;
}

/**
 * Generate a company-scoped KV key
 * 
 * Pattern: company:{companyId}:{resourceType}[:{resourceId}]
 * 
 * Examples:
 *   company:comp-123:events
 *   company:comp-123:event:evt-456
 *   company:comp-123:vendors
 *   company:comp-123:settings
 */
export function companyScopedKey(companyId: string, resourceType: string, resourceId?: string): string {
  const base = `company:${companyId}:${resourceType}`;
  return resourceId ? `${base}:${resourceId}` : base;
}

/**
 * Get all keys with a specific prefix (for company)
 */
export function companyPrefix(companyId: string): string {
  return `company:${companyId}:`;
}

/**
 * Resource type definitions
 */
export const RESOURCE_TYPES = {
  // Core Resources
  EVENTS: 'events',
  EVENT: 'event',
  VENDORS: 'vendors',
  VENDOR: 'vendor',
  VENUES: 'venues',
  VENUE: 'venue',
  CLIENTS: 'clients',
  CLIENT: 'client',
  
  // Team & Users
  TEAM_MEMBERS: 'team-members',
  INVITATIONS: 'invitations',
  
  // Settings
  SETTINGS: 'settings',
  INTEGRATIONS: 'integrations',
  STRIPE_KEYS: 'stripe-keys',
  GOOGLE_OAUTH: 'google-oauth',
  
  // Financial
  PAYMENTS: 'payments',
  INVOICES: 'invoices',
  EXPENSES: 'expenses',
  
  // CRM
  CRM_CONTACTS: 'crm-contacts',
  CRM_ACTIVITIES: 'crm-activities',
  CRM_DEALS: 'crm-deals',
  
  // Templates
  EMAIL_TEMPLATES: 'email-templates',
  CONTRACT_TEMPLATES: 'contract-templates',
  FORM_TEMPLATES: 'form-templates',
  
  // Webhooks & Notifications
  WEBHOOKS: 'webhooks',
  NOTIFICATIONS: 'notifications',
  
  // Calendar
  CALENDAR_EVENTS: 'calendar-events',
  CALENDAR_SYNC: 'calendar-sync',
  
  // Tasks & Phases
  PHASES: 'phases',
  TASKS: 'tasks',
  
  // Guest Management
  GUESTS: 'guests',
  GUEST_LISTS: 'guest-lists',
  
  // Documents
  DOCUMENTS: 'documents',
  CONTRACTS: 'contracts',
} as const;

/**
 * Data scoping service - provides methods to read/write company-scoped data
 */
export class DataScopingService {
  constructor(private kv: any) {}

  /**
   * Get company-scoped data
   */
  async get(companyId: string, resourceType: string, resourceId?: string): Promise<any> {
    const key = companyScopedKey(companyId, resourceType, resourceId);
    return await this.kv.get(key);
  }

  /**
   * Set company-scoped data
   */
  async set(companyId: string, resourceType: string, data: any, resourceId?: string): Promise<void> {
    const key = companyScopedKey(companyId, resourceType, resourceId);
    await this.kv.set(key, data);
  }

  /**
   * Delete company-scoped data
   */
  async delete(companyId: string, resourceType: string, resourceId?: string): Promise<void> {
    const key = companyScopedKey(companyId, resourceType, resourceId);
    await this.kv.del(key);
  }

  /**
   * Get all resources of a type for a company
   */
  async getByPrefix(companyId: string, resourceType: string): Promise<any[]> {
    const prefix = companyScopedKey(companyId, resourceType);
    const results = await this.kv.getByPrefix(prefix);
    return results || [];
  }

  /**
   * Migrate existing global data to company-scoped keys
   * This is for backwards compatibility
   */
  async migrateToCompanyScope(companyId: string, oldKey: string, newResourceType: string): Promise<boolean> {
    try {
      const oldData = await this.kv.get(oldKey);
      if (!oldData) {
        console.log(`[Migration] No data found for key: ${oldKey}`);
        return false;
      }

      const newKey = companyScopedKey(companyId, newResourceType);
      await this.kv.set(newKey, oldData);
      console.log(`[Migration] Migrated ${oldKey} → ${newKey}`);
      
      // Optionally delete old key after successful migration
      // await this.kv.del(oldKey);
      
      return true;
    } catch (err: any) {
      console.error(`[Migration] Failed to migrate ${oldKey}:`, err.message);
      return false;
    }
  }

  /**
   * Check if user's company has access to a resource
   */
  async verifyResourceAccess(
    userCompanyId: string, 
    resourceCompanyId: string
  ): Promise<boolean> {
    return userCompanyId === resourceCompanyId;
  }

  /**
   * Get company metadata
   */
  async getCompanySettings(companyId: string): Promise<any> {
    return await this.get(companyId, RESOURCE_TYPES.SETTINGS);
  }

  /**
   * Set company metadata
   */
  async setCompanySettings(companyId: string, settings: any): Promise<void> {
    await this.set(companyId, RESOURCE_TYPES.SETTINGS, settings);
  }

  /**
   * Get all team members for a company
   */
  async getTeamMembers(companyId: string): Promise<any[]> {
    const members = await this.get(companyId, RESOURCE_TYPES.TEAM_MEMBERS);
    return members || [];
  }

  /**
   * Add team member to company
   */
  async addTeamMember(companyId: string, userId: string, userProfile: any): Promise<void> {
    const members = await this.getTeamMembers(companyId);
    const updated = [...members, { userId, ...userProfile, addedAt: new Date().toISOString() }];
    await this.set(companyId, RESOURCE_TYPES.TEAM_MEMBERS, updated);
  }

  /**
   * Remove team member from company
   */
  async removeTeamMember(companyId: string, userId: string): Promise<void> {
    const members = await this.getTeamMembers(companyId);
    const updated = members.filter((m: any) => m.userId !== userId);
    await this.set(companyId, RESOURCE_TYPES.TEAM_MEMBERS, updated);
  }

  /**
   * Get events for a company (with optional filtering)
   */
  async getEvents(companyId: string): Promise<any[]> {
    const events = await this.get(companyId, RESOURCE_TYPES.EVENTS);
    return events || [];
  }

  /**
   * Set events for a company
   */
  async setEvents(companyId: string, events: any[]): Promise<void> {
    await this.set(companyId, RESOURCE_TYPES.EVENTS, events);
  }

  /**
   * Get vendors for a company
   */
  async getVendors(companyId: string): Promise<any[]> {
    const vendors = await this.get(companyId, RESOURCE_TYPES.VENDORS);
    return vendors || [];
  }

  /**
   * Set vendors for a company
   */
  async setVendors(companyId: string, vendors: any[]): Promise<void> {
    await this.set(companyId, RESOURCE_TYPES.VENDORS, vendors);
  }

  /**
   * Get venues for a company
   */
  async getVenues(companyId: string): Promise<any[]> {
    const venues = await this.get(companyId, RESOURCE_TYPES.VENUES);
    return venues || [];
  }

  /**
   * Set venues for a company
   */
  async setVenues(companyId: string, venues: any[]): Promise<void> {
    await this.set(companyId, RESOURCE_TYPES.VENUES, venues);
  }

  /**
   * Get phases for a company
   */
  async getPhases(companyId: string): Promise<any[]> {
    const phases = await this.get(companyId, RESOURCE_TYPES.PHASES);
    return phases || [];
  }

  /**
   * Set phases for a company
   */
  async setPhases(companyId: string, phases: any[]): Promise<void> {
    await this.set(companyId, RESOURCE_TYPES.PHASES, phases);
  }
}

/**
 * Create a new data scoping service instance
 */
export function createDataScopingService(kv: any): DataScopingService {
  return new DataScopingService(kv);
}

/**
 * Legacy key migration helper
 * Maps old global keys to new company-scoped resource types
 */
export const LEGACY_KEY_MIGRATIONS: Record<string, string> = {
  'events': RESOURCE_TYPES.EVENTS,
  'vendors': RESOURCE_TYPES.VENDORS,
  'venues': RESOURCE_TYPES.VENUES,
  'phases': RESOURCE_TYPES.PHASES,
  'app_settings_default': RESOURCE_TYPES.SETTINGS,
  'stripe_keys_default': RESOURCE_TYPES.STRIPE_KEYS,
};

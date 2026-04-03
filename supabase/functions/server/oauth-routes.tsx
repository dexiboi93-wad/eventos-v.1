import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { createDataScopingService, RESOURCE_TYPES } from "./data-scoping.tsx";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Initialize data scoping service
const dataService = createDataScopingService(kv);

/**
 * Create OAuth routes for Google Workspace and Microsoft 365 integration
 */
export function createOAuthRoutes(prefix: string) {
  const app = new Hono();

  // ═══════════════════════════════════════════════════════════════
  // GOOGLE WORKSPACE OAUTH
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /oauth/google/authorize
   * Initiates Google OAuth flow
   */
  app.get(`${prefix}/oauth/google/authorize`, async (c) => {
    try {
      const googleClientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI') || 'http://localhost:5173/oauth/callback';

      if (!googleClientId) {
        return c.json({ error: 'Google OAuth is not configured. Please set GOOGLE_OAUTH_CLIENT_ID environment variable.' }, 500);
      }

      const scope = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/admin.directory.user.readonly', // Read employee directory
        'https://www.googleapis.com/auth/admin.directory.domain.readonly', // Read domain info
        'https://www.googleapis.com/auth/calendar.readonly', // Read calendars
        'https://www.googleapis.com/auth/drive.file', // Create/manage Drive folders
      ].join(' ');

      const state = `google-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Store state in KV for verification (expires in 10 minutes)
      await kv.set(`oauth_state:${state}`, {
        provider: 'google',
        createdAt: new Date().toISOString(),
      });

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', googleClientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      return c.redirect(authUrl.toString());
    } catch (error: any) {
      console.error('[OAuth] Google authorize error:', error.message);
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * POST /oauth/google/callback
   * Handles Google OAuth callback, exchanges code for tokens, fetches workspace data
   */
  app.post(`${prefix}/oauth/google/callback`, async (c) => {
    try {
      const { code, state } = await c.req.json();

      if (!code || !state) {
        return c.json({ error: 'Missing code or state parameter' }, 400);
      }

      // Verify state
      const storedState = await kv.get(`oauth_state:${state}`);
      if (!storedState || storedState.provider !== 'google') {
        return c.json({ error: 'Invalid state parameter' }, 400);
      }

      // Delete used state
      await kv.del(`oauth_state:${state}`);

      const googleClientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      const googleClientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
      const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI') || 'http://localhost:5173/oauth/callback';

      if (!googleClientId || !googleClientSecret) {
        return c.json({ error: 'Google OAuth credentials not configured' }, 500);
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('[OAuth] Google token exchange failed:', error);
        return c.json({ error: 'Failed to exchange authorization code' }, 400);
      }

      const tokens = await tokenResponse.json();
      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token;

      // Fetch user info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      const userInfo = await userInfoResponse.json();

      // Fetch company/domain info
      const domainResponse = await fetch('https://admin.googleapis.com/admin/directory/v1/domains', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let companyDomain = userInfo.email?.split('@')[1] || '';
      let companyName = companyDomain.split('.')[0] || 'Company';
      
      if (domainResponse.ok) {
        const domainData = await domainResponse.json();
        if (domainData.domains && domainData.domains.length > 0) {
          companyDomain = domainData.domains[0].domainName;
          companyName = domainData.domains[0].domainName.split('.')[0];
        }
      }

      // Fetch employee directory
      const employeesResponse = await fetch('https://admin.googleapis.com/admin/directory/v1/users?domain=' + companyDomain, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let employees: any[] = [];
      if (employeesResponse.ok) {
        const employeesData = await employeesResponse.json();
        employees = (employeesData.users || []).map((user: any) => ({
          id: user.id,
          email: user.primaryEmail,
          name: user.name.fullName,
          department: user.orgUnitPath,
          jobTitle: user.organizations?.[0]?.title || '',
          photoUrl: user.thumbnailPhotoUrl,
        }));
      }

      // Fetch calendars
      const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let calendars: any[] = [];
      if (calendarsResponse.ok) {
        const calendarsData = await calendarsResponse.json();
        calendars = (calendarsData.items || []).map((cal: any) => ({
          id: cal.id,
          name: cal.summary,
          description: cal.description || '',
          selected: false,
        }));
      }

      return c.json({
        success: true,
        companyInfo: {
          name: companyName,
          domain: companyDomain,
          logo: null,
        },
        employees,
        calendars,
        accessToken,
        refreshToken,
      });

    } catch (error: any) {
      console.error('[OAuth] Google callback error:', error.message);
      return c.json({ error: `OAuth callback failed: ${error.message}` }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // MICROSOFT 365 OAUTH
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /oauth/microsoft/authorize
   * Initiates Microsoft OAuth flow
   */
  app.get(`${prefix}/oauth/microsoft/authorize`, async (c) => {
    try {
      const msClientId = Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID');
      const redirectUri = Deno.env.get('MICROSOFT_OAUTH_REDIRECT_URI') || 'http://localhost:5173/oauth/callback';

      if (!msClientId) {
        return c.json({ error: 'Microsoft OAuth is not configured. Please set MICROSOFT_OAUTH_CLIENT_ID environment variable.' }, 500);
      }

      const scope = [
        'openid',
        'email',
        'profile',
        'User.Read.All', // Read user directory
        'Organization.Read.All', // Read organization info
        'Calendars.Read', // Read calendars
        'Files.ReadWrite', // OneDrive access
      ].join(' ');

      const state = `microsoft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Store state in KV for verification
      await kv.set(`oauth_state:${state}`, {
        provider: 'microsoft',
        createdAt: new Date().toISOString(),
      });

      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id', msClientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('response_mode', 'query');

      return c.redirect(authUrl.toString());
    } catch (error: any) {
      console.error('[OAuth] Microsoft authorize error:', error.message);
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * POST /oauth/microsoft/callback
   * Handles Microsoft OAuth callback
   */
  app.post(`${prefix}/oauth/microsoft/callback`, async (c) => {
    try {
      const { code, state } = await c.req.json();

      if (!code || !state) {
        return c.json({ error: 'Missing code or state parameter' }, 400);
      }

      // Verify state
      const storedState = await kv.get(`oauth_state:${state}`);
      if (!storedState || storedState.provider !== 'microsoft') {
        return c.json({ error: 'Invalid state parameter' }, 400);
      }

      // Delete used state
      await kv.del(`oauth_state:${state}`);

      const msClientId = Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID');
      const msClientSecret = Deno.env.get('MICROSOFT_OAUTH_CLIENT_SECRET');
      const redirectUri = Deno.env.get('MICROSOFT_OAUTH_REDIRECT_URI') || 'http://localhost:5173/oauth/callback';

      if (!msClientId || !msClientSecret) {
        return c.json({ error: 'Microsoft OAuth credentials not configured' }, 500);
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: msClientId,
          client_secret: msClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('[OAuth] Microsoft token exchange failed:', error);
        return c.json({ error: 'Failed to exchange authorization code' }, 400);
      }

      const tokens = await tokenResponse.json();
      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token;

      // Fetch user info
      const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      const userInfo = await userInfoResponse.json();

      // Fetch organization info
      const orgResponse = await fetch('https://graph.microsoft.com/v1.0/organization', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let companyName = 'Company';
      let companyDomain = userInfo.userPrincipalName?.split('@')[1] || '';
      let companyLogo = null;

      if (orgResponse.ok) {
        const orgData = await orgResponse.json();
        if (orgData.value && orgData.value.length > 0) {
          companyName = orgData.value[0].displayName || companyName;
          if (orgData.value[0].verifiedDomains && orgData.value[0].verifiedDomains.length > 0) {
            companyDomain = orgData.value[0].verifiedDomains.find((d: any) => d.isDefault)?.name || companyDomain;
          }
        }
      }

      // Fetch employee directory
      const employeesResponse = await fetch('https://graph.microsoft.com/v1.0/users', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let employees: any[] = [];
      if (employeesResponse.ok) {
        const employeesData = await employeesResponse.json();
        employees = (employeesData.value || []).map((user: any) => ({
          id: user.id,
          email: user.userPrincipalName,
          name: user.displayName,
          department: user.department,
          jobTitle: user.jobTitle,
          photoUrl: null, // Can be fetched separately with /users/{id}/photo
        }));
      }

      // Fetch calendars
      const calendarsResponse = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let calendars: any[] = [];
      if (calendarsResponse.ok) {
        const calendarsData = await calendarsResponse.json();
        calendars = (calendarsData.value || []).map((cal: any) => ({
          id: cal.id,
          name: cal.name,
          description: '',
          selected: false,
        }));
      }

      return c.json({
        success: true,
        companyInfo: {
          name: companyName,
          domain: companyDomain,
          logo: companyLogo,
        },
        employees,
        calendars,
        accessToken,
        refreshToken,
      });

    } catch (error: any) {
      console.error('[OAuth] Microsoft callback error:', error.message);
      return c.json({ error: `OAuth callback failed: ${error.message}` }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPLETE ONBOARDING
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /oauth/complete-onboarding
   * Completes workspace onboarding: creates company, mastermind accounts, imports employees, sets up integrations
   */
  app.post(`${prefix}/oauth/complete-onboarding`, async (c) => {
    try {
      const {
        provider,
        companyInfo,
        primaryEmail,
        secondaryEmail,
        employees,
        calendars,
        documentStorage,
        portalConfig,
        accessToken,
        refreshToken,
      } = await c.req.json();

      if (!provider || !companyInfo || !primaryEmail) {
        return c.json({ error: 'Missing required fields' }, 400);
      }

      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

      // Generate company ID
      const companyId = `company-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Generate temporary password for mastermind accounts
      const tempPassword = `Temp${Math.random().toString(36).substr(2, 12)}!`;

      // Create primary mastermind account
      const { data: primaryUser, error: primaryError } = await adminSupabase.auth.admin.createUser({
        email: primaryEmail,
        password: tempPassword,
        user_metadata: { 
          name: companyInfo.name + ' Admin',
          companyName: companyInfo.name,
        },
        email_confirm: true,
      });

      if (primaryError) {
        console.error('[OAuth] Failed to create primary mastermind:', primaryError.message);
        return c.json({ error: `Failed to create primary mastermind: ${primaryError.message}` }, 400);
      }

      // Create primary user profile
      await kv.set(`user_profile_${primaryUser.user.id}`, {
        userId: primaryUser.user.id,
        email: primaryEmail,
        name: companyInfo.name + ' Admin',
        role: 'Mastermind',
        companyId,
        companyName: companyInfo.name,
        createdAt: new Date().toISOString(),
      });

      // Create secondary mastermind if provided
      let secondaryUserId = null;
      if (secondaryEmail) {
        const { data: secondaryUser, error: secondaryError } = await adminSupabase.auth.admin.createUser({
          email: secondaryEmail,
          password: tempPassword,
          user_metadata: { 
            name: companyInfo.name + ' Backup Admin',
            companyName: companyInfo.name,
          },
          email_confirm: true,
        });

        if (!secondaryError && secondaryUser) {
          secondaryUserId = secondaryUser.user.id;
          await kv.set(`user_profile_${secondaryUser.user.id}`, {
            userId: secondaryUser.user.id,
            email: secondaryEmail,
            name: companyInfo.name + ' Backup Admin',
            role: 'Mastermind',
            companyId,
            companyName: companyInfo.name,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Initialize company settings
      await dataService.setCompanySettings(companyId, {
        companyName: companyInfo.name,
        companyDomain: companyInfo.domain,
        ownerId: primaryUser.user.id,
        createdAt: new Date().toISOString(),
        oauthProvider: provider,
        portalSubdomain: portalConfig.subdomain,
        customDomain: portalConfig.customDomain,
      });

      // Store OAuth credentials (encrypted in production!)
      await kv.set(`company:${companyId}:oauth_credentials`, {
        provider,
        accessToken,
        refreshToken,
        createdAt: new Date().toISOString(),
      });

      // Initialize team members with masterminds
      const teamMembers: any[] = [
        {
          userId: primaryUser.user.id,
          email: primaryEmail,
          name: companyInfo.name + ' Admin',
          role: 'Mastermind',
          addedAt: new Date().toISOString(),
        },
      ];

      if (secondaryUserId) {
        teamMembers.push({
          userId: secondaryUserId,
          email: secondaryEmail,
          name: companyInfo.name + ' Backup Admin',
          role: 'Mastermind',
          addedAt: new Date().toISOString(),
        });
      }

      // Create accounts for selected employees
      for (const employee of employees) {
        try {
          const empPassword = `Temp${Math.random().toString(36).substr(2, 12)}!`;
          const { data: empUser, error: empError } = await adminSupabase.auth.admin.createUser({
            email: employee.email,
            password: empPassword,
            user_metadata: { 
              name: employee.name,
              companyName: companyInfo.name,
            },
            email_confirm: true,
          });

          if (!empError && empUser) {
            await kv.set(`user_profile_${empUser.user.id}`, {
              userId: empUser.user.id,
              email: employee.email,
              name: employee.name,
              role: employee.role,
              companyId,
              companyName: companyInfo.name,
              department: employee.department,
              jobTitle: employee.jobTitle,
              createdAt: new Date().toISOString(),
            });

            teamMembers.push({
              userId: empUser.user.id,
              email: employee.email,
              name: employee.name,
              role: employee.role,
              department: employee.department,
              jobTitle: employee.jobTitle,
              addedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error(`[OAuth] Failed to create employee account for ${employee.email}:`, error);
          // Continue with other employees
        }
      }

      await dataService.set(companyId, RESOURCE_TYPES.TEAM_MEMBERS, teamMembers);

      // Store calendar sync configuration
      await kv.set(`company:${companyId}:calendar_sync`, {
        provider,
        calendars: calendars.map((cal: any) => ({
          id: cal.id,
          name: cal.name,
        })),
        enabled: true,
      });

      // Store document storage configuration
      await kv.set(`company:${companyId}:document_storage`, {
        provider: provider === 'google' ? 'google_drive' : 'onedrive',
        folderName: documentStorage.folderName,
        createSubfolders: documentStorage.createSubfolders,
        folderId: null, // Will be created on first use
      });

      console.log(`[OAuth] Company onboarding complete: ${companyId} (${companyInfo.name})`);

      return c.json({
        success: true,
        companyId,
        primaryEmail,
        tempPassword, // Send this via secure email in production
        message: 'Workspace setup complete! Please sign in with your credentials.',
      });

    } catch (error: any) {
      console.error('[OAuth] Onboarding completion error:', error.message);
      return c.json({ error: `Onboarding failed: ${error.message}` }, 500);
    }
  });

  return app;
}

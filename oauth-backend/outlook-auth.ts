// Microsoft Outlook OAuth Implementation

import {
  generateState,
  storeState,
  validateState,
  storeTokens,
  getTokens,
  corsHeaders,
  getSupabaseClient,
  buildAuthUrl,
  exchangeCodeForToken,
  isTokenExpired,
  refreshAccessToken,
} from './utils.ts';

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_SCOPES = [
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
].join(' ');

/**
 * Generate Microsoft OAuth authorization URL
 * GET /outlook/auth-url/:companyId
 */
export async function handleOutlookAuthUrl(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: 'Microsoft OAuth not configured' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  const state = generateState();
  await storeState(supabase, state, companyId, 'outlook');

  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/outlook/callback`;

  const authUrl = buildAuthUrl(MICROSOFT_AUTH_URL, {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: MICROSOFT_SCOPES,
    response_mode: 'query',
    state,
  });

  return new Response(
    JSON.stringify({ authUrl }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
  );
}

/**
 * Handle Microsoft OAuth callback
 * GET /outlook/callback?code=...&state=...
 */
export async function handleOutlookCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error === 'access_denied') {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Cancelled</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'outlook-auth-error', error: 'User cancelled authorization' }, '*');
            window.close();
          </script>
        </body>
      </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  const supabase = getSupabaseClient(req);
  const companyId = await validateState(supabase, state, 'outlook');
  
  if (!companyId) {
    return new Response('Invalid or expired state token', { status: 400 });
  }

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/outlook/callback`;

  try {
    const tokens = await exchangeCodeForToken(
      MICROSOFT_TOKEN_URL,
      {
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      clientId,
      clientSecret
    );

    // Get user email from Microsoft Graph
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    const userInfo = await userInfoResponse.json();

    await storeTokens(supabase, companyId, 'outlook', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_email: userInfo.mail || userInfo.userPrincipalName,
      scope: tokens.scope,
    });

    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Successful</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'outlook-auth-success', 
              email: '${userInfo.mail || userInfo.userPrincipalName}' 
            }, '*');
            window.close();
          </script>
        </body>
      </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Outlook OAuth error:', error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'outlook-auth-error', 
              error: '${error.message}' 
            }, '*');
            window.close();
          </script>
        </body>
      </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/**
 * Get Outlook connection status
 * GET /outlook/status/:companyId
 */
export async function handleOutlookStatus(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  const tokens = await getTokens(supabase, companyId, 'outlook');

  if (!tokens) {
    return new Response(
      JSON.stringify({ configured: false }),
      { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      configured: true,
      authenticated: true,
      userEmail: tokens.user_email,
      lastSync: tokens.updated_at,
      tokenExpired: isTokenExpired(tokens.expires_at),
    }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
  );
}

/**
 * Get valid Outlook access token (refreshes if needed)
 */
export async function getValidOutlookToken(supabase: any, companyId: string): Promise<string | null> {
  const tokens = await getTokens(supabase, companyId, 'outlook');
  
  if (!tokens) {
    return null;
  }

  if (!isTokenExpired(tokens.expires_at)) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    return null;
  }

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;

  try {
    const newTokens = await refreshAccessToken(
      MICROSOFT_TOKEN_URL,
      tokens.refresh_token,
      clientId,
      clientSecret
    );

    await storeTokens(supabase, companyId, 'outlook', {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expires_in: newTokens.expires_in,
      user_email: tokens.user_email,
      scope: newTokens.scope,
    });

    return newTokens.access_token;
  } catch (error) {
    console.error('Failed to refresh Outlook token:', error);
    return null;
  }
}

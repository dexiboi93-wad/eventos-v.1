// Google Calendar OAuth Implementation

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

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * Generate Google OAuth authorization URL
 * GET /google/auth-url/:companyId
 */
export async function handleGoogleAuthUrl(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: 'Google OAuth not configured' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  // Generate state token for CSRF protection
  const state = generateState();
  await storeState(supabase, state, companyId, 'google');

  // Build redirect URI
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/google/callback`;

  // Build authorization URL
  const authUrl = buildAuthUrl(GOOGLE_AUTH_URL, {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return new Response(
    JSON.stringify({ authUrl }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
  );
}

/**
 * Handle Google OAuth callback
 * GET /google/callback?code=...&state=...
 */
export async function handleGoogleCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle user cancellation
  if (error === 'access_denied') {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Cancelled</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'google-auth-error', error: 'User cancelled authorization' }, '*');
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

  // Validate state token
  const companyId = await validateState(supabase, state, 'google');
  if (!companyId) {
    return new Response('Invalid or expired state token', { status: 400 });
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/google/callback`;

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForToken(
      GOOGLE_TOKEN_URL,
      {
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      clientId,
      clientSecret
    );

    // Get user email from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    const userInfo = await userInfoResponse.json();

    // Store tokens
    await storeTokens(supabase, companyId, 'google', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_email: userInfo.email,
      scope: tokens.scope,
    });

    // Return success page that posts message to opener
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Successful</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'google-auth-success', 
              email: '${userInfo.email}' 
            }, '*');
            window.close();
          </script>
        </body>
      </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Google OAuth error:', error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'google-auth-error', 
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
 * Get Google Calendar connection status
 * GET /google/status/:companyId
 */
export async function handleGoogleStatus(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  const tokens = await getTokens(supabase, companyId, 'google');

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
 * Refresh Google access token
 * POST /google/refresh/:companyId
 */
export async function handleGoogleRefresh(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  const tokens = await getTokens(supabase, companyId, 'google');

  if (!tokens || !tokens.refresh_token) {
    return new Response(
      JSON.stringify({ error: 'No refresh token available' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  try {
    const newTokens = await refreshAccessToken(
      GOOGLE_TOKEN_URL,
      tokens.refresh_token,
      clientId,
      clientSecret
    );

    await storeTokens(supabase, companyId, 'google', {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expires_in: newTokens.expires_in,
      user_email: tokens.user_email,
      scope: newTokens.scope,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get valid access token (refreshes if needed)
 */
export async function getValidGoogleToken(supabase: any, companyId: string): Promise<string | null> {
  const tokens = await getTokens(supabase, companyId, 'google');
  
  if (!tokens) {
    return null;
  }

  // If token is not expired, return it
  if (!isTokenExpired(tokens.expires_at)) {
    return tokens.access_token;
  }

  // Token expired, refresh it
  if (!tokens.refresh_token) {
    return null;
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  try {
    const newTokens = await refreshAccessToken(
      GOOGLE_TOKEN_URL,
      tokens.refresh_token,
      clientId,
      clientSecret
    );

    await storeTokens(supabase, companyId, 'google', {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expires_in: newTokens.expires_in,
      user_email: tokens.user_email,
      scope: newTokens.scope,
    });

    return newTokens.access_token;
  } catch (error) {
    console.error('Failed to refresh Google token:', error);
    return null;
  }
}

// Template for implementing Slack, Zoom, and QuickBooks OAuth
// Copy this pattern for each integration

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

// ==========================================
// SLACK OAUTH IMPLEMENTATION
// ==========================================

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_SCOPES = [
  'channels:read',
  'chat:write',
  'users:read',
  'users:read.email',
].join(',');

export async function handleSlackAuthUrl(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  
  const clientId = Deno.env.get('SLACK_CLIENT_ID');
  const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: 'Slack OAuth not configured' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  const state = generateState();
  await storeState(supabase, state, companyId, 'slack');

  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/slack/callback`;

  const authUrl = buildAuthUrl(SLACK_AUTH_URL, {
    client_id: clientId,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUri,
    state,
    user_scope: 'users:read', // Optional user-level scopes
  });

  return new Response(
    JSON.stringify({ authUrl }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
  );
}

export async function handleSlackCallback(req: Request) {
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
            window.opener.postMessage({ type: 'slack-auth-error', error: 'User cancelled authorization' }, '*');
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
  const companyId = await validateState(supabase, state, 'slack');
  
  if (!companyId) {
    return new Response('Invalid or expired state token', { status: 400 });
  }

  const clientId = Deno.env.get('SLACK_CLIENT_ID')!;
  const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET')!;
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/slack/callback`;

  try {
    // Slack uses different token exchange format
    const response = await fetch(SLACK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Slack authentication failed');
    }

    // Get user info from Slack
    const userInfoResponse = await fetch('https://slack.com/api/users.info', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${data.authed_user.access_token}`,
      },
    });
    const userInfo = await userInfoResponse.json();

    await storeTokens(supabase, companyId, 'slack', {
      access_token: data.access_token,
      user_email: userInfo.user?.profile?.email || data.team.name,
      scope: data.scope,
      // Slack doesn't use refresh tokens - tokens don't expire
    });

    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Successful</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'slack-auth-success', 
              email: '${data.team.name}' 
            }, '*');
            window.close();
          </script>
        </body>
      </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Slack OAuth error:', error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'slack-auth-error', 
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

// ==========================================
// ZOOM OAUTH IMPLEMENTATION
// ==========================================

const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

export async function handleZoomAuthUrl(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  
  const clientId = Deno.env.get('ZOOM_CLIENT_ID');
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: 'Zoom OAuth not configured' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  const state = generateState();
  await storeState(supabase, state, companyId, 'zoom');

  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/zoom/callback`;

  const authUrl = buildAuthUrl(ZOOM_AUTH_URL, {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return new Response(
    JSON.stringify({ authUrl }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
  );
}

export async function handleZoomCallback(req: Request) {
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
            window.opener.postMessage({ type: 'zoom-auth-error', error: 'User cancelled authorization' }, '*');
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
  const companyId = await validateState(supabase, state, 'zoom');
  
  if (!companyId) {
    return new Response('Invalid or expired state token', { status: 400 });
  }

  const clientId = Deno.env.get('ZOOM_CLIENT_ID')!;
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')!;
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/zoom/callback`;

  try {
    const tokens = await exchangeCodeForToken(
      ZOOM_TOKEN_URL,
      {
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      clientId,
      clientSecret
    );

    // Get user info from Zoom
    const userInfoResponse = await fetch('https://api.zoom.us/v2/users/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    const userInfo = await userInfoResponse.json();

    await storeTokens(supabase, companyId, 'zoom', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_email: userInfo.email,
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
              type: 'zoom-auth-success', 
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
    console.error('Zoom OAuth error:', error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'zoom-auth-error', 
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

// ==========================================
// QUICKBOOKS OAUTH IMPLEMENTATION
// ==========================================

const QUICKBOOKS_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QUICKBOOKS_SCOPES = [
  'com.intuit.quickbooks.accounting',
].join(' ');

export async function handleQuickBooksAuthUrl(req: Request, companyId: string) {
  const supabase = getSupabaseClient(req);
  
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: 'QuickBooks OAuth not configured' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  const state = generateState();
  await storeState(supabase, state, companyId, 'quickbooks');

  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/quickbooks/callback`;

  const authUrl = buildAuthUrl(QUICKBOOKS_AUTH_URL, {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: QUICKBOOKS_SCOPES,
    state,
  });

  return new Response(
    JSON.stringify({ authUrl }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
  );
}

export async function handleQuickBooksCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId'); // QuickBooks company ID
  const error = url.searchParams.get('error');

  if (error === 'access_denied') {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Cancelled</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'quickbooks-auth-error', error: 'User cancelled authorization' }, '*');
            window.close();
          </script>
        </body>
      </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (!code || !state || !realmId) {
    return new Response('Missing code, state, or realmId', { status: 400 });
  }

  const supabase = getSupabaseClient(req);
  const companyId = await validateState(supabase, state, 'quickbooks');
  
  if (!companyId) {
    return new Response('Invalid or expired state token', { status: 400 });
  }

  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')!;
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')!;
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const functionName = 'make-server-6c8332a9';
  const redirectUri = `${baseUrl}/functions/v1/${functionName}/quickbooks/callback`;

  try {
    const tokens = await exchangeCodeForToken(
      QUICKBOOKS_TOKEN_URL,
      {
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      clientId,
      clientSecret
    );

    // Store realm ID in metadata
    await storeTokens(supabase, companyId, 'quickbooks', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_email: `QuickBooks Company ${realmId}`,
      scope: tokens.scope,
    });

    // Store realmId separately for QuickBooks API calls
    await supabase.from('oauth_tokens')
      .update({ metadata: { realmId } })
      .eq('company_id', companyId)
      .eq('service', 'quickbooks');

    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Successful</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'quickbooks-auth-success', 
              email: 'QuickBooks Company ${realmId}' 
            }, '*');
            window.close();
          </script>
        </body>
      </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('QuickBooks OAuth error:', error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'quickbooks-auth-error', 
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

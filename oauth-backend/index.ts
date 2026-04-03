// Main Edge Function Router for OAuth Integrations
// Deploy this as: supabase/functions/make-server-6c8332a9/index.ts

import { corsHeaders } from './utils.ts';
import {
  handleGoogleAuthUrl,
  handleGoogleCallback,
  handleGoogleStatus,
  handleGoogleRefresh,
} from './google-auth.ts';
import {
  handleOutlookAuthUrl,
  handleOutlookCallback,
  handleOutlookStatus,
} from './outlook-auth.ts';

/**
 * Main request handler with routing
 */
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace('/make-server-6c8332a9', '');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  console.log(`${req.method} ${path}`);

  try {
    // ========== GOOGLE CALENDAR ROUTES ==========
    
    // GET /google/auth-url/:companyId
    if (path.match(/^\/google\/auth-url\/(.+)$/)) {
      const companyId = path.split('/')[3];
      return await handleGoogleAuthUrl(req, companyId);
    }

    // GET /google/callback
    if (path === '/google/callback') {
      return await handleGoogleCallback(req);
    }

    // GET /google/status/:companyId
    if (path.match(/^\/google\/status\/(.+)$/)) {
      const companyId = path.split('/')[3];
      return await handleGoogleStatus(req, companyId);
    }

    // POST /google/refresh/:companyId
    if (path.match(/^\/google\/refresh\/(.+)$/)) {
      const companyId = path.split('/')[3];
      return await handleGoogleRefresh(req, companyId);
    }

    // ========== MICROSOFT OUTLOOK ROUTES ==========
    
    // GET /outlook/auth-url/:companyId
    if (path.match(/^\/outlook\/auth-url\/(.+)$/)) {
      const companyId = path.split('/')[3];
      return await handleOutlookAuthUrl(req, companyId);
    }

    // GET /outlook/callback
    if (path === '/outlook/callback') {
      return await handleOutlookCallback(req);
    }

    // GET /outlook/status/:companyId
    if (path.match(/^\/outlook\/status\/(.+)$/)) {
      const companyId = path.split('/')[3];
      return await handleOutlookStatus(req, companyId);
    }

    // ========== SLACK ROUTES ==========
    
    // GET /slack/auth-url/:companyId
    if (path.match(/^\/slack\/auth-url\/(.+)$/)) {
      return new Response(
        JSON.stringify({ error: 'Slack OAuth not yet implemented' }),
        { status: 501, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // GET /slack/callback
    if (path === '/slack/callback') {
      return new Response(
        JSON.stringify({ error: 'Slack OAuth not yet implemented' }),
        { status: 501, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // ========== ZOOM ROUTES ==========
    
    // GET /zoom/auth-url/:companyId
    if (path.match(/^\/zoom\/auth-url\/(.+)$/)) {
      return new Response(
        JSON.stringify({ error: 'Zoom OAuth not yet implemented' }),
        { status: 501, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // GET /zoom/callback
    if (path === '/zoom/callback') {
      return new Response(
        JSON.stringify({ error: 'Zoom OAuth not yet implemented' }),
        { status: 501, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // ========== QUICKBOOKS ROUTES ==========
    
    // GET /quickbooks/auth-url/:companyId
    if (path.match(/^\/quickbooks\/auth-url\/(.+)$/)) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks OAuth not yet implemented' }),
        { status: 501, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // GET /quickbooks/callback
    if (path === '/quickbooks/callback') {
      return new Response(
        JSON.stringify({ error: 'QuickBooks OAuth not yet implemented' }),
        { status: 501, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // ========== DEFAULT ROUTE ==========
    
    return new Response(
      JSON.stringify({ 
        error: 'Not found',
        path,
        availableRoutes: [
          '/google/auth-url/:companyId',
          '/google/callback',
          '/google/status/:companyId',
          '/google/refresh/:companyId',
          '/outlook/auth-url/:companyId',
          '/outlook/callback',
          '/outlook/status/:companyId',
        ]
      }),
      { status: 404, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }
});

/* 
 * DEPLOYMENT INSTRUCTIONS:
 * 
 * 1. Create the function directory:
 *    mkdir -p supabase/functions/make-server-6c8332a9
 * 
 * 2. Copy all files to the directory:
 *    - index.ts (this file)
 *    - utils.ts
 *    - google-auth.ts
 *    - outlook-auth.ts
 * 
 * 3. Set environment secrets:
 *    supabase secrets set GOOGLE_CLIENT_ID=your_id
 *    supabase secrets set GOOGLE_CLIENT_SECRET=your_secret
 *    supabase secrets set MICROSOFT_CLIENT_ID=your_id
 *    supabase secrets set MICROSOFT_CLIENT_SECRET=your_secret
 * 
 * 4. Deploy the function:
 *    supabase functions deploy make-server-6c8332a9
 * 
 * 5. Test the endpoints:
 *    curl https://YOUR_PROJECT.supabase.co/functions/v1/make-server-6c8332a9/google/auth-url/default
 */

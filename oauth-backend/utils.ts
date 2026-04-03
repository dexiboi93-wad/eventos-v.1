// Shared utilities for OAuth implementations

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Generate a cryptographically secure random state token
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store OAuth state in database for CSRF protection
 */
export async function storeState(
  supabase: any,
  state: string,
  companyId: string,
  service: string
): Promise<void> {
  const { error } = await supabase.from('oauth_states').insert({
    state,
    company_id: companyId,
    service,
  });

  if (error) {
    throw new Error(`Failed to store state: ${error.message}`);
  }
}

/**
 * Validate and consume OAuth state token
 */
export async function validateState(
  supabase: any,
  state: string,
  service: string
): Promise<string | null> {
  // Get and delete state in one transaction
  const { data, error } = await supabase
    .from('oauth_states')
    .select('company_id, expires_at')
    .eq('state', state)
    .eq('service', service)
    .single();

  if (error || !data) {
    return null;
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Delete used state
  await supabase.from('oauth_states').delete().eq('state', state);

  return data.company_id;
}

/**
 * Store OAuth tokens in database
 */
export async function storeTokens(
  supabase: any,
  companyId: string,
  service: string,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user_email?: string;
    scope?: string;
  }
): Promise<void> {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const { error } = await supabase.from('oauth_tokens').upsert(
    {
      company_id: companyId,
      service,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      user_email: tokens.user_email,
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'company_id,service',
    }
  );

  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }
}

/**
 * Get OAuth tokens from database
 */
export async function getTokens(
  supabase: any,
  companyId: string,
  service: string
): Promise<any> {
  const { data, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('company_id', companyId)
    .eq('service', service)
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Check if access token is expired
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) <= new Date();
}

/**
 * Create CORS headers
 */
export function corsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

/**
 * Get Supabase client
 */
export function getSupabaseClient(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Build OAuth authorization URL
 */
export function buildAuthUrl(
  baseUrl: string,
  params: Record<string, string>
): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  tokenUrl: string,
  params: Record<string, string>,
  clientId: string,
  clientSecret: string
): Promise<any> {
  const body = new URLSearchParams(params);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return await response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  tokenUrl: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<any> {
  return await exchangeCodeForToken(
    tokenUrl,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    clientId,
    clientSecret
  );
}

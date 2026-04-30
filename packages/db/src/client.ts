import { createClient } from '@supabase/supabase-js';

/**
 * Browser client — uses anon key, safe for client components.
 * RLS enforced via JWT.
 */
export function browserClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(url, anonKey);
}

/**
 * Server client — for Server Components and Server Actions.
 * Uses anon key but reads cookies for session context.
 * NEVER exposes service role key.
 */
export function serverClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Service client — ONLY for Edge Functions and privileged Route Handlers.
 * Bypasses RLS. NEVER use in client code or components.
 */
export function serviceClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey);
}

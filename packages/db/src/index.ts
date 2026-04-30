/**
 * @precision/db — Supabase typed client & helpers
 *
 * Provides three client constructors:
 *  - browserClient()  → for client components (anon key)
 *  - serverClient()   → for server components / actions (reads cookies)
 *  - serviceClient()  → for Edge Functions / privileged Route Handlers only
 */

export { browserClient, serverClient, serviceClient } from './client';
export type { Database } from './types';

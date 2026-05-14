import { createAdminClient } from '@precision-medical/auth/admin';

const globalForSupabase = globalThis as unknown as {
  supabaseAdmin: ReturnType<typeof createAdminClient> | undefined;
};

export const supabaseAdmin =
  globalForSupabase.supabaseAdmin ?? createAdminClient();

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseAdmin = supabaseAdmin;
}

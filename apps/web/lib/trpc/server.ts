import 'server-only';
import { createCallerFactory, appRouter } from '@precision-medical/api';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { cache } from 'react';
import type { Context } from '@precision-medical/api';

const createContext = cache(async (): Promise<Context> => {
  const supabase = await createServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser?.email) {
    return { user: null, session: null };
  }

  const adminClient = createAdminClient();
  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('email', supabaseUser.email)
    .single();

  return { user: user ?? null, session: null };
});

const createCaller = createCallerFactory(appRouter);

export const api = createCaller(createContext);

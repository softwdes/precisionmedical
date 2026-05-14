import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type NextRequest } from 'next/server';
import { appRouter } from '@precision-medical/api';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';

const createContext = async (req: NextRequest) => {
  const supabase = await createServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser?.email) {
    return {
      user: null,
      session: null,
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    };
  }

  const adminClient = createAdminClient();
  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('email', supabaseUser.email)
    .single();

  return {
    user: user ?? null,
    session: null,
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  };
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(`❌ tRPC error on ${path ?? '<no-path>'}:`, error);
          }
        : undefined,
  });

export { handler as GET, handler as POST };

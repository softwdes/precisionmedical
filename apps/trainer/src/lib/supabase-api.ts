import { createServerClient } from '@supabase/ssr';
import { type NextRequest } from 'next/server';

export function createApiClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );
}

export async function getTrainerIdFromRequest(request: NextRequest): Promise<string> {
  const supabase = createApiClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const { data: trainer } = await supabase
    .from('trainers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!trainer) throw new Error('No trainer profile found');
  return trainer.id;
}

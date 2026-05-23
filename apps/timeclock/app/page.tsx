import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import ClockPage from '@/components/ClockPage';

export default async function Page() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return <ClockPage userId={user.id} />;
}

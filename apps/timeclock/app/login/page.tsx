import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import LoginPage from '@/components/LoginPage';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect('/');

  const params = await searchParams;
  return <LoginPage expired={params.expired === 'true'} />;
}

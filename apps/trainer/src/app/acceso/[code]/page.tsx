import { redirect, notFound } from 'next/navigation';
import { serverClient } from '@precision/db/client';

interface Props {
  params: Promise<{ code: string }>;
}

export default async function AccesoRedirectPage({ params }: Props) {
  const { code } = await params;

  const supabase = serverClient();
  const { data } = await supabase
    .from('invite_links')
    .select('full_url')
    .eq('code', code.toUpperCase())
    .single();

  if (!data?.full_url) notFound();

  redirect(data.full_url);
}

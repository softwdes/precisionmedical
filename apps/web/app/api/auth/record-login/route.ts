import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;

  const admin = createAdminClient();
  await admin
    .from('users')
    .update({ lastLoginAt: new Date().toISOString(), lastLoginIp: ip, updatedAt: new Date().toISOString() })
    .eq('id', user.id);

  return NextResponse.json({ success: true });
}

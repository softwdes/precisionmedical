import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { employee_id: string; exception_type: string; date: string; reason?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { employee_id, exception_type, date, reason } = body;
  if (!employee_id || !exception_type || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from('schedule_exceptions').insert({
    employee_id,
    exception_type,
    date,
    reason: reason ?? null,
    approved_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

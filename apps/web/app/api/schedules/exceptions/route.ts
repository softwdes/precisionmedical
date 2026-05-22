import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const last = new Date(end);
  // cap at 366 days to avoid runaway inserts
  let guard = 0;
  while (current <= last && guard < 366) {
    dates.push(current.toISOString().split('T')[0]!);
    current.setDate(current.getDate() + 1);
    guard++;
  }
  return dates;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { employee_id: string; exception_type: string; date: string; date_end?: string; reason?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { employee_id, exception_type, date, date_end, reason } = body;
  if (!employee_id || !exception_type || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (date_end && date_end < date) {
    return NextResponse.json({ error: 'date_end must be >= date' }, { status: 400 });
  }

  const admin = createAdminClient();
  const dates = date_end ? dateRange(date, date_end) : [date];

  const rows = dates.map(d => ({
    employee_id,
    exception_type,
    date: d,
    reason: reason ?? null,
    approved_by: user.id,
  }));

  const { error } = await admin.from('schedule_exceptions').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ inserted: rows.length }, { status: 201 });
}

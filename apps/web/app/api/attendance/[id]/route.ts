import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

interface PatchBody {
  check_in?: string | null;
  check_out?: string | null;
  clinic_name?: string;
  status?: 'on_time' | 'late' | 'absent';
  late_minutes?: number;
  notes?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: PatchBody;
  try { body = await req.json() as PatchBody; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const admin = createAdminClient();

  // Fetch existing record to get break_minutes
  const { data: existing } = await admin
    .from('attendance_records')
    .select('break_minutes, check_in, check_out')
    .eq('id', id)
    .single();

  const update: Record<string, unknown> = { recorded_by: user.id };
  if (body.clinic_name !== undefined) update.clinic_name = body.clinic_name;
  if (body.status      !== undefined) update.status = body.status;
  if (body.late_minutes !== undefined) update.late_minutes = body.late_minutes;
  if (body.notes       !== undefined) update.notes = body.notes;
  if (body.check_in    !== undefined) update.check_in = body.check_in;
  if (body.check_out   !== undefined) update.check_out = body.check_out;

  // Recalculate hours_worked
  const checkIn  = body.check_in  !== undefined ? body.check_in  : (existing?.check_in  ?? null);
  const checkOut = body.check_out !== undefined ? body.check_out : (existing?.check_out ?? null);
  const breakMin = existing?.break_minutes ?? 0;
  if (checkIn && checkOut) {
    const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime() - breakMin * 60000;
    update.hours_worked = Math.max(0, ms / 3600000);
  }

  const { data, error } = await admin
    .from('attendance_records')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

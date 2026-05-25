import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

interface EmpRow { id: string; firstName: string; lastName: string; employeeCode: string; }

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const employee_id = sp.get('employee_id') ?? '';
  const date_from   = sp.get('date_from') ?? '';
  const date_to     = sp.get('date_to') ?? '';
  const clinic_name = sp.get('clinic_name') ?? '';
  const status      = sp.get('status') ?? '';
  const page        = Math.max(1, parseInt(sp.get('page') ?? '1'));
  const limit       = Math.min(100, parseInt(sp.get('limit') ?? '20'));
  const offset      = (page - 1) * limit;

  const admin = createAdminClient();

  let query = admin
    .from('attendance_records')
    .select('id, employee_id, date, check_in, check_out, break_start, break_end, clinic_name, hours_worked, break_minutes, status, late_minutes, notes, check_in_lat, check_in_lng, check_out_lat, check_out_lng, location_status', { count: 'exact' })
    .order('date', { ascending: false })
    .order('check_in', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (employee_id) query = query.eq('employee_id', employee_id);
  if (date_from)   query = query.gte('date', date_from);
  if (date_to)     query = query.lte('date', date_to);
  if (clinic_name) query = query.eq('clinic_name', clinic_name);
  if (status)      query = query.eq('status', status);

  const { data: records, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with employee names
  const empIds = [...new Set((records ?? []).map(r => r.employee_id as string))];
  let empMap: Record<string, EmpRow> = {};
  if (empIds.length > 0) {
    const { data: emps } = await admin
      .from('employees')
      .select('id, firstName, lastName, employeeCode')
      .in('id', empIds);
    for (const e of (emps ?? []) as EmpRow[]) empMap[e.id] = e;
  }

  const rows = (records ?? []).map(r => {
    const emp = empMap[r.employee_id as string];
    return {
      id: r.id,
      date: r.date,
      employee_id: r.employee_id,
      firstName: emp?.firstName ?? '?',
      lastName: emp?.lastName ?? '?',
      employeeCode: emp?.employeeCode ?? '',
      check_in: r.check_in,
      check_out: r.check_out,
      break_start: r.break_start,
      break_end: r.break_end,
      clinic_name: r.clinic_name,
      hours_worked: r.hours_worked,
      break_minutes: r.break_minutes ?? 0,
      status: r.status ?? 'on_time',
      late_minutes: r.late_minutes ?? 0,
      notes: r.notes ?? null,
      check_in_lat: (r.check_in_lat as number | null) ?? null,
      check_in_lng: (r.check_in_lng as number | null) ?? null,
      check_out_lat: (r.check_out_lat as number | null) ?? null,
      check_out_lng: (r.check_out_lng as number | null) ?? null,
      location_status: (r.location_status as string | null) ?? null,
    };
  });

  return NextResponse.json({
    rows,
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

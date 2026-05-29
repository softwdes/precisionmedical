import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

interface EmpRow { id: string; firstName: string; lastName: string; employeeCode: string; }
interface RecordRow {
  id: string; employee_id: string; check_in: string | null; check_out: string | null;
  break_start: string | null; break_end: string | null; clinic_name: string;
  hours_worked: number | null; break_minutes: number; status: string; late_minutes: number;
  check_in_lat: number | null; check_in_lng: number | null;
  check_out_lat: number | null; check_out_lng: number | null;
  location_status: string | null;
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  // Utah local date — must match how the timeclock writes attendance_records.date
  // (see apps/timeclock/components/ClockPage.tsx#localDateString). Using
  // toISOString() here would compute UTC, which after ~6pm Utah shifts to the
  // next day and breaks same-day lookups.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

  const [{ data: employees }, { data: records }] = await Promise.all([
    admin.from('employees')
      .select('id, firstName, lastName, employeeCode')
      .eq('status', 'ACTIVE')
      .is('deletedAt', null)
      .order('firstName'),
    admin.from('attendance_records')
      .select('id, employee_id, check_in, check_out, break_start, break_end, clinic_name, hours_worked, break_minutes, status, late_minutes, check_in_lat, check_in_lng, check_out_lat, check_out_lng, location_status')
      .eq('date', today),
  ]);

  const recordMap = new Map<string, RecordRow>();
  for (const r of (records ?? []) as RecordRow[]) recordMap.set(r.employee_id, r);

  const rows = (employees ?? [] as EmpRow[]).map((e: EmpRow) => {
    const r = recordMap.get(e.id) ?? null;
    return {
      employee_id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeCode: e.employeeCode,
      record_id: r?.id ?? null,
      check_in: r?.check_in ?? null,
      check_out: r?.check_out ?? null,
      break_start: r?.break_start ?? null,
      break_end: r?.break_end ?? null,
      clinic_name: r?.clinic_name ?? null,
      hours_worked: r?.hours_worked ?? null,
      break_minutes: r?.break_minutes ?? 0,
      status: r?.status ?? null,
      late_minutes: r?.late_minutes ?? 0,
      check_in_lat: r?.check_in_lat ?? null,
      check_in_lng: r?.check_in_lng ?? null,
      check_out_lat: r?.check_out_lat ?? null,
      check_out_lng: r?.check_out_lng ?? null,
      location_status: r?.location_status ?? null,
    };
  });

  // Sort: working → break → done → absent
  rows.sort((a, b) => {
    const order = (row: typeof a) => {
      if (row.check_in && !row.check_out && row.break_start && !row.break_end) return 2;
      if (row.check_in && !row.check_out) return 1;
      if (row.check_out) return 3;
      return 4;
    };
    return order(a) - order(b) || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });

  return NextResponse.json({ rows, allEmployees: (employees ?? []) as EmpRow[] });
}

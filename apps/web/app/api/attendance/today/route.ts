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
  created_at: string;
}

/** Shape devuelto al cliente. La parte "primary" sigue presente y flat para
 *  compatibilidad con el render de la tabla colapsada (1 fila = 1 empleado).
 *  `dayRecords` es el array con TODOS los turnos del día del empleado en orden
 *  cronológico, para mostrar al expandir la fila. */
interface TodayRow {
  employee_id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  // Primary record (open shift if any, else most recent)
  record_id: string | null;
  check_in: string | null;
  check_out: string | null;
  break_start: string | null;
  break_end: string | null;
  clinic_name: string | null;
  hours_worked: number | null;
  break_minutes: number;
  status: string | null;
  late_minutes: number;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  location_status: string | null;
  // All records of the day, ordered by check_in ASC (first shift first)
  dayRecords: Array<Pick<RecordRow,
    'id' | 'check_in' | 'check_out' | 'break_start' | 'break_end' | 'clinic_name' |
    'hours_worked' | 'break_minutes' | 'status' | 'late_minutes' |
    'check_in_lat' | 'check_in_lng' | 'check_out_lat' | 'check_out_lng' | 'location_status'
  >>;
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
      .select('id, employee_id, check_in, check_out, break_start, break_end, clinic_name, hours_worked, break_minutes, status, late_minutes, check_in_lat, check_in_lng, check_out_lat, check_out_lng, location_status, created_at')
      .eq('date', today)
      .order('check_in', { ascending: true, nullsFirst: false }),
  ]);

  // Group ALL today's records by employee. A single employee can have multiple
  // records per day (split shifts) thanks to the partial UNIQUE index
  // (uniq_open_attendance) — only ONE open shift at a time is enforced.
  const recordsByEmployee = new Map<string, RecordRow[]>();
  for (const r of (records ?? []) as RecordRow[]) {
    const arr = recordsByEmployee.get(r.employee_id) ?? [];
    arr.push(r);
    recordsByEmployee.set(r.employee_id, arr);
  }

  const rows: TodayRow[] = (employees ?? [] as EmpRow[]).map((e: EmpRow): TodayRow => {
    const empRecords = recordsByEmployee.get(e.id) ?? [];

    // Primary = the open shift if any (check_in but no check_out), else the
    // most recent one by check_in. Falls back to first record if none have
    // check_in yet (shouldn't happen but defensive).
    const openShift = empRecords.find(r => r.check_in && !r.check_out) ?? null;
    const mostRecent = empRecords.length > 0
      ? [...empRecords].sort((a, b) => {
          const aTime = a.check_in ? new Date(a.check_in).getTime() : 0;
          const bTime = b.check_in ? new Date(b.check_in).getTime() : 0;
          return bTime - aTime;
        })[0]
      : null;
    const primary: RecordRow | null = openShift ?? mostRecent ?? null;

    return {
      employee_id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeCode: e.employeeCode,
      record_id: primary?.id ?? null,
      check_in: primary?.check_in ?? null,
      check_out: primary?.check_out ?? null,
      break_start: primary?.break_start ?? null,
      break_end: primary?.break_end ?? null,
      clinic_name: primary?.clinic_name ?? null,
      hours_worked: primary?.hours_worked ?? null,
      break_minutes: primary?.break_minutes ?? 0,
      status: primary?.status ?? null,
      late_minutes: primary?.late_minutes ?? 0,
      check_in_lat: primary?.check_in_lat ?? null,
      check_in_lng: primary?.check_in_lng ?? null,
      check_out_lat: primary?.check_out_lat ?? null,
      check_out_lng: primary?.check_out_lng ?? null,
      location_status: primary?.location_status ?? null,
      // Strip employee_id + created_at since the parent row already has them;
      // keep everything else the UI needs to render each shift sub-row.
      dayRecords: empRecords.map(r => ({
        id: r.id,
        check_in: r.check_in,
        check_out: r.check_out,
        break_start: r.break_start,
        break_end: r.break_end,
        clinic_name: r.clinic_name,
        hours_worked: r.hours_worked,
        break_minutes: r.break_minutes ?? 0,
        status: r.status ?? 'on_time',
        late_minutes: r.late_minutes ?? 0,
        check_in_lat: r.check_in_lat,
        check_in_lng: r.check_in_lng,
        check_out_lat: r.check_out_lat,
        check_out_lng: r.check_out_lng,
        location_status: r.location_status,
      })),
    };
  });

  // Sort: working → break → done → absent (by primary state)
  rows.sort((a, b) => {
    const order = (row: typeof a): number => {
      if (row.check_in && !row.check_out && row.break_start && !row.break_end) return 2;
      if (row.check_in && !row.check_out) return 1;
      if (row.check_out) return 3;
      return 4;
    };
    return order(a) - order(b) || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });

  return NextResponse.json({ rows, allEmployees: (employees ?? []) as EmpRow[] });
}

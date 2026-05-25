import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayRecord {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours_worked: number | null;
  break_minutes: number;
  clinic_name: string | null;
  status: string;
  late_minutes: number;
}

interface WeekBlock {
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  days: DayRecord[];
}

interface EmployeeHoursSummary {
  totalRegular: number;
  totalOvertime: number;
  totalHours: number;
  totalBreaks: number;
  totalDaysWorked: number;
  weekBlocks: WeekBlock[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDateStr(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function splitIntoCalendarWeeks(
  records: DayRecord[],
  fromDate: Date,
  toDate: Date,
): Array<{ start: Date; end: Date; records: DayRecord[] }> {
  const weeks: Array<{ start: Date; end: Date; records: DayRecord[] }> = [];
  let current = getMondayOf(fromDate);

  const toDateEnd = new Date(toDate);
  toDateEnd.setHours(23, 59, 59, 999);

  while (current <= toDate) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekRecords = records.filter((r) => {
      const d = new Date(r.date);
      return d >= current && d <= weekEnd && d >= fromDate && d <= toDateEnd;
    });

    if (weekRecords.length > 0) {
      weeks.push({ start: new Date(current), end: weekEnd, records: weekRecords });
    }

    current = new Date(current);
    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

function calculateOvertimeForPeriod(
  records: DayRecord[],
  fromDate: Date,
  toDate: Date,
  employmentType: 'exempt' | 'non_exempt',
): EmployeeHoursSummary {
  const weeks = splitIntoCalendarWeeks(records, fromDate, toDate);

  let totalRegular = 0;
  let totalOvertime = 0;
  let totalBreaks = 0;
  let totalDaysWorked = 0;
  const weekBlocks: WeekBlock[] = [];

  for (const week of weeks) {
    const weekHours = week.records.reduce((sum, r) => sum + (r.hours_worked ?? 0), 0);
    const breakHours = week.records.reduce((sum, r) => sum + ((r.break_minutes ?? 0) / 60), 0);

    let regularH: number;
    let overtimeH: number;

    if (employmentType === 'exempt') {
      regularH = weekHours;
      overtimeH = 0;
    } else {
      regularH = Math.min(weekHours, 40);
      overtimeH = Math.max(0, weekHours - 40);
    }

    totalRegular += regularH;
    totalOvertime += overtimeH;
    totalBreaks += breakHours;
    totalDaysWorked += week.records.filter((r) => (r.hours_worked ?? 0) > 0).length;

    weekBlocks.push({
      weekStart: formatDateStr(week.start),
      weekEnd: formatDateStr(week.end),
      totalHours: round2(weekHours),
      regularHours: round2(regularH),
      overtimeHours: round2(overtimeH),
      days: week.records.sort((a, b) => a.date.localeCompare(b.date)),
    });
  }

  return {
    totalRegular: round2(totalRegular),
    totalOvertime: round2(totalOvertime),
    totalHours: round2(totalRegular + totalOvertime),
    totalBreaks: round2(totalBreaks),
    totalDaysWorked,
    weekBlocks,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from_date = sp.get('from_date') ?? '';
  const to_date = sp.get('to_date') ?? '';
  const employee_id = sp.get('employee_id') ?? '';
  const country_id = sp.get('country_id') ?? '';
  const employment_type_filter = sp.get('employment_type') ?? '';

  if (!from_date || !to_date) {
    return NextResponse.json({ error: 'from_date and to_date are required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── 1. Fetch active employees ──────────────────────────────────────────────
  let empQuery = admin
    .from('employees')
    .select('id, firstName, lastName, employeeCode, employment_type, countryId, country:countries(code,name)')
    .is('deletedAt', null)
    .eq('status', 'ACTIVE');

  if (employee_id) empQuery = empQuery.eq('id', employee_id);
  if (country_id) empQuery = empQuery.eq('countryId', country_id);
  if (employment_type_filter) empQuery = empQuery.eq('employment_type', employment_type_filter);

  const { data: employees, error: empError } = await empQuery;
  if (empError) return NextResponse.json({ error: empError.message }, { status: 500 });

  if (!employees || employees.length === 0) {
    return NextResponse.json({
      period: { from: from_date, to: to_date },
      summary: {
        totalRegularHours: 0, totalOvertimeHours: 0, totalHours: 0,
        totalBreakHours: 0, totalEmployees: 0, employeesWithOvertime: 0,
      },
      employees: [],
      incompleteCount: 0,
    });
  }

  const empIds = employees.map((e) => e.id as string);

  // ── 2. Fetch completed attendance records ──────────────────────────────────
  const { data: records, error: recError } = await admin
    .from('attendance_records')
    .select('id, employee_id, date, check_in, check_out, hours_worked, break_minutes, clinic_name, status, late_minutes')
    .in('employee_id', empIds)
    .gte('date', from_date)
    .lte('date', to_date)
    .not('check_out', 'is', null);

  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 });

  // ── 3. Count incomplete records (check_in but no check_out) ───────────────
  const { count: incompleteCount } = await admin
    .from('attendance_records')
    .select('id', { count: 'exact', head: true })
    .in('employee_id', empIds)
    .gte('date', from_date)
    .lte('date', to_date)
    .is('check_out', null)
    .not('check_in', 'is', null);

  // ── 4. Group records by employee ───────────────────────────────────────────
  const recordsByEmployee = new Map<string, DayRecord[]>();
  for (const rec of records ?? []) {
    const eid = rec.employee_id as string;
    if (!recordsByEmployee.has(eid)) recordsByEmployee.set(eid, []);
    recordsByEmployee.get(eid)!.push({
      id: rec.id as string,
      employee_id: eid,
      date: rec.date as string,
      check_in: rec.check_in as string | null,
      check_out: rec.check_out as string | null,
      hours_worked: rec.hours_worked as number | null,
      break_minutes: (rec.break_minutes as number | null) ?? 0,
      clinic_name: rec.clinic_name as string | null,
      status: (rec.status as string | null) ?? 'on_time',
      late_minutes: (rec.late_minutes as number | null) ?? 0,
    });
  }

  const fromDate = new Date(from_date + 'T00:00:00');
  const toDate = new Date(to_date + 'T23:59:59');

  // ── 5. Calculate overtime per employee ─────────────────────────────────────
  const employeeResults = employees.map((emp) => {
    const empRecords = recordsByEmployee.get(emp.id as string) ?? [];
    const empType = ((emp.employment_type as string | null) ?? 'non_exempt') as 'exempt' | 'non_exempt';
    const summary = calculateOvertimeForPeriod(empRecords, fromDate, toDate, empType);

    return {
      id: emp.id as string,
      firstName: emp.firstName as string,
      lastName: emp.lastName as string,
      full_name: `${emp.firstName} ${emp.lastName}`,
      employee_code: emp.employeeCode as string,
      employment_type: empType,
      countryId: emp.countryId as string,
      country: (Array.isArray(emp.country) ? (emp.country[0] as { code: string; name: string } | undefined) ?? null : emp.country as { code: string; name: string } | null),
      ...summary,
      dailyRecords: empRecords.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  // ── 6. Aggregate summary ───────────────────────────────────────────────────
  const totalRegularHours = round2(employeeResults.reduce((s, e) => s + e.totalRegular, 0));
  const totalOvertimeHours = round2(employeeResults.reduce((s, e) => s + e.totalOvertime, 0));
  const totalBreakHours = round2(employeeResults.reduce((s, e) => s + e.totalBreaks, 0));
  const employeesWithOvertime = employeeResults.filter((e) => e.totalOvertime > 0).length;

  return NextResponse.json({
    period: { from: from_date, to: to_date },
    summary: {
      totalRegularHours,
      totalOvertimeHours,
      totalHours: round2(totalRegularHours + totalOvertimeHours),
      totalBreakHours,
      totalEmployees: employeeResults.length,
      employeesWithOvertime,
    },
    employees: employeeResults,
    incompleteCount: incompleteCount ?? 0,
  });
}

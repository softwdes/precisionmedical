import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  type: string;
}

interface ScheduleRow {
  id: string;
  employee_id: string;
  schedule_type: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  clinic_name: string;
  valid_from: string;
  valid_until: string | null;
}

interface ExceptionRow {
  id: string;
  employee_id: string;
  date: string;
  exception_type: string;
  reason: string | null;
}

function toColor(id: string): string {
  const palette = ['#6366F1','#8B5CF6','#06B6D4','#10B981','#F59E0B','#F43F5E'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  return palette[Math.abs(hash) % palette.length]!;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const weekStart  = searchParams.get('week_start');
  const clinicName = searchParams.get('clinic_name');

  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 });

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0]!;

  const admin = createAdminClient();

  const [{ data: employees }, { data: schedules }, { data: exceptions }] = await Promise.all([
    admin.from('employees')
      .select('id, firstName, lastName, type')
      .eq('status', 'ACTIVE')
      .is('deletedAt', null)
      .order('firstName'),

    admin.from('work_schedules')
      .select('id, employee_id, schedule_type, start_time, end_time, days_of_week, clinic_name, valid_from, valid_until')
      .eq('is_active', true)
      .lte('valid_from', weekEndStr)
      .or(`valid_until.is.null,valid_until.gte.${weekStart}`),

    admin.from('schedule_exceptions')
      .select('id, employee_id, date, exception_type, reason')
      .gte('date', weekStart)
      .lte('date', weekEndStr),
  ]);

  const scheduleMap = new Map<string, ScheduleRow>();
  for (const s of (schedules ?? []) as ScheduleRow[]) {
    if (!clinicName || s.clinic_name === clinicName) {
      scheduleMap.set(s.employee_id, s);
    }
  }

  const exceptionsByEmployee = new Map<string, ExceptionRow[]>();
  for (const ex of (exceptions ?? []) as ExceptionRow[]) {
    const arr = exceptionsByEmployee.get(ex.employee_id) ?? [];
    arr.push(ex);
    exceptionsByEmployee.set(ex.employee_id, arr);
  }

  const result = (employees ?? [] as EmployeeRow[]).map((emp: EmployeeRow) => {
    const initials = `${emp.firstName[0] ?? ''}${emp.lastName[0] ?? ''}`.toUpperCase();
    const sched = scheduleMap.get(emp.id) ?? null;
    const excs = exceptionsByEmployee.get(emp.id) ?? [];

    if (clinicName && !sched) return null;

    return {
      employee: { id: emp.id, name: `${emp.firstName} ${emp.lastName}`, initials, color: toColor(emp.id), employeeType: emp.type },
      schedule: sched
        ? { id: sched.id, schedule_type: sched.schedule_type, start_time: sched.start_time, end_time: sched.end_time, days_of_week: sched.days_of_week, clinic_name: sched.clinic_name }
        : null,
      exceptions: excs.map((e: ExceptionRow) => ({ id: e.id, date: e.date, exception_type: e.exception_type, reason: e.reason })),
    };
  }).filter(Boolean);

  return NextResponse.json(result);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    employee_id: string;
    schedule_type: string;
    start_time: string;
    end_time: string;
    days_of_week: number[];
    clinic_name: string;
    valid_from: string;
    valid_until?: string;
  };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { employee_id, schedule_type, start_time, end_time, days_of_week, clinic_name, valid_from, valid_until } = body;
  if (!employee_id || !schedule_type || !start_time || !end_time || !days_of_week?.length || !clinic_name || !valid_from) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Deactivate existing active schedule
  await admin.from('work_schedules')
    .update({ is_active: false })
    .eq('employee_id', employee_id)
    .eq('is_active', true);

  const { data, error } = await admin.from('work_schedules').insert({
    employee_id,
    schedule_type,
    start_time,
    end_time,
    days_of_week,
    clinic_name,
    valid_from,
    valid_until: valid_until ?? null,
    is_active: true,
    created_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

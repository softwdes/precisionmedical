import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Devuelve TODOS los turnos de un empleado en una fecha + sus
 * waypoints, listos para alimentar el mapa "Dia completo".
 *
 * Shape:
 * {
 *   employeeName: string,
 *   date: string,                       // YYYY-MM-DD (Utah-local)
 *   shifts: Array<{
 *     id: string,
 *     check_in: { lat, lng, at } | null,
 *     check_out: { lat, lng, at } | null,
 *     waypoints: Array<{ lat, lng, recorded_at }>,
 *     clinic_name: string | null,
 *     hours_worked: number | null,
 *     location_status: string | null,
 *   }>
 * }
 *
 * Si `date` no viene como query param, usa el dia Utah-local actual.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { employeeId } = await params;
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const date = dateParam ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

  const admin = createAdminClient();

  const [{ data: emp }, { data: records }] = await Promise.all([
    admin.from('employees')
      .select('firstName, lastName, employeeCode')
      .eq('id', employeeId)
      .maybeSingle(),
    admin.from('attendance_records')
      .select('id, check_in, check_out, clinic_name, hours_worked, check_in_lat, check_in_lng, check_out_lat, check_out_lng, location_status')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .order('check_in', { ascending: true, nullsFirst: false }),
  ]);

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const recordIds = (records ?? []).map((r) => r.id as string);

  // Trae todos los waypoints de todos los turnos de un solo viaje.
  // Despues los agrupamos por record_id en memoria.
  let waypointsByRecord = new Map<string, Array<{ lat: number; lng: number; recorded_at: string }>>();
  if (recordIds.length > 0) {
    const { data: wps } = await admin
      .from('attendance_waypoints')
      .select('record_id, lat, lng, recorded_at')
      .in('record_id', recordIds)
      .order('recorded_at', { ascending: true });

    for (const wp of (wps ?? []) as Array<{ record_id: string; lat: number; lng: number; recorded_at: string }>) {
      const arr = waypointsByRecord.get(wp.record_id) ?? [];
      arr.push({ lat: wp.lat, lng: wp.lng, recorded_at: wp.recorded_at });
      waypointsByRecord.set(wp.record_id, arr);
    }
  }

  const shifts = (records ?? []).map((r) => {
    const wp = waypointsByRecord.get(r.id as string) ?? [];
    return {
      id: r.id as string,
      check_in:
        r.check_in && r.check_in_lat != null && r.check_in_lng != null
          ? { lat: Number(r.check_in_lat), lng: Number(r.check_in_lng), at: r.check_in as string }
          : null,
      check_out:
        r.check_out && r.check_out_lat != null && r.check_out_lng != null
          ? { lat: Number(r.check_out_lat), lng: Number(r.check_out_lng), at: r.check_out as string }
          : null,
      waypoints: wp,
      clinic_name: (r.clinic_name as string | null) ?? null,
      hours_worked: r.hours_worked != null ? Number(r.hours_worked) : null,
      location_status: (r.location_status as string | null) ?? null,
    };
  });

  return NextResponse.json(
    {
      employeeName: `${emp.firstName as string} ${emp.lastName as string}`,
      date,
      shifts,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}

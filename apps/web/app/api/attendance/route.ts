import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

// Creación manual / retroactiva de un registro de asistencia por el admin
// (cuando el empleado se olvidó de marcar). Espejo del PATCH en [id]/route.ts.
// Estos registros se marcan is_manual=true y location_status='manual' para
// distinguirlos de un fichaje real con GPS y no ensuciar el filtro "sin GPS".

interface PostBody {
  employee_id?: string;
  date?: string;               // YYYY-MM-DD
  check_in?: string | null;    // ISO
  check_out?: string | null;   // ISO
  clinic_name?: string;
  status?: 'on_time' | 'late' | 'absent';
  late_minutes?: number;
  notes?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: PostBody;
  try { body = await req.json() as PostBody; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Validación: empleado, fecha, clínica, entrada/salida y motivo son obligatorios.
  // Exigimos turno CERRADO (entrada + salida) para no chocar con el índice
  // único uniq_open_attendance (employee_id, date) WHERE check_out IS NULL.
  if (!body.employee_id) return NextResponse.json({ error: 'Falta el empleado' }, { status: 400 });
  if (!body.date)        return NextResponse.json({ error: 'Falta la fecha' }, { status: 400 });
  if (!body.clinic_name) return NextResponse.json({ error: 'Falta la clínica' }, { status: 400 });
  if (!body.check_in || !body.check_out) {
    return NextResponse.json({ error: 'Hora de entrada y salida son obligatorias' }, { status: 400 });
  }
  if (!body.notes || !body.notes.trim()) {
    return NextResponse.json({ error: 'El motivo (notas) es obligatorio' }, { status: 400 });
  }

  const checkIn  = body.check_in;
  const checkOut = body.check_out;
  if (new Date(checkOut).getTime() <= new Date(checkIn).getTime()) {
    return NextResponse.json({ error: 'La salida debe ser posterior a la entrada' }, { status: 400 });
  }

  const admin = createAdminClient();

  // hours_worked: sin break en creación manual (break_minutes = 0).
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const hoursWorked = Math.max(0, ms / 3600000);

  const insert = {
    employee_id: body.employee_id,
    date: body.date,
    check_in: checkIn,
    check_out: checkOut,
    clinic_name: body.clinic_name,
    status: body.status ?? 'on_time',
    late_minutes: body.status === 'late' ? (body.late_minutes ?? 0) : 0,
    notes: body.notes,
    break_minutes: 0,
    hours_worked: hoursWorked,
    is_manual: true,
    location_status: 'manual',
    recorded_by: user.id,
  };

  const { data, error } = await admin
    .from('attendance_records')
    .insert(insert)
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation (índice uniq_open_attendance): ya existe un
    // turno abierto ese día para ese empleado.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un turno abierto ese día para este empleado. Ciérralo antes de crear otro.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

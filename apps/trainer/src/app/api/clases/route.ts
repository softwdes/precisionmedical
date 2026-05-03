import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, getTrainerIdFromRequest } from '@/lib/supabase-api';

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);

    const { data, error } = await supabase
      .from('clases')
      .select('*, clase_alumnos(alumno_id, students(full_name))')
      .eq('trainer_id', trainerId)
      .order('fecha', { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);

    const body = await request.json() as {
      titulo: string;
      fecha: string;
      hora_inicio: string;
      hora_fin: string;
      tipo: string;
      color: string;
      recurrencia: string;
      fecha_hasta?: string;
      frecuencia_tipo?: string;
      notas?: string;
      alumno_ids?: string[];
    };

    const { alumno_ids, ...claseData } = body;

    const { data: clase, error } = await supabase
      .from('clases')
      .insert({
        trainer_id: trainerId,
        titulo: claseData.titulo,
        fecha: claseData.fecha,
        hora_inicio: claseData.hora_inicio,
        hora_fin: claseData.hora_fin,
        tipo: claseData.tipo,
        color: claseData.color,
        recurrencia: claseData.recurrencia,
        ...(claseData.fecha_hasta ? { fecha_hasta: claseData.fecha_hasta } : {}),
        ...(claseData.frecuencia_tipo ? { frecuencia_tipo: claseData.frecuencia_tipo } : {}),
        ...(claseData.notas ? { notas: claseData.notas } : {}),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    if (Array.isArray(alumno_ids) && alumno_ids.length > 0) {
      const { error: alumnosError } = await supabase
        .from('clase_alumnos')
        .insert(
          alumno_ids.map((aid: string) => ({
            clase_id: clase.id,
            alumno_id: aid,
          }))
        );
      if (alumnosError) throw new Error(alumnosError.message);
    }

    return NextResponse.json(clase, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);

    const body = await request.json() as {
      id: string;
      titulo?: string;
      fecha?: string;
      hora_inicio?: string;
      hora_fin?: string;
      tipo?: string;
      color?: string;
      recurrencia?: string;
      fecha_hasta?: string;
      frecuencia_tipo?: string;
      notas?: string;
      alumno_ids?: string[];
    };

    const { id, alumno_ids, ...updateData } = body;

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

    const { data: clase, error } = await supabase
      .from('clases')
      .update(updateData)
      .eq('id', id)
      .eq('trainer_id', trainerId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Replace clase_alumnos
    const { error: deleteError } = await supabase
      .from('clase_alumnos')
      .delete()
      .eq('clase_id', id);

    if (deleteError) throw new Error(deleteError.message);

    if (Array.isArray(alumno_ids) && alumno_ids.length > 0) {
      const { error: alumnosError } = await supabase
        .from('clase_alumnos')
        .insert(
          alumno_ids.map((aid: string) => ({
            clase_id: id,
            alumno_id: aid,
          }))
        );
      if (alumnosError) throw new Error(alumnosError.message);
    }

    return NextResponse.json(clase);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

    const { error } = await supabase
      .from('clases')
      .delete()
      .eq('id', id)
      .eq('trainer_id', trainerId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

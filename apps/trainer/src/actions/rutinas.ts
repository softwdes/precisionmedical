'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/supabase-server';

export interface RutinaTemplateRow {
  id: string;
  nombre: string;
  nivel: string | null;
  dias_semana: number;
  duracion_semanas: number;
  objetivo: string | null;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  template_dias: { id: string }[];
}

interface EjPayload {
  orden: number;
  ejercicio_id: string | null;
  sets: number;
  reps: string;
  descanso_seg: number;
  notas: string | null;
}

interface DiaPayload {
  orden: number;
  nombre: string;
  ejercicios: EjPayload[];
}

export async function getRutinaTemplates(): Promise<RutinaTemplateRow[]> {
  const { supabase, trainerId } = await getAuthContext();
  const { data, error } = await supabase
    .from('rutina_templates')
    .select('*, template_dias(id)')
    .eq('trainer_id', trainerId)
    .eq('activo', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RutinaTemplateRow[];
}

export async function createRutinaTemplate(payload: {
  nombre: string;
  nivel: string;
  dias_semana: number;
  duracion_semanas: number;
  objetivo: string;
  descripcion: string;
  dias: DiaPayload[];
}): Promise<{ error?: string; id?: string }> {
  try {
    const { supabase, trainerId } = await getAuthContext();

    const { data: tpl, error: tplErr } = await supabase
      .from('rutina_templates')
      .insert({
        trainer_id: trainerId,
        nombre: payload.nombre,
        nivel: payload.nivel || null,
        dias_semana: payload.dias_semana,
        duracion_semanas: payload.duracion_semanas,
        objetivo: payload.objetivo || null,
        descripcion: payload.descripcion || null,
        activo: true,
      })
      .select('id')
      .single();

    if (tplErr) return { error: tplErr.message };

    for (const dia of payload.dias) {
      const { data: diaRow, error: diaErr } = await supabase
        .from('template_dias')
        .insert({ template_id: tpl.id, orden: dia.orden, nombre: dia.nombre })
        .select('id')
        .single();
      if (diaErr) return { error: diaErr.message };

      if (dia.ejercicios.length > 0) {
        const { error: exErr } = await supabase
          .from('template_ejercicios')
          .insert(dia.ejercicios.map(ex => ({
            dia_id: diaRow.id,
            orden: ex.orden,
            ejercicio_id: ex.ejercicio_id || null,
            sets: ex.sets,
            reps: ex.reps,
            descanso_seg: ex.descanso_seg,
            notas: ex.notas || null,
          })));
        if (exErr) return { error: exErr.message };
      }
    }

    revalidatePath('/rutinas');
    return { id: tpl.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteRutinaTemplate(id: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase
      .from('rutina_templates')
      .update({ activo: false })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/rutinas');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function assignRutinaToAlumno(payload: {
  alumno_id: string;
  fecha_inicio: string;
  template_id: string | null;
  nombre: string;
  dias: DiaPayload[];
}): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();

    await supabase
      .from('rutinas_alumno')
      .update({ activo: false })
      .eq('alumno_id', payload.alumno_id)
      .eq('activo', true);

    const { data: rutina, error: rutErr } = await supabase
      .from('rutinas_alumno')
      .insert({
        alumno_id: payload.alumno_id,
        template_id: payload.template_id,
        nombre: payload.nombre,
        fecha_inicio: payload.fecha_inicio,
        activo: true,
      })
      .select('id')
      .single();

    if (rutErr) return { error: rutErr.message };

    for (const dia of payload.dias) {
      const { data: diaRow, error: diaErr } = await supabase
        .from('rutina_dias')
        .insert({ rutina_id: rutina.id, orden: dia.orden, nombre: dia.nombre })
        .select('id')
        .single();
      if (diaErr) return { error: diaErr.message };

      if (dia.ejercicios.length > 0) {
        const { error: exErr } = await supabase
          .from('rutina_ejercicios')
          .insert(dia.ejercicios.map(ex => ({
            dia_id: diaRow.id,
            orden: ex.orden,
            ejercicio_id: ex.ejercicio_id || null,
            sets: ex.sets,
            reps: ex.reps,
            descanso_seg: ex.descanso_seg,
            notas: ex.notas || null,
          })));
        if (exErr) return { error: exErr.message };
      }
    }

    revalidatePath('/rutinas');
    revalidatePath(`/alumnos/${payload.alumno_id}`);
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

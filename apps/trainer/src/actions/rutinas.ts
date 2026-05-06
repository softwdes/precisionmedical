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

export interface RutinaTemplateDetail {
  id: string;
  nombre: string;
  nivel: string | null;
  dias_semana: number;
  duracion_semanas: number;
  objetivo: string | null;
  descripcion: string | null;
  template_dias: {
    id: string;
    orden: number;
    nombre: string;
    template_ejercicios: {
      id: string;
      orden: number;
      ejercicio_id: string | null;
      sets: number;
      reps: string;
      descanso_seg: number;
      notas: string | null;
    }[];
  }[];
}

export async function getRutinaTemplateDetail(id: string): Promise<RutinaTemplateDetail | null> {
  const { supabase } = await getAuthContext();
  const { data, error } = await supabase
    .from('rutina_templates')
    .select('id, nombre, nivel, dias_semana, duracion_semanas, objetivo, descripcion, template_dias(id, orden, nombre, template_ejercicios(id, orden, ejercicio_id, sets, reps, descanso_seg, notas))')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as RutinaTemplateDetail;
}

export async function updateRutinaTemplate(id: string, payload: {
  nombre: string;
  nivel: string;
  dias_semana: number;
  duracion_semanas: number;
  objetivo: string;
  descripcion: string;
  dias: DiaPayload[];
}): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();

    const { error: tplErr } = await supabase
      .from('rutina_templates')
      .update({
        nombre: payload.nombre,
        nivel: payload.nivel || null,
        dias_semana: payload.dias_semana,
        duracion_semanas: payload.duracion_semanas,
        objetivo: payload.objetivo || null,
        descripcion: payload.descripcion || null,
      })
      .eq('id', id);
    if (tplErr) return { error: tplErr.message };

    const { data: existingDias } = await supabase
      .from('template_dias')
      .select('id')
      .eq('template_id', id);

    if (existingDias && existingDias.length > 0) {
      const diaIds = existingDias.map((d: { id: string }) => d.id);
      await supabase.from('template_ejercicios').delete().in('dia_id', diaIds);
      await supabase.from('template_dias').delete().eq('template_id', id);
    }

    for (const dia of payload.dias) {
      const { data: diaRow, error: diaErr } = await supabase
        .from('template_dias')
        .insert({ template_id: id, orden: dia.orden, nombre: dia.nombre })
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
    return {};
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

export async function getStudentRutinaActiva(alumnoId: string) {
  const { supabase } = await getAuthContext();
  const { data } = await supabase
    .from('rutinas_alumno')
    .select(`id, nombre, fecha_inicio, activo,
      rutina_dias(id, orden, nombre,
        rutina_ejercicios(id, orden, sets, reps, descanso_seg, notas, ejercicio_id,
          exercises(name)))`)
    .eq('alumno_id', alumnoId)
    .eq('activo', true)
    .maybeSingle();
  return data ?? null;
}

export async function getStudentRutinasHistorial(alumnoId: string, limit = 5) {
  const { supabase } = await getAuthContext();
  const { data } = await supabase
    .from('rutinas_alumno')
    .select('id, nombre, fecha_inicio, activo, created_at')
    .eq('alumno_id', alumnoId)
    .eq('activo', false)
    .order('fecha_inicio', { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: string; nombre: string; fecha_inicio: string; activo: boolean; created_at: string }[];
}

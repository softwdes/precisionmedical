'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/supabase-server';

export async function addMedidaCorporal(
  alumnoId: string,
  medida: { fecha: string; pecho_cm?: number; cintura_cm?: number; cadera_cm?: number; biceps_cm?: number; muslo_cm?: number; notas?: string; }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase.from('medidas_corporales').insert({
      alumno_id: alumnoId, ...medida,
    });
    if (error) return { error: error.message };
    revalidatePath('/metricas');
    return {};
  } catch (e) { return { error: (e as Error).message }; }
}

export async function addProgresoEjercicio(
  alumnoId: string,
  progreso: { ejercicio_id: string; fecha: string; peso_kg?: number; reps?: number; sets?: number; notas?: string; }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase.from('progreso_ejercicio').insert({
      alumno_id: alumnoId, ...progreso,
    });
    if (error) return { error: error.message };
    revalidatePath('/metricas');
    return {};
  } catch (e) { return { error: (e as Error).message }; }
}

export async function addSesionEntrenamiento(
  alumnoId: string,
  sesion: { fecha: string; completada: boolean; notas?: string; }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase.from('sesiones_entrenamiento').insert({
      alumno_id: alumnoId, ...sesion,
    });
    if (error) return { error: error.message };
    revalidatePath('/metricas');
    return {};
  } catch (e) { return { error: (e as Error).message }; }
}

export async function otorgarLogro(
  alumnoId: string,
  logro: { tipo: string; titulo: string; descripcion?: string }
): Promise<{ data?: { id: string; tipo: string; titulo: string; descripcion: string | null; fecha_obtenido: string }; error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { data: existing } = await supabase
      .from('logros').select('id').eq('alumno_id', alumnoId).eq('tipo', logro.tipo).maybeSingle();
    if (existing) return {};
    const { data, error } = await supabase.from('logros').insert({
      alumno_id: alumnoId,
      tipo: logro.tipo,
      titulo: logro.titulo,
      descripcion: logro.descripcion ?? null,
    }).select('id,tipo,titulo,descripcion,fecha_obtenido').single();
    if (error) return { error: error.message };
    revalidatePath('/metricas');
    return { data: data as { id: string; tipo: string; titulo: string; descripcion: string | null; fecha_obtenido: string } };
  } catch (e) { return { error: (e as Error).message }; }
}

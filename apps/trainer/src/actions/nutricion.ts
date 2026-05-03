'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/supabase-server';

export interface DatosFisicosRow {
  id: string;
  alumno_id: string;
  peso_kg: number | null;
  altura_cm: number | null;
  edad: number | null;
  sexo: 'm' | 'f' | null;
  nivel_actividad: string | null;
  fecha_registro: string;
  notas: string | null;
}

export interface PlanNutricionalRow {
  id: string;
  alumno_id: string;
  objetivo_nutricional: string | null;
  distribucion_macros: string | null;
  proteinas_g: number | null;
  carbos_g: number | null;
  grasas_g: number | null;
  calorias_meta: number | null;
  activo: boolean;
}

export interface HistorialPesoRow {
  id: string;
  alumno_id: string;
  peso_kg: number;
  fecha: string;
  notas: string | null;
}

export async function saveDatosFisicos(
  alumnoId: string,
  datos: {
    peso_kg: number;
    altura_cm: number;
    edad: number;
    sexo: 'm' | 'f';
    nivel_actividad: string;
    notas?: string;
  }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('alumnos_datos_fisicos')
      .select('id')
      .eq('alumno_id', alumnoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      peso_kg:        datos.peso_kg,
      altura_cm:      datos.altura_cm,
      edad:           datos.edad,
      sexo:           datos.sexo,
      nivel_actividad: datos.nivel_actividad,
      notas:          datos.notas ?? null,
      fecha_registro: today,
    };

    if (existing) {
      const { error } = await supabase
        .from('alumnos_datos_fisicos')
        .update(payload)
        .eq('id', existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from('alumnos_datos_fisicos')
        .insert({ alumno_id: alumnoId, ...payload });
      if (error) return { error: error.message };
    }

    revalidatePath('/nutricion');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function savePlanNutricional(
  alumnoId: string,
  plan: {
    objetivo_nutricional: string;
    distribucion_macros: string;
    proteinas_g: number;
    carbos_g: number;
    grasas_g: number;
    calorias_meta: number;
  }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();

    await supabase
      .from('planes_nutricionales')
      .update({ activo: false })
      .eq('alumno_id', alumnoId)
      .eq('activo', true);

    const { error } = await supabase
      .from('planes_nutricionales')
      .insert({ alumno_id: alumnoId, ...plan, activo: true });

    if (error) return { error: error.message };
    revalidatePath('/nutricion');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function addHistorialPeso(
  alumnoId: string,
  pesoKg: number,
  fecha: string,
  notas?: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase
      .from('historial_peso')
      .insert({ alumno_id: alumnoId, peso_kg: pesoKg, fecha, notas: notas || null });
    if (error) return { error: error.message };
    revalidatePath('/nutricion');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

'use server';

import { redirect } from 'next/navigation';
import { createClient, getStudentContext } from '@/lib/supabase-server';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function updatePassword(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const password = (formData.get('password') as string)?.trim();
  const confirm = (formData.get('confirm') as string)?.trim();
  if (!password || password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
  if (password !== confirm) return { error: 'Las contraseñas no coinciden' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  await supabase.auth.signOut();
  redirect('/login');
}

export async function getDashboardData() {
  const LEGACY_GOAL_LABELS: Record<string, string> = {
    hypertrophy:     'Hipertrofia',
    hypertrophia:    'Hipertrofia',
    fat_loss:        'Pérdida de grasa',
    strength:        'Fuerza',
    endurance:       'Resistencia',
    flexibility:     'Flexibilidad',
    general_fitness: 'Fitness general',
  };
  const { supabase, studentId, student } = await getStudentContext();
  const today = new Date().toISOString().split('T')[0]!;

  const [pesoRes, rutinaRes, nutricionRes, enrollRes] = await Promise.all([
    supabase.from('historial_peso').select('peso_kg, fecha').eq('alumno_id', studentId).order('fecha', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('rutinas_alumno').select('id, nombre').eq('alumno_id', studentId).eq('activo', true).limit(1).maybeSingle(),
    supabase.from('planes_nutricionales').select('calorias_meta, proteinas_g, carbos_g, grasas_g').eq('alumno_id', studentId).eq('activo', true).limit(1).maybeSingle(),
    supabase.from('clase_alumnos').select('clase_id').eq('alumno_id', studentId),
  ]);

  let proximaClase = null;
  const claseIds = (enrollRes.data ?? []).map((e: any) => e.clase_id as string);
  if (claseIds.length > 0) {
    const { data } = await supabase
      .from('clases')
      .select('titulo, fecha, hora_inicio, tipo')
      .in('id', claseIds)
      .gte('fecha', today)
      .order('fecha', { ascending: true })
      .limit(1)
      .maybeSingle();
    proximaClase = data;
  }

  // Resolve goal IDs to labels (handles both UUID-based and legacy string-code goals)
  let goalNames: string[] = [];
  const rawGoals = student.goals as string[] | null;
  if (rawGoals && rawGoals.length > 0) {
    const { data: goalsData } = await supabase.from('goals').select('id, label').in('id', rawGoals);
    const goalMap = Object.fromEntries((goalsData ?? []).map((g: any) => [g.id, g.label as string]));
    goalNames = rawGoals.map(id => goalMap[id] ?? LEGACY_GOAL_LABELS[id] ?? id);
  }

  return {
    student,
    goalNames,
    peso: pesoRes.data,
    rutina: rutinaRes.data,
    proximaClase,
    nutricion: nutricionRes.data,
  };
}

export async function getRutinaData() {
  const { supabase, studentId } = await getStudentContext();

  const { data: rutina } = await supabase
    .from('rutinas_alumno')
    .select(`
      id, nombre, fecha_inicio, fecha_fin, activo,
      rutina_dias (
        id, orden, nombre,
        rutina_ejercicios (
          id, orden, sets, reps, descanso_seg, notas,
          exercises ( name, muscle_group )
        )
      )
    `)
    .eq('alumno_id', studentId)
    .eq('activo', true)
    .limit(1)
    .maybeSingle();

  return rutina;
}

export async function getHorarioData() {
  const { supabase, studentId } = await getStudentContext();
  const today = new Date().toISOString().split('T')[0]!;

  const { data: enrollments } = await supabase
    .from('clase_alumnos')
    .select('clase_id')
    .eq('alumno_id', studentId);

  const claseIds = (enrollments ?? []).map((e: any) => e.clase_id as string);
  if (claseIds.length === 0) return [];

  const { data } = await supabase
    .from('clases')
    .select('id, titulo, fecha, hora_inicio, hora_fin, tipo, color, notas')
    .in('id', claseIds)
    .gte('fecha', today)
    .order('fecha', { ascending: true })
    .limit(30);

  return data ?? [];
}

export async function getMetricasData() {
  const { supabase, studentId } = await getStudentContext();

  const [pesoRes, medidasRes, bodyRes] = await Promise.all([
    supabase.from('historial_peso').select('peso_kg, fecha, notas').eq('alumno_id', studentId).order('fecha', { ascending: false }).limit(12),
    supabase.from('medidas_corporales').select('fecha, pecho_cm, cintura_cm, cadera_cm, biceps_cm, muslo_cm').eq('alumno_id', studentId).order('fecha', { ascending: false }).limit(5),
    supabase.from('body_metrics').select('weight_kg, body_fat_pct, muscle_mass_kg, measured_at').eq('student_id', studentId).order('measured_at', { ascending: false }).limit(12),
  ]);

  return {
    historialPeso: pesoRes.data ?? [],
    medidas: medidasRes.data ?? [],
    bodyMetrics: bodyRes.data ?? [],
  };
}

export async function getNutricionData() {
  const { supabase, studentId } = await getStudentContext();
  const { data } = await supabase
    .from('planes_nutricionales')
    .select('*')
    .eq('alumno_id', studentId)
    .eq('activo', true)
    .limit(1)
    .maybeSingle();
  return data;
}

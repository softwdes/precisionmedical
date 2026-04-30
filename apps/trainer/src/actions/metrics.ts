'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getAuthContext } from '@/lib/supabase-server';

export async function getStudentBodyMetrics(studentId: string, limit = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('student_id', studentId)
    .order('measured_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addBodyMetricRecord(formData: FormData) {
  const supabase = await createClient();
  const student_id = formData.get('student_id') as string;
  const weight_kg = formData.get('weight_kg') ? parseFloat(formData.get('weight_kg') as string) : null;
  const body_fat_pct = formData.get('body_fat_pct') ? parseFloat(formData.get('body_fat_pct') as string) : null;
  const muscle_mass_kg = formData.get('muscle_mass_kg') ? parseFloat(formData.get('muscle_mass_kg') as string) : null;
  const notes = formData.get('notes') as string | null;

  const { error } = await supabase.from('body_metrics').insert({
    student_id,
    measured_at: new Date().toISOString(),
    weight_kg,
    body_fat_pct,
    muscle_mass_kg,
    notes,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/alumnos/${student_id}`);
}

export async function getExerciseLogs(studentId: string, startDate?: string, endDate?: string) {
  const supabase = await createClient();
  const { data: routines } = await supabase
    .from('student_routines')
    .select('id')
    .eq('student_id', studentId)
    .eq('active', true);

  if (!routines || routines.length === 0) return [];

  const routineIds = routines.map(r => r.id);
  let query = supabase
    .from('exercise_logs')
    .select('*, routine_session:routine_sessions(scheduled_for, status)')
    .in('routine_session_id', routineIds)
    .order('completed_at', { ascending: false });

  if (startDate) query = query.gte('completed_at', startDate);
  if (endDate) query = query.lte('completed_at', endDate);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function logExerciseSet(formData: FormData) {
  const supabase = await createClient();
  const routine_session_id = formData.get('routine_session_id') as string;
  const exercise_name = formData.get('exercise_name') as string;
  const set_number = parseInt(formData.get('set_number') as string);
  const reps = formData.get('reps') ? parseInt(formData.get('reps') as string) : null;
  const weight_kg = formData.get('weight_kg') ? parseFloat(formData.get('weight_kg') as string) : null;
  const rpe = formData.get('rpe') ? parseInt(formData.get('rpe') as string) : null;

  const { data, error } = await supabase.from('exercise_logs').insert({
    routine_session_id,
    exercise_name,
    set_number,
    reps,
    weight_kg,
    rpe,
    completed_at: new Date().toISOString(),
  }).select().single();

  if (error) throw new Error(error.message);

  if (weight_kg && reps) {
    const { data: session } = await supabase
      .from('routine_sessions')
      .select('student_routine:student_routines(student_id)')
      .eq('id', routine_session_id)
      .single();

    const studentId = (session?.student_routine as any)?.student_id;
    if (studentId) {
      const { data: existingPR } = await supabase
        .from('personal_records')
        .select('weight_kg, reps')
        .eq('student_id', studentId)
        .eq('exercise_name', exercise_name)
        .single();

      if (!existingPR || weight_kg > existingPR.weight_kg) {
        await supabase.from('personal_records').upsert({
          student_id: studentId,
          exercise_name,
          weight_kg,
          reps,
          achieved_on: new Date().toISOString().split('T')[0],
        }, { onConflict: 'student_id,exercise_name' });
      }
    }
  }

  return data;
}

export async function getPersonalRecords(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('personal_records')
    .select('*')
    .eq('student_id', studentId)
    .order('achieved_on', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getProgressPhotos(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('progress_photos')
    .select('*')
    .eq('student_id', studentId)
    .order('taken_on', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function uploadProgressPhoto(formData: FormData) {
  const supabase = await createClient();
  const student_id = formData.get('student_id') as string;
  const notes = formData.get('notes') as string | null;
  const file = formData.get('file') as File;

  if (!file) throw new Error('No file provided');

  const fileName = `${student_id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('progress-photos')
    .upload(fileName, file);

  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from('progress_photos').insert({
    student_id,
    storage_path: fileName,
    taken_on: new Date().toISOString().split('T')[0],
    notes,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/alumnos/${student_id}`);
}

// Optimized: single query with embedded relation instead of N+1 per-student queries
export async function getAllStudentsMetrics() {
  const { supabase, trainerId } = await getAuthContext();

  const { data: students, error } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('trainer_id', trainerId)
    .is('archived_at', null);

  if (error || !students) return [];

  // Fetch all latest metrics in one query, then group client-side
  const studentIds = students.map(s => s.id);
  const { data: allMetrics } = await supabase
    .from('body_metrics')
    .select('student_id, weight_kg, body_fat_pct, muscle_mass_kg, measured_at')
    .in('student_id', studentIds)
    .order('measured_at', { ascending: false });

  const latestByStudent = new Map<string, typeof allMetrics extends (infer T)[] | null ? T : never>();
  for (const m of allMetrics ?? []) {
    if (!latestByStudent.has(m.student_id)) latestByStudent.set(m.student_id, m);
  }

  return students.map(s => ({
    ...s,
    latestMetric: latestByStudent.get(s.id) ?? null,
  }));
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAuthContext } from '@/lib/supabase-server';

export async function getStudents() {
  const { supabase, trainerId } = await getAuthContext();
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('trainer_id', trainerId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function deleteStudent(id: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase
      .from('students')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/alumnos');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateStudentModal(id: string, formData: FormData): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const full_name = (formData.get('full_name') as string)?.trim();
    if (!full_name) return { error: 'El nombre es requerido' };
    const email = (formData.get('email') as string)?.trim() || null;
    const phone = (formData.get('phone') as string)?.trim() || null;
    const birth_date = formData.get('birth_date') as string | null;
    const experience_level = formData.get('experience_level') as string | null;
    const goals = formData.getAll('goals') as string[];
    const available_equipment = formData.get('available_equipment') as string | null;
    const { error } = await supabase.from('students').update({
      full_name,
      email,
      phone,
      birth_date: birth_date || null,
      experience_level: experience_level || null,
      goals: goals.length > 0 ? goals : null,
      available_equipment: available_equipment || null,
    }).eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/alumnos');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function getStudent(id: string) {
  const { supabase, trainerId } = await getAuthContext();
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .eq('trainer_id', trainerId)
    .single();

  if (error) return null;
  return data;
}

export async function createStudentModal(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const { supabase, trainerId } = await getAuthContext();
    const full_name = (formData.get('full_name') as string)?.trim();
    if (!full_name) return { error: 'El nombre es requerido' };
    const email = (formData.get('email') as string)?.trim() || null;
    const phone = (formData.get('phone') as string)?.trim() || null;
    const birth_date = formData.get('birth_date') as string | null;
    const experience_level = formData.get('experience_level') as string | null;
    const goals = formData.getAll('goals') as string[];
    const available_equipment = formData.get('available_equipment') as string | null;
    const { error } = await supabase.from('students').insert({
      trainer_id: trainerId,
      full_name,
      email,
      phone,
      birth_date: birth_date ? new Date(birth_date) : null,
      experience_level: experience_level || null,
      goals: goals.length > 0 ? goals : null,
      available_equipment: available_equipment || null,
    });
    if (error) return { error: error.message };
    revalidatePath('/alumnos');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createStudent(formData: FormData) {
  const { supabase, trainerId } = await getAuthContext();
  const full_name = formData.get('full_name') as string;
  const birth_date = formData.get('birth_date') as string | null;
  const experience_level = formData.get('experience_level') as string | null;
  const goals = formData.getAll('goals') as string[];
  const available_equipment = formData.get('available_equipment') as string | null;

  const { error } = await supabase.from('students').insert({
    trainer_id: trainerId,
    full_name,
    birth_date: birth_date ? new Date(birth_date) : null,
    experience_level,
    goals: goals.length > 0 ? goals : null,
    available_equipment,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/alumnos');
  redirect('/alumnos');
}

export async function updateStudent(id: string, formData: FormData) {
  const { supabase } = await getAuthContext();
  const full_name = formData.get('full_name') as string;
  const birth_date = formData.get('birth_date') as string | null;
  const experience_level = formData.get('experience_level') as string | null;
  const goals = formData.getAll('goals') as string[];
  const available_equipment = formData.get('available_equipment') as string | null;

  const { error } = await supabase.from('students').update({
    full_name,
    birth_date: birth_date ? new Date(birth_date) : null,
    experience_level,
    goals: goals.length > 0 ? goals : null,
    available_equipment,
  }).eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath(`/alumnos/${id}`);
  redirect(`/alumnos/${id}`);
}

export async function getStudentMetrics(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('student_id', studentId)
    .order('measured_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getStudentPackages(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('session_packages')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getStudentRoutines(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('student_routines')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createSessionPackage(formData: FormData) {
  const supabase = await createClient();
  const student_id = formData.get('student_id') as string;
  const total_sessions = parseInt(formData.get('total_sessions') as string);
  const amount = parseFloat(formData.get('amount') as string);
  const currency = (formData.get('currency') as string) || 'PEN';
  const expires_on = formData.get('expires_on') as string | null;

  const { error } = await supabase.from('session_packages').insert({
    student_id,
    total_sessions,
    used_sessions: 0,
    amount,
    currency,
    purchased_on: new Date().toISOString().split('T')[0],
    expires_on: expires_on || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/alumnos/${student_id}`);
}

export async function addBodyMetric(formData: FormData) {
  const supabase = await createClient();
  const student_id = formData.get('student_id') as string;
  const weight_kg = formData.get('weight_kg') ? parseFloat(formData.get('weight_kg') as string) : null;
  const body_fat_pct = formData.get('body_fat_pct') ? parseFloat(formData.get('body_fat_pct') as string) : null;
  const muscle_mass_kg = formData.get('muscle_mass_kg') ? parseFloat(formData.get('muscle_mass_kg') as string) : null;
  const notes = formData.get('notes') as string | null;

  const { error } = await supabase.from('body_metrics').insert({
    student_id,
    weight_kg,
    body_fat_pct,
    muscle_mass_kg,
    notes,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/alumnos/${student_id}`);
}

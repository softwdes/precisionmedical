'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/supabase-server';

export async function createRoutineTemplate(formData: FormData) {
  const { supabase, trainerId } = await getAuthContext();
  const name = formData.get('name') as string;
  const goal = formData.get('goal') as string | null;
  const weeks = parseInt(formData.get('weeks') as string) || 4;
  const payload = formData.get('payload') as string;

  const { error } = await supabase.from('routine_templates').insert({
    trainer_id: trainerId,
    name,
    goal,
    weeks,
    generated_by_ai: false,
    payload: JSON.parse(payload || '{}'),
  });

  if (error) throw new Error(error.message);
  revalidatePath('/rutinas');
  redirect('/rutinas');
}

export async function createRoutineTemplateModal(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const { supabase, trainerId } = await getAuthContext();
    const name = (formData.get('name') as string)?.trim();
    if (!name) return { error: 'El nombre es requerido' };
    const goal = (formData.get('goal') as string) || null;
    const weeks = parseInt(formData.get('weeks') as string) || 4;
    const payload = formData.get('payload') as string;
    const { error } = await supabase.from('routine_templates').insert({
      trainer_id: trainerId,
      name,
      goal,
      weeks,
      generated_by_ai: false,
      payload: JSON.parse(payload || '{}'),
    });
    if (error) return { error: error.message };
    revalidatePath('/rutinas');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}


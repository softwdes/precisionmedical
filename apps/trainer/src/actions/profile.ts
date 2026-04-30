'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function getTrainerProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('trainers')
    .select('business_name, bio, specialties')
    .eq('user_id', user.id)
    .single();

  return data ? { ...data, email: user.email ?? '' } : null;
}

export async function updateTrainerProfile(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autenticado' };

    const business_name = (formData.get('business_name') as string)?.trim();
    if (!business_name) return { error: 'El nombre es requerido' };

    const bio = (formData.get('bio') as string) || null;
    const raw = (formData.get('specialties') as string) || '';
    const specialties = raw.split(',').map(s => s.trim()).filter(Boolean);

    const { error } = await supabase
      .from('trainers')
      .update({ business_name, bio, specialties })
      .eq('user_id', user.id);

    if (error) return { error: error.message };
    revalidatePath('/perfil');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updatePassword(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const password = (formData.get('password') as string) || '';
    const confirm = (formData.get('confirm') as string) || '';

    if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
    if (password !== confirm) return { error: 'Las contraseñas no coinciden' };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function updateAdminProfile(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autenticado' };

    const full_name = (formData.get('full_name') as string)?.trim();
    if (!full_name) return { error: 'El nombre es requerido' };

    const { error } = await supabase.auth.updateUser({ data: { full_name } });
    if (error) return { error: error.message };
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
    const confirm  = (formData.get('confirm') as string) || '';

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

'use server';

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getAuthContext } from '@/lib/supabase-server';

export interface AccessResult {
  error?: string;
  link?: string;
  student?: {
    name: string;
    phone: string | null;
    email: string;
    hasAccount: boolean;
  };
}

export async function generateStudentAccess(studentId: string): Promise<AccessResult> {
  try {
    const { supabase, trainerId } = await getAuthContext();

    const { data: student } = await supabase
      .from('students')
      .select('id, full_name, email, phone, user_id')
      .eq('id', studentId)
      .eq('trainer_id', trainerId)
      .single();

    if (!student) return { error: 'Alumno no encontrado' };
    if (!student.email) return { error: 'Este alumno no tiene email registrado. Agrégalo antes de enviar el acceso.' };

    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const studentAppUrl = process.env.NEXT_PUBLIC_STUDENT_APP_URL ?? 'https://student.neuraltrainergym.com';

    const hasAccount = !!student.user_id;
    let result = await admin.auth.admin.generateLink({
      type: hasAccount ? 'recovery' : 'invite',
      email: student.email,
      options: { redirectTo: `${studentAppUrl}/reset-password` },
    });

    if (result.error?.message?.toLowerCase().includes('already been registered')) {
      result = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: student.email,
        options: { redirectTo: `${studentAppUrl}/reset-password` },
      });
    }

    const { data, error } = result;
    if (error || !data?.properties?.action_link) {
      return { error: 'No se pudo generar el link: ' + (error?.message ?? 'error desconocido') };
    }

    const fullUrl = data.properties.action_link;

    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32])
      .join('');

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await admin
      .from('invite_links')
      .insert({ code, full_url: fullUrl, expires_at: expiresAt });

    const link = insertError ? fullUrl : `${studentAppUrl}/acceso/${code}`;

    return {
      link,
      student: {
        name: student.full_name,
        phone: student.phone ?? null,
        email: student.email,
        hasAccount,
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

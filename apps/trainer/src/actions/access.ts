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
    const { data, error } = await admin.auth.admin.generateLink({
      type: hasAccount ? 'recovery' : 'invite',
      email: student.email,
      options: { redirectTo: `${studentAppUrl}/inicio` },
    });

    if (error || !data?.properties?.action_link) {
      return { error: 'No se pudo generar el link: ' + (error?.message ?? 'error desconocido') };
    }

    return {
      link: data.properties.action_link,
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

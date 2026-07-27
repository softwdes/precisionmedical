import { createServerClient } from '@precision-medical/auth/server';
import { db } from '@precision-medical/database';

/**
 * Resuelve el Provider (doctor) de la sesión actual.
 *
 * Cadena: Supabase auth user → users (por email) → Provider.userId.
 * Devuelve null si no hay sesión o si el usuario no tiene perfil de doctor.
 */
export interface SessionProvider {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string;
  status: string;
  employeeId: string | null;
}

export async function getSessionProvider(): Promise<SessionProvider | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const provider = await db.provider.findFirst({
    where: {
      deletedAt: null,
      user: { email: { equals: user.email, mode: 'insensitive' } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      specialty: true,
      status: true,
      employeeId: true,
    },
  });

  return provider;
}

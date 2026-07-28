import { createServerClient } from '@precision-medical/auth/server';
import { db } from '@precision-medical/database';

/**
 * Resuelve el Provider (doctor) de la sesión actual.
 *
 * Puente por EMAIL: la sesión puede vivir en el proyecto Admin (login unificado)
 * mientras el Provider vive en la base Phoenix — el email corporativo (sincronizado
 * desde HR) es la llave común. Devuelve null si no hay sesión o no hay perfil.
 */
export interface SessionProvider {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string;
  status: string;
  employeeId: string | null;
  /** users.id en la base Phoenix — necesario para favoritos (templates, diagnósticos) */
  userId: string | null;
}

export async function getSessionProvider(): Promise<SessionProvider | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const provider = await db.provider.findFirst({
    where: {
      deletedAt: null,
      email: { equals: user.email, mode: 'insensitive' },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      specialty: true,
      status: true,
      employeeId: true,
      userId: true,
    },
  });

  return provider;
}

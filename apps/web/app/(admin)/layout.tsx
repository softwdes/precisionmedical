import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { AppLayout } from '@/components/layout/app-layout';
import { BootAnimation } from '@/components/layout/boot-animation';
import { SessionGuard } from '@/components/layout/session-guard';
import { dbRoleToRole } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

/** El nombre visible de cada rol vive en `metrics.roles`, que ya los tiene. */
const ROLE_KEYS = new Set([
  'SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'EMPLOYEE', 'LAWYER', 'PROVIDER', 'AUDITOR_AI',
]);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const t = await getTranslations();
  const supabase = await createServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirect('/login');
  }

  const adminClient = createAdminClient();
  const { data: user, error } = await adminClient
    .from('users')
    .select('id, firstName, lastName, avatarUrl, role, clinicModules')
    .eq('email', supabaseUser.email!)
    .single();

  if (error || !user) {
    redirect('/api/auth/signout');
  }

  const role: Role = dbRoleToRole(user.role as string);

  /**
   * Módulos del Admin concedidos A MANO (llaves `admin:*` de `clinicModules`).
   *
   * Es la excepción a la matriz por rol: hoy la usa una sola persona, para
   * Finanzas. Solo cuenta un `true` explícito — ver el middleware y
   * `finanzasProcedure`, que son las otras dos mitades del mismo permiso.
   */
  const mods = user.clinicModules as Record<string, boolean> | null;
  const grants = mods
    ? Object.keys(mods).filter((k) => k.startsWith('admin:') && mods[k] === true)
    : [];

  return (
    <BootAnimation>
      {/* Auto-logout after 12h of session lifetime → /login?expired=true */}
      <SessionGuard maxAgeHours={12} />
      <AppLayout
        userName={`${user.firstName} ${user.lastName}`}
        userRole={ROLE_KEYS.has(user.role as string) ? t(`metrics.roles.${user.role}`) : (user.role as string)}
        userEmail={supabaseUser.email ?? ''}
        avatarUrl={user.avatarUrl ?? undefined}
        role={role}
        grants={grants}
        userId={supabaseUser.id}
      >
        {children}
      </AppLayout>
    </BootAnimation>
  );
}

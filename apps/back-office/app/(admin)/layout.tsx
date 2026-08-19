import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { DOCTOR_VIEW_MODULE } from '@/lib/doctor-view-module';
import { AdminShell } from '@/components/layout/admin-shell';
import { UpdateBanner } from '@/components/ui-phoenix/update-banner';
import { ReleaseNotesDialog } from '@/components/ui-phoenix/release-notes-dialog';

// Back-Office · Admin layout
// Server Component — obtiene sesión de Supabase y pasa nombre/rol al shell.
// Si no hay sesión (middleware la redirecciona primero, pero por si acaso):

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN:       'Admin',
  CONTADOR:    'Contador',
  EMPLOYEE:    'Empleado',
  DOCTOR:      'Doctor',
  PROVIDER:    'Proveedor',
  LAWYER:      'Abogado',
  AUDITOR_AI:  'Auditor IA',
};

function initials(first: string, last: string): string {
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export default async function AdminLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  // Obtener usuario autenticado
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Obtener nombre y rol desde la tabla users
  const emailLocal = (user.email ?? '').split('@')[0] ?? '';
  let userName    = user.email ?? 'Usuario';
  let userRole    = '';
  let userInits   = (emailLocal[0] ?? 'U').toUpperCase();
  let allowedModules: Record<string, boolean> | null = null;
  // Portal médico en el menú. Va aparte de `allowedModules` a propósito: ese mapa
  // es "se ve salvo false" y un mapa nulo significa "ve todo", regla que no puede
  // regalar la suplantación de un médico. Acá solo cuenta el sí explícito.
  let canViewAsDoctor = false;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('firstName, lastName, role')
      .eq('email', user.email ?? '')
      .single();

    if (data) {
      userName  = `${data.firstName} ${data.lastName}`.trim();
      userRole  = ROLE_LABELS[data.role as string] ?? data.role;
      userInits = initials(data.firstName ?? '', data.lastName ?? '');
      // Checks por menú POR USUARIO (null = "Visión completa"); admins nunca se restringen
      const isAdminRole = data.role === 'SUPER_ADMIN' || data.role === 'ADMIN';
      if (!isAdminRole && user.email) {
        allowedModules = await fetchUserClinicModules(user.email);
      }
      canViewAsDoctor = isAdminRole || allowedModules?.[DOCTOR_VIEW_MODULE] === true;
    }
  } catch {
    // fallback: inicial del email
  }

  return (
    <>
      <UpdateBanner audience="admin" />
      <ReleaseNotesDialog />
      {/* `IncomingCallListener` DESMONTADO el 2026-08-05: Twilio desvía las
          entrantes a otro número, así que la clínica no recibe ninguna. Montado
          le pedía el micrófono a todos al cargar la app y latía contra el
          servidor cada 60s para poder atender llamadas que nunca llegan.
          El componente y el webhook siguen en el repo, listos y probados, para
          cuando se decida traer las entrantes de vuelta. */}
      <AdminShell
        userName={userName}
        userRole={userRole}
        userInitials={userInits}
        userEmail={user.email ?? ''}
        allowedModules={allowedModules}
        canViewAsDoctor={canViewAsDoctor}
      >
        {children}
      </AdminShell>
    </>
  );
}

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@precision-medical/auth/admin';
import { fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { AdminShell } from '@/components/layout/admin-shell';
import { UpdateBanner } from '@/components/ui-phoenix/update-banner';
import { ReleaseNotesDialog } from '@/components/ui-phoenix/release-notes-dialog';
import { canSeeFirmRequests } from '@/lib/firm-requests-access';
import { canAskCifo } from '@/lib/cifo-access';
import { getSessionUser } from '@/lib/session';

// Back-Office · Admin layout
// Server Component — obtiene sesión de Supabase y pasa nombre/rol al shell.
// Si no hay sesión (middleware la redirecciona primero, pero por si acaso):

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN:       'Admin',
  CONTADOR:    'Contador',
  EMPLOYEE:    'Empleado',
  DOCTOR:      'Provider',
  PROVIDER:    'Proveedor',
  LAWYER:      'Abogado',
  AUDITOR_AI:  'Auditor IA',
};

function initials(first: string, last: string): string {
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export default async function AdminLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  /**
   * El usuario, por el helper MEMOIZADO — no con un cliente propio.
   *
   * Acá había un `createServerClient()` + `supabase.auth.getUser()` sueltos, y
   * eso es un viaje de red de ~180 ms que NO se comparte con nadie: `cache()`
   * memoriza por identidad de función, así que la llamada de este layout y la de
   * `getSessionUser()` que hace la página eran dos viajes distintos para resolver
   * el mismo usuario.
   *
   * Lo irónico es que el docblock de `lib/session.ts` documenta exactamente este
   * error como ya corregido —«el layout, la página y cada helper que la llamaba
   * por su cuenta pagaban ese viaje de nuevo; un render de /doctor hacía 5
   * llamadas»— y este layout se había quedado afuera del arreglo.
   *
   * Cuánto se gana: el layout NO se re-ejecuta en una navegación de cliente, así
   * que esto no toca el clic de un menú. Lo que sí paga es **cada carga completa
   * y cada `router.refresh()`**, y de esos hay 84 en el back-office — uno por
   * cada guardado de diálogo en Pacientes, Mi Día y el Resumen de visita.
   *
   * `canSeeFirmRequests()` de más abajo ya usa el mismo helper, así que ahora las
   * dos resoluciones del layout comparten un solo viaje.
   */
  const user = await getSessionUser();

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

  /**
   * La ficha del usuario y el permiso de "Pedidos de bufetes", EN PARALELO.
   *
   * Eran dos `await` en fila y son independientes: uno lee `users` por correo y
   * el otro resuelve una casilla. Encadenados, el layout sumaba las dos latencias
   * en cada carga completa. Es el mismo `Promise.all` que ya usan los layouts de
   * `/doctor` y `/attorney` — este era el único que iba de a uno.
   *
   * `fetchUserClinicModules` NO entra acá: depende del `role` que devuelve la
   * primera consulta, así que su turno es después y no hay nada que ganar.
   */
  let puedeVerPedidos = false;
  /** Habilita el botón de CIFO en la barra — ver `admin-shell.tsx`. */
  let puedePreguntarCifo = false;

  try {
    const admin = createAdminClient();
    const [fichaRes, verPedidos, preguntarCifo] = await Promise.all([
      admin
        .from('users')
        .select('firstName, lastName, role')
        .eq('email', user.email ?? '')
        .single(),
      canSeeFirmRequests(),
      // Va en el MISMO `Promise.all` a propósito: son dos llamadas de red al
      // proyecto Admin y encadenarlas sumaba ~180 ms a cada carga completa.
      // `canAskCifo` está memorizada por request, así que el dashboard la
      // vuelve a pedir sin pagar de nuevo.
      canAskCifo(),
    ]);
    const { data } = fichaRes;
    puedeVerPedidos = verPedidos;
    puedePreguntarCifo = preguntarCifo;

    if (data) {
      userName  = `${data.firstName} ${data.lastName}`.trim();
      userRole  = ROLE_LABELS[data.role as string] ?? data.role;
      userInits = initials(data.firstName ?? '', data.lastName ?? '');
      // Checks por menú POR USUARIO (null = "Visión completa"); admins nunca se restringen
      const isAdminRole = data.role === 'SUPER_ADMIN' || data.role === 'ADMIN';
      if (!isAdminRole && user.email) {
        allowedModules = await fetchUserClinicModules(user.email);
      }
    }
  } catch {
    /**
     * Fallback: la inicial del correo, y `puedeVerPedidos` en false.
     *
     * ⚠️ Esto cambió de significado al juntar las dos consultas: antes el permiso
     * de "Pedidos de bufetes" se resolvía FUERA del `try`, así que sobrevivía a un
     * fallo de la consulta de `users`. Ahora comparte el `catch`, y si la ficha
     * falla el menú desaparece. Es lo correcto para un menú OPT-IN —ante la duda,
     * no se muestra— pero es un cambio de comportamiento, no un refactor puro.
     */
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
        canSeeFirmRequests={puedeVerPedidos}
        canAskCifo={puedePreguntarCifo}
      >
        {children}
      </AdminShell>
    </>
  );
}

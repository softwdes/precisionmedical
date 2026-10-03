import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@precision-medical/auth/admin';
import { fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { AdminShell } from '@/components/layout/admin-shell';
import { UpdateBanner } from '@/components/ui-phoenix/update-banner';
import { ReleaseNotesDialog } from '@/components/ui-phoenix/release-notes-dialog';
import { canSeeFirmRequests } from '@/lib/firm-requests-access';
import { canAskCifo } from '@/lib/cifo-access';
import { canSeeRewards } from '@/lib/premios';
import { contarPendientes } from '@/lib/conversaciones-sms';
import { getSessionUser } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

// Back-Office · Admin layout
// Server Component — obtiene sesión de Supabase y pasa nombre/rol al shell.
// Si no hay sesión (middleware la redirecciona primero, pero por si acaso):

/**
 * Roles que tienen etiqueta propia en `phoenix.roles`.
 *
 * Acá vivía un mapa en DURO y en español, así que la credencial bajo el nombre
 * decía "Empleado" también en inglés — Edson lo reportó el 2026-10-02 sobre su
 * propia cuenta. No era una traducción incompleta: ese texto nunca pasó por
 * i18n, y con él caían igual "Contador", "Proveedor", "Abogado" y "Auditor IA".
 *
 * Es una lista y no `t.has()` para que el fallback siga siendo el valor crudo
 * del enum: un rol nuevo en la base muestra `SUPER_ADMIN` en pantalla, feo pero
 * cierto, en vez del cartel de clave faltante de next-intl.
 */
const ROLES_CON_ETIQUETA = [
  'SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'EMPLOYEE', 'FRONT_DESK',
  'DOCTOR', 'PROVIDER', 'LAWYER', 'AUDITOR_AI',
] as const;

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
  /** "Mis premios" en el menú. Fuera del `try`: `canSeeRewards` nunca tira
   *  (devuelve false ante cualquier error) y no depende de la ficha. */
  const verPremios = canSeeRewards();

  /**
   * El badge rojo de SMS: conversaciones donde el paciente escribió último.
   *
   * Se resuelve acá, en el servidor, y no con una consulta del navegador: es
   * un `count` agrupado y el layout ya es asíncrono, así que no agrega ni una
   * petición. Se actualiza en cada navegación, que para una cola de trabajo
   * alcanza — nadie mira el menú esperando que cambie solo.
   *
   * Nunca tumba el layout: si la consulta falla, el menú sale sin badge.
   */
  const smsPendientes = contarPendientes().catch(() => 0);

  // Las etiquetas de rol, en el idioma de la sesión. Se pide ACÁ y no dentro
  // del `try`: si la ficha del usuario falla, `userRole` queda vacío y no hace
  // falta, pero pedirlo adentro ataría la traducción al éxito de una consulta
  // al otro proyecto de Supabase.
  const tRoles = await getTranslations('phoenix.roles');

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
      const rol = data.role as string;
      userRole  = (ROLES_CON_ETIQUETA as readonly string[]).includes(rol)
        ? tRoles(rol as (typeof ROLES_CON_ETIQUETA)[number])
        : rol;
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
        canSeeRewards={await verPremios}
        canAskCifo={puedePreguntarCifo}
        sidebarBadges={{ sms: await smsPendientes }}
      >
        {children}
      </AdminShell>
    </>
  );
}

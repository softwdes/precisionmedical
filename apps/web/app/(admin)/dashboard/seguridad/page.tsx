import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { leerSeguridad, mesCerrado, ultimosDias } from './datos';
import { SeguridadClient } from './seguridad-client';

/**
 * Admin → Security Center (2026-10-05).
 *
 * ── Por qué SOLO super_admin ───────────────────────────────────────────────
 *
 * Esta pantalla no muestra únicamente quién ataca: muestra **dónde estamos
 * flojos** — qué app no tiene cabeceras, cuántas cuentas no tienen segundo
 * factor, cuáles entran sin estar activas. Leída al revés, esa lista es un plan
 * de ataque. Por eso el permiso es aparte de `configuracion` y más cerrado que
 * el resto del Admin: ni siquiera los `admin` entran.
 *
 * El guardia va acá Y en `permissions.ts`: el menú esconde el enlace, pero
 * escribir la URL a mano tiene que chocar contra algo real. Sin esto, esconder
 * el ítem sería decoración (ver `feedback-no-esconder-la-accion-bloqueada`).
 *
 * ── Por qué en inglés ──────────────────────────────────────────────────────
 *
 * Erick, 2026-10-03: las vistas de seguridad hablan inglés, igual que los
 * logins. Los textos están en el componente y no en `messages/`, como ya hace
 * la pantalla de login del Admin.
 */
export async function generateMetadata() {
  return { title: 'Security Center' };
}

export const dynamic = 'force-dynamic';

/**
 * La ventana la elige quien mira, y viaja por la URL en vez de por estado del
 * cliente: así el enlace a "los últimos 7 días" se puede pegar en un chat, y
 * `router.refresh()` —el refresco automático de la pantalla— vuelve a pedir
 * exactamente la misma ventana sin que el cliente tenga que acordarse de nada.
 */
const VENTANAS = [1, 2, 7] as const;

/** Cuántos meses cerrados se ofrecen hacia atrás. */
const MESES_ATRAS = 12;

/**
 * Los meses que se pueden pedir, del más reciente al más viejo, en `YYYY-MM`.
 *
 * Se arman ACÁ y no en la pantalla porque el navegador y el servidor pueden
 * estar en husos distintos: una lista calculada en los dos lados puede diferir
 * en el primer o el último día del mes y romper la hidratación. Las etiquetas
 * sí las pone la pantalla, que es la que sabe el idioma elegido.
 */
function mesesDisponibles(): string[] {
  const hoy = new Date();
  return Array.from({ length: MESES_ATRAS }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export default async function SeguridadPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data } = await createAdminClient()
    .from('users').select('role').eq('email', user.email).single();
  if (data?.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const params = await searchParams;
  const meses = mesesDisponibles();

  /*
   * Un mes pedido manda sobre los días. Si el mes no existe o no está en la
   * lista —URL escrita a mano, enlace viejo— se cae a la ventana de días en vez
   * de mostrar un error: esta pantalla tiene que abrir siempre.
   */
  const mesPedido = typeof params.mes === 'string' && meses.includes(params.mes) ? params.mes : null;
  const rango = mesPedido ? mesCerrado(mesPedido) : null;

  const pedido = Number(params.dias);
  const dias = (VENTANAS as readonly number[]).includes(pedido) ? pedido : 2;

  const datos = await leerSeguridad(rango ?? ultimosDias(dias));
  return (
    <SeguridadClient
      datos={datos}
      dias={dias}
      mes={rango ? mesPedido : null}
      meses={meses}
    />
  );
}

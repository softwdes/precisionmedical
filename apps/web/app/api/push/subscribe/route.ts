/**
 * POST   /api/push/subscribe → guarda la suscripción de ESTE navegador.
 * DELETE /api/push/subscribe → la borra (el usuario apagó los avisos).
 *
 * ── Por qué NO se usa Prisma acá, aunque el modelo viva en Prisma ──────────
 *
 * Porque el `DATABASE_URL` de este proyecto apunta a la base del **Admin**, y
 * lo que esta ruta necesita está en la de la **clínica**. Con Prisma, en
 * producción, esto moría con:
 *
 *     PrismaClientInitializationError
 *     Can't reach database server at db.ztyahz….supabase.co:5432
 *
 * Dos cosas mal en una sola línea: el proyecto equivocado, y el puerto directo
 * —que además está muerto desde afuera; acá se entra por el pooler—. Medido en
 * los logs de Vercel el 2026-09-13, después de un rato largo buscándolo en el
 * lugar equivocado (creí que faltaba el binario del motor; no era).
 *
 * Cambiar `DATABASE_URL` no era la salida: no se sabe qué más del Admin lo usa.
 * Así que se entra por el puente que este app YA tiene y que YA está en
 * producción — el mismo `clienteClinica()` con el que CIFO muestra las visitas
 * del día en el panel. Una credencial menos que adivinar y un motor nativo
 * menos que empaquetar.
 *
 * ── El puente que hace falta acá y NO en back-office ────────────────────────
 *
 * Esta app autentica contra el proyecto **Admin**, pero `push_subscriptions`
 * vive en **Phoenix** — y tiene que vivir ahí, porque el cron que empuja los
 * avisos (`alertas-admin`, en back-office) busca a quién avisarle leyendo los
 * roles de la tabla `users` de Phoenix. Guardar la fila con el id de Admin
 * dejaría una suscripción que ningún envío encuentra: el `userId` no matchearía
 * con ningún admin y el aviso no llegaría nunca, sin error en ningún lado.
 *
 * Así que el id se resuelve por EMAIL, el mismo puente que ya usan el portal
 * médico (`get-session-provider`) y el legal (`get-session-lawyer`).
 *
 * Consecuencia que hay que decir en voz alta: **quien no tenga fila en Phoenix
 * no puede encender los avisos desde acá**, y recibe un 409 que lo explica. No
 * es un bug de esta ruta — solo `apps/back-office` provisiona filas de Phoenix,
 * así que esa persona tampoco sería destinataria del cron aunque la fila
 * existiera. La cuenta se provisiona sola entrando una vez al back-office.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { clienteClinica } from '@/lib/cifo/phoenix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CuerpoSuscripcion {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** Servicios de push que conocemos. **No es una lista blanca** — ver abajo. */
const SERVICIOS_CONOCIDOS = [
  'fcm.googleapis.com',                    // Chrome, Edge, Android
  'updates.push.services.mozilla.com',     // Firefox
  'web.push.apple.com',                    // Safari, iOS
  '.notify.windows.com',                   // Edge legacy / WNS
];

/** Hostnames que NUNCA son un servicio de push, y sí un objetivo interno. */
const HOSTS_PROHIBIDOS = ['localhost', '.local', '.internal', '.localdomain'];

/**
 * ¿Se puede aceptar este endpoint?
 *
 * NO es una lista blanca de hosts, y el motivo está aprendido: la primera
 * versión del back-office sí lo era, y un Samsung A56 no pudo encender los
 * avisos porque Samsung Internet emite un endpoint que no estaba en la lista.
 * Una lista de hosts es la lista de los navegadores que se le ocurrieron a
 * alguien, y la gente usa el que viene en su teléfono.
 *
 * Lo que sí se cierra es el riesgo real: que el servidor termine haciendo un
 * POST a un objetivo INTERNO. Se rechaza toda IP literal —ningún servicio de
 * push emite un endpoint por IP— más los hostnames que solo existen en una red
 * interna. Un host desconocido entra, pero queda anotado en el log.
 */
function revisarEndpoint(url: string): { ok: true; conocido: boolean } | { ok: false; motivo: string } {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, motivo: 'no es una URL' }; }

  if (u.protocol !== 'https:') return { ok: false, motivo: 'no es https' };
  if (u.port && u.port !== '443') return { ok: false, motivo: 'puerto no estandar' };

  const host = u.hostname.toLowerCase();

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
    return { ok: false, motivo: 'endpoint por IP' };
  }
  if (HOSTS_PROHIBIDOS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h))) {
    return { ok: false, motivo: 'host interno' };
  }
  if (!host.includes('.')) return { ok: false, motivo: 'host sin dominio' };

  const conocido = SERVICIOS_CONOCIDOS.some((s) =>
    s.startsWith('.') ? host.endsWith(s) : host === s,
  );
  return { ok: true, conocido };
}

/**
 * Id de Phoenix de quien está logueado, o null.
 *
 * `ILIKE` y no `=`: Supabase Auth normaliza el email a minúsculas, así que un
 * `Info@...` guardado en el directorio no matchea con el `info@...` de la
 * sesión. Esa diferencia ya dejó gente sin provisionar antes.
 */
async function idEnPhoenix(email: string): Promise<string | null> {
  const { data, error } = await clienteClinica()
    .from('users')
    .select('id')
    .ilike('email', email)
    .is('deletedAt', null)
    .limit(1);

  if (error) {
    console.error('[push] no se pudo buscar la cuenta en la clinica:', error.message);
    return null;
  }
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

/** Email de la sesión de Admin, o null si no hay sesión. */
async function emailDeSesion(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const email = await emailDeSesion();
  if (!email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const userId = await idEnPhoenix(email);
  if (!userId) {
    // 409 y no 500: la petición está bien, falta el vínculo. El texto explica
    // el arreglo porque acá no hay nada que reintentar.
    return NextResponse.json(
      { error: 'Esta cuenta todavia no existe en la base de la clinica. Entra una vez al Back-Office y volve a intentarlo.' },
      { status: 409 },
    );
  }

  const raw = (await req.json().catch(() => null)) as CuerpoSuscripcion | null;
  const endpoint = raw?.endpoint?.trim();
  const p256dh = raw?.keys?.p256dh?.trim();
  const auth = raw?.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripcion incompleta' }, { status: 400 });
  }
  const revision = revisarEndpoint(endpoint);
  if (!revision.ok) {
    // Se logea el HOST y el motivo: un rechazo mudo se ve como "la campana no
    // se enciende" y no hay forma de saber por qué sin adivinar.
    console.warn(
      `[push] alta rechazada · ${revision.motivo} · host=${(() => {
        try { return new URL(endpoint).hostname; } catch { return '(ilegible)'; }
      })()}`,
    );
    return NextResponse.json({ error: 'Endpoint no valido' }, { status: 400 });
  }
  if (!revision.conocido) {
    console.warn(`[push] servicio de push NUEVO: ${new URL(endpoint).hostname}`);
  }

  const origin = req.headers.get('host') ?? '';
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null;

  /**
   * El `userId` se reasigna en el conflicto a propósito: en un aparato
   * compartido, el último que aceptó es el que debe recibir.
   *
   * `createdAt` se reescribe al reaceptar. Es la única diferencia con el SQL
   * que había antes y no cambia nada: ese campo no lo lee nadie. A cambio, el
   * alta es una sola llamada en vez de "buscar y después decidir".
   */
  const { error } = await clienteClinica()
    .from('push_subscriptions')
    .upsert(
      {
        // El `id` va explícito porque `@default(cuid())` NO existe en la base:
        // el schema se aplicó con `db push` y todo insert que lo omita muere.
        // Trampa ya documentada del proyecto.
        id: crypto.randomUUID(),
        userId,
        origin,
        endpoint,
        p256dh,
        auth,
        userAgent,
        failureCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );

  if (error) {
    console.error('[push] no se pudo guardar la suscripcion:', error.message);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const email = await emailDeSesion();
  if (!email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const userId = await idEnPhoenix(email);
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as CuerpoSuscripcion | null;
  const endpoint = raw?.endpoint?.trim();
  if (!endpoint) return NextResponse.json({ error: 'Falta el endpoint' }, { status: 400 });

  // Acotado al dueño: nadie apaga los avisos de otro mandando su endpoint.
  await clienteClinica()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('userId', userId);

  return NextResponse.json({ ok: true });
}

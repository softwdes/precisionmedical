/**
 * Avisos al celular con la app CERRADA (Web Push).
 *
 * El sondeo del sobre solo corre con una pestaña abierta: en el teléfono la PWA
 * se congela a los segundos y el sistema la mata. Para que suene con la app
 * cerrada el aviso lo tiene que EMPUJAR el servidor, y lo recibe el Service
 * Worker, que despierta solo.
 *
 * ── Lo que puede decir un aviso ─────────────────────────────────────────────
 *
 * SOLO EL REMITENTE. Sin asunto, sin nombre de paciente, sin diagnóstico. Esto
 * se dibuja en la pantalla de bloqueo, y en la clínica hay pacientes y
 * acompañantes al lado — es la misma regla que ya rige el aviso flotante del
 * sobre (ver la nota de `/api/messages/badge`, que por eso manda `latestAuthor`
 * y nada más). El payload viaja cifrado punta a punta, así que el riesgo no es
 * la infraestructura: es la pantalla encendida sobre el escritorio.
 *
 * Quien llame a esto tiene que respetarlo. `cuerpo` no es un campo libre.
 *
 * ── Por qué SQL crudo y no `db.pushSubscription` ───────────────────────────
 *
 * Por el mismo motivo: `db.pushSubscription` no existe hasta correr
 * `prisma generate`, y regenerar el cliente en Windows con dev servers
 * levantados falla por el dll bloqueado (hay `.tmp` de intentos previos en
 * `node_modules`). Con el modelo referenciado desde el cliente sin generar, el
 * `tsc` de todo el app se cae.
 *
 * El módulo de mensajería ya usa `$queryRaw` por razones parecidas (ver
 * `/api/messages/badge`), así que no es una excepción que haya que justificar
 * dos veces. El modelo igual vive en `schema.prisma` para que la próxima
 * generación lo tome y esto se pueda cambiar a la API tipada sin tocar la
 * lógica.
 */

import webpush from 'web-push';
import { db } from '@precision-medical/database';

/** El aviso tal como lo lee el Service Worker (ver `worker/index.js`). */
export interface AvisoPush {
  /** Una línea. Para un mensaje: "Nuevo mensaje" o "3 mensajes nuevos". */
  titulo: string;
  /** SOLO el remitente — ver la nota de cabecera. */
  cuerpo: string;
  /** A dónde lleva el toque. Ruta relativa: el SW la resuelve contra su origen. */
  url: string;
  /**
   * ¿Esa ruta existe SOLO en el back-office?
   *
   * La bandeja de mensajes sí: vive en `clinic` (y en `/doctor` y `/attorney`,
   * que son este mismo app). El Admin es otro dominio y no tiene bandeja, así
   * que una ruta relativa mandada a una suscripción del Admin abre
   * `admin.lienmaster.net/messages`, que **no existe**. El aviso llega, suena,
   * y el toque no lleva a ningún lado.
   *
   * No se puede resolver en el Service Worker como el prefijo del portal: el de
   * allá no sabe nada de este dominio. Se resuelve acá, que es el único lugar
   * que conoce el `origin` de cada suscripción.
   *
   * Los avisos cuya pantalla existe en las DOS apps —`/dashboard`, por
   * ejemplo— NO lo llevan: a cada quien le conviene abrir la suya.
   */
  soloEnLaClinica?: boolean;
  /**
   * Agrupador. Dos avisos con el mismo `tag` se REEMPLAZAN en vez de apilarse:
   * cinco mensajes seguidos dejan una notificación, no cinco.
   */
  tag: string;
  /** Urgente vibra y pide atención; el resto entra callado. */
  urgente?: boolean;
  /**
   * ¿Tiene que llegar YA, aunque el teléfono esté dormido?
   *
   * Va SEPARADO de `urgente` a propósito, porque son dos cosas distintas:
   * `urgente` es cómo se VE (vibra, pide atención, pastilla roja) y esto es
   * cuándo se ENTREGA.
   *
   * Sin esto, un mensaje normal salía con `urgency: 'normal'` y Android podía
   * **retenerlo mientras el teléfono estaba dormido** hasta la próxima ventana
   * de mantenimiento — minutos. Con la pantalla encendida llegaba al instante y
   * con el teléfono en el bolsillo tardaba, que es justo el caso real y el que
   * hace que parezca roto.
   *
   * Erick lo definió el 2026-09-09: un mensaje interno tiene que llegar en el
   * acto. Y no es abusar del servicio: la especificación de Web Push pone
   * "mensaje entrante" como el ejemplo de `high`; `low` y `very-low` son para
   * cosas como estadísticas.
   *
   * El parte de la mañana NO lo usa: a las 7:30 unos minutos no cambian nada, y
   * despertar el teléfono para eso es gastar batería sin motivo.
   */
  inmediato?: boolean;
}

let listo: boolean | null = null;

/**
 * Le pone las claves VAPID a `web-push`, una sola vez por proceso.
 *
 * Devuelve false —con un log, también una sola vez— si falta configuración.
 * Sin claves los avisos quedan apagados y el resto del sistema no se enfrenta:
 * el mensaje se guarda y la bandeja lo muestra igual.
 */
function configurar(): boolean {
  if (listo !== null) return listo;

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:soporte@precisionmedicalcare.com';

  if (!publica || !privada) {
    console.warn('[push] sin claves VAPID: los avisos al celular quedan apagados');
    listo = false;
    return listo;
  }

  try {
    webpush.setVapidDetails(subject, publica, privada);
    listo = true;
  } catch (e) {
    // Una clave mal copiada llega hasta acá: `setVapidDetails` valida el
    // formato. Se avisa y se apaga, en vez de tirar en cada mensaje enviado.
    console.error('[push] claves VAPID inválidas:', (e as Error).message);
    listo = false;
  }
  return listo;
}

/** ¿Está el push configurado y disponible? Lo usa la pantalla de opt-in. */
export function pushConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Los hosts que sirve ESTE app. Cuarto lugar donde aparecen los mismos
 * patrones —la ruta del manifest, las puertas por host del middleware y el
 * worker son los otros tres—; si un día se agrega un portal, se agrega en los
 * cuatro o el nuevo queda a medias.
 */
const PORTALES_PROPIOS = /^(clinic|providers?|attorney)[.]/;

/** El Admin, que desde 2026-09-14 tiene su propia bandeja y su propia ruta. */
const ADMIN = /^admin[.]/;

/**
 * La base absoluta de este app, para los avisos que salen a otro dominio.
 *
 * Sale de la misma variable que usa el link de activación del portal legal
 * (`lib/lawyer-access.ts`), así que no se inventa una fuente nueva. Si no está
 * definida, `destinoPara` deja la ruta relativa: peor que hoy, imposible.
 */
const BASE_PROPIA = process.env.NEXT_PUBLIC_APP_URL?.replace(/[/]+$/, '') ?? null;

/**
 * A dónde tiene que llevar el toque en ESTE dispositivo.
 *
 * Amanda y los dueños solo usan el Admin (decisión de Erick, 2026-09-13): su
 * PWA está instalada en `admin.lienmaster.net` y ahí no hay bandeja. Para esas
 * suscripciones el aviso de un mensaje viaja con la URL **absoluta** de la
 * clínica, y el Service Worker del Admin abre una pestaña en el dominio que sí
 * la tiene. Para todo el resto la ruta sigue siendo relativa y cada worker le
 * pone el prefijo de su portal.
 */
function destinoPara(aviso: AvisoPush, origin: string): string {
  if (!aviso.soloEnLaClinica) return aviso.url;

  if (!BASE_PROPIA) {
    // Sin base no se puede armar el link absoluto y el aviso sale como antes.
    // Se avisa en el log porque si no esto es una funcion apagada que nadie ve:
    // el aviso llega, suena, y el toque no lleva a ningun lado.
    console.warn('[push] falta NEXT_PUBLIC_APP_URL: el aviso a', origin, 'sale con ruta relativa');
    return aviso.url;
  }

  let host: string;
  try { host = new URL(origin).hostname; } catch { return aviso.url; }

  /**
   * Un host que sabe traducir la ruta la resuelve solo.
   *
   * Nuestros tres portales siempre supieron (el worker les pone el prefijo), y
   * desde que el Admin tiene su propia bandeja, también. Su Service Worker
   * reescribe `/messages` a `/dashboard/mensajes`, así que mandarle la URL
   * absoluta de la clínica ahora lo sacaría de su app sin motivo.
   *
   * La rama absoluta se queda para un origen que NO conozcamos: ahí no hay a
   * quién preguntarle cómo se llama la pantalla, y sacar a la persona a la
   * clínica es mejor que dejarla en una ruta que no existe.
   */
  if (PORTALES_PROPIOS.test(host) || ADMIN.test(host) || host === 'localhost') return aviso.url;

  return `${BASE_PROPIA}${aviso.url}`;
}

/**
 * Le manda un aviso a estas personas, en TODOS sus dispositivos suscriptos.
 *
 * Nunca lanza: un aviso que falla no puede tumbar el mensaje que lo originó.
 * El mensaje ya está guardado y se sigue viendo en la bandeja pase lo que pase.
 *
 * @param userIds `users.id` de Phoenix. Se ignora silenciosamente a quien no
 *   tenga ninguna suscripción — la mayoría, hasta que la gente acepte.
 */
export async function enviarAviso(userIds: string[], aviso: AvisoPush): Promise<void> {
  const destinatarios = [...new Set(userIds)].filter(Boolean);
  if (destinatarios.length === 0) return;

  // La guarda va ANTES de consultar la tabla, a propósito: sin claves esto no
  // toca `push_subscriptions`, así que el sistema funciona igual en un entorno
  // donde la tabla todavía no exista.
  if (!configurar()) return;

  const subs = await db.$queryRaw<
    Array<{ id: string; endpoint: string; p256dh: string; auth: string; origin: string }>
  >`
    SELECT "id", "endpoint", "p256dh", "auth", "origin"
      FROM "push_subscriptions"
     WHERE "userId" = ANY(${destinatarios}::text[])
  `;
  if (subs.length === 0) return;

  const muertas: string[] = [];
  const vivas: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...aviso, url: destinoPara(aviso, s.origin) }),
          // 4 h de TTL: un aviso de mensaje que llega al otro día no sirve, y
          // dejarlo colgado en el push service solo genera ruido tardío.
          {
            TTL: 4 * 60 * 60,
            urgency: aviso.inmediato || aviso.urgente ? 'high' : 'normal',
          },
        );
        vivas.push(s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410 = el navegador que emitió esta suscripción ya no existe
        // (desinstalaron la PWA, limpiaron datos del sitio). Se borra: seguir
        // intentando contra un endpoint muerto es basura acumulada.
        if (code === 404 || code === 410) muertas.push(s.id);
        else console.error('[push] envío falló', code, (e as Error).message);
      }
    }),
  );

  // Contabilidad al final y en bloque, para no hacer una escritura por device.
  try {
    if (muertas.length) {
      await db.$executeRaw`DELETE FROM "push_subscriptions" WHERE "id" = ANY(${muertas}::text[])`;
    }
    if (vivas.length) {
      await db.$executeRaw`
        UPDATE "push_subscriptions"
           SET "lastSuccessAt" = NOW(), "failureCount" = 0, "updatedAt" = NOW()
         WHERE "id" = ANY(${vivas}::text[])
      `;
    }
  } catch (e) {
    console.error('[push] limpieza de suscripciones:', e);
  }
}

/**
 * Aviso de mensaje nuevo, con el texto ya armado según la regla de arriba.
 *
 * `destino` es la ruta de la bandeja del portal de cada quien. No se puede
 * decidir acá: el mismo hilo lo leen la clínica en `/messages`, el provider en
 * `/doctor/messages` y el abogado en `/attorney/messages`, y cada suscripción
 * sabe su propio origen. El Service Worker completa el resto.
 */
export async function avisarMensajeNuevo(
  userIds: string[],
  remitente: string,
  threadId: string,
  urgente = false,
): Promise<void> {
  await enviarAviso(userIds, {
    titulo: urgente ? 'Mensaje urgente' : 'Nuevo mensaje',
    cuerpo: remitente ? `de ${remitente}` : 'Tenés un mensaje sin leer',
    // El SW le pone el prefijo del portal según su origen — ver `worker/index.js`.
    url: `/messages?thread=${threadId}`,
    // La bandeja no existe en el Admin: para una suscripción de ese dominio
    // este destino sale absoluto. Ver `destinoPara`.
    soloEnLaClinica: true,
    // Un tag por HILO: dos respuestas al mismo hilo se reemplazan; dos hilos
    // distintos son dos avisos, porque son dos conversaciones.
    tag: `hilo-${threadId}`,
    urgente,
    // Un mensaje interno llega en el acto, urgente o no: alguien del otro lado
    // está esperando una respuesta. Ver la nota de `inmediato` en `AvisoPush`.
    inmediato: true,
  });
}

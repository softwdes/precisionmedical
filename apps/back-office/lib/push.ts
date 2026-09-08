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
 * ── Por qué el import es dinámico ───────────────────────────────────────────
 *
 * `web-push` todavía no está instalado: `pnpm install` en este monorepo con
 * pnpm 10 puede dejar a Prisma sin engines (no hay `onlyBuiltDependencies`) y
 * hay dos sesiones más trabajando en el mismo árbol. Con un `import` estático,
 * un módulo ausente rompe el `tsc` y el `next build` DE TODOS.
 *
 * Así que el especificador va en una variable: TypeScript no lo resuelve, el
 * árbol sigue compilando, y si el paquete no está el aviso se saltea con un log
 * en vez de tumbar el envío del mensaje.
 *
 * ⚠️ ESTO ES UN ANDAMIO, NO LA FORMA FINAL. Con el especificador en una
 * variable el bundler no puede ver la dependencia, y en Vercel lo que no se ve
 * NO SE TRAZA al bundle serverless — el mismo problema que el binario de
 * Prisma, que por eso está listado a mano en `outputFileTracingIncludes`. O
 * sea: mientras esta línea siga así, los avisos NO funcionan en producción,
 * aunque `web-push` esté en el `package.json`.
 *
 * Los dos pasos, en este orden, cuando se pueda parar los dev servers:
 *   1. `pnpm --filter @precision-medical/back-office add web-push`
 *      (+ `-D @types/web-push`) — actualiza también el lockfile, que si no
 *      Vercel falla con `--frozen-lockfile`.
 *   2. reemplazar este bloque por `import webpush from 'web-push'` arriba.
 * Está anotado en `pending-tasks`.
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

import { db } from '@precision-medical/database';

/** Lo mínimo que usamos de `web-push`, para no depender de sus tipos todavía. */
interface WebPush {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: { TTL?: number; urgency?: string },
  ): Promise<unknown>;
}

/** El aviso tal como lo lee el Service Worker (ver `worker/index.js`). */
export interface AvisoPush {
  /** Una línea. Para un mensaje: "Nuevo mensaje" o "3 mensajes nuevos". */
  titulo: string;
  /** SOLO el remitente — ver la nota de cabecera. */
  cuerpo: string;
  /** A dónde lleva el toque. Ruta relativa: el SW la resuelve contra su origen. */
  url: string;
  /**
   * Agrupador. Dos avisos con el mismo `tag` se REEMPLAZAN en vez de apilarse:
   * cinco mensajes seguidos dejan una notificación, no cinco.
   */
  tag: string;
  /** Urgente vibra y pide atención; el resto entra callado. */
  urgente?: boolean;
}

let cliente: WebPush | null = null;
let intentado = false;

/**
 * Carga `web-push` y le pone las claves VAPID. Devuelve null —una sola vez con
 * log— si falta el paquete o falta la configuración.
 */
async function obtenerCliente(): Promise<WebPush | null> {
  if (intentado) return cliente;
  intentado = true;

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:soporte@precisionmedicalcare.com';

  if (!publica || !privada) {
    console.warn('[push] sin claves VAPID: los avisos al celular quedan apagados');
    return null;
  }

  try {
    const especificador = 'web-push';
    const mod = (await import(especificador)) as { default?: WebPush } & WebPush;
    const wp = mod.default ?? mod;
    wp.setVapidDetails(subject, publica, privada);
    cliente = wp;
  } catch {
    console.warn('[push] `web-push` no está instalado: los avisos al celular quedan apagados');
    cliente = null;
  }
  return cliente;
}

/** ¿Está el push configurado y disponible? Lo usa la pantalla de opt-in. */
export function pushConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
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

  const wp = await obtenerCliente();
  if (!wp) return;

  const subs = await db.$queryRaw<
    Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
  >`
    SELECT "id", "endpoint", "p256dh", "auth"
      FROM "push_subscriptions"
     WHERE "userId" = ANY(${destinatarios}::text[])
  `;
  if (subs.length === 0) return;

  const payload = JSON.stringify(aviso);
  const muertas: string[] = [];
  const vivas: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          // 4 h de TTL: un aviso de mensaje que llega al otro día no sirve, y
          // dejarlo colgado en el push service solo genera ruido tardío.
          { TTL: 4 * 60 * 60, urgency: aviso.urgente ? 'high' : 'normal' },
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
    // Un tag por HILO: dos respuestas al mismo hilo se reemplazan; dos hilos
    // distintos son dos avisos, porque son dos conversaciones.
    tag: `hilo-${threadId}`,
    urgente,
  });
}

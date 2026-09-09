/**
 * GET /api/cron/alertas-admin → los críticos del auditor, al teléfono.
 *
 * Erick (2026-09-09): "en admin los pagos y cajas chicas menor al umbral", para
 * SUPER_ADMIN y ADMIN. Las dos cosas ya las detecta el auditor del Admin; lo
 * que faltaba era que llegaran a un teléfono.
 *
 * ── Por qué este cron vive en el BACK-OFFICE y no en el Admin ──────────────
 *
 * Parece fuera de lugar —es una alerta de plata en la app de la clínica— pero
 * es donde puede funcionar sin duplicar nada:
 *
 *   · El push vive acá: `web-push`, `enviarAviso`, el Service Worker con su
 *     handler y las claves VAPID. `apps/web` no tiene NADA de eso, así que
 *     hacerlo allá era repetir la Fase B entera en el otro app.
 *   · Las suscripciones (`push_subscriptions`) están en Phoenix, que es la base
 *     de Prisma de ESTE app.
 *   · Y los hallazgos están en el proyecto de auth (`ztyahz…`), que este app YA
 *     sabe leer con `createAdminClient()` — el mismo cliente que usa
 *     `lib/lawyer-access.ts`.
 *
 * O sea: la detección queda donde están los datos (el Admin), y la entrega
 * donde están las suscripciones (acá). Se acoplan por la tabla
 * `audit_findings`, no por una llamada HTTP entre apps.
 *
 * Y para la persona el resultado es el que importa: el aviso le llega a la PWA
 * que YA tiene instalada y para la que YA dio permiso, en vez de tener que
 * instalar una segunda app y aceptar el permiso otra vez.
 *
 * ── El orden con el auditor ────────────────────────────────────────────────
 *
 * El auditor corre a las 7:30 local (`apps/web`, `/api/cron/auditoria`). Este
 * entra 15 minutos después y levanta lo que quedó escrito. Si el auditor no
 * corrió o no encontró críticos, acá no hay nada y no se manda nada.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { db } from '@precision-medical/database';
import { enviarAviso } from '@/lib/push';
import { horaLocalClinica, claveDia } from '@/lib/fechas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hora local a la que sale el aviso (15 min después del auditor). */
const HORA_DEL_AVISO = 7;

/** Roles que reciben el aviso. Decisión de Erick. */
const ROLES_AVISADOS = ['SUPER_ADMIN', 'ADMIN'] as const;

/**
 * Ventana hacia atrás para juntar hallazgos.
 *
 * No se marca nada como "avisado" —`audit_findings.status` es del flujo de
 * revisión del Admin y no me corresponde tocarlo—, así que la ventana es la que
 * evita repetir: solo lo escrito en la última media hora, que es lo que acaba
 * de encontrar la corrida de las 7:30.
 */
const VENTANA_MIN = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hora = horaLocalClinica();
  if (hora !== HORA_DEL_AVISO) {
    return NextResponse.json({ salteado: true, horaLocal: hora });
  }

  // ── Qué encontró el auditor recién ─────────────────────────────────────────
  const desde = new Date(Date.now() - VENTANA_MIN * 60 * 1000).toISOString();
  const admin = createAdminClient();

  const { data: hallazgos, error } = await admin
    .from('audit_findings')
    .select('module, description, created_at')
    .eq('severity', 'critical')
    .gte('created_at', desde);

  if (error) {
    console.error('[alertas-admin] no se pudieron leer los hallazgos:', error.message);
    return NextResponse.json({ error: 'lectura falló' }, { status: 500 });
  }

  const criticos = hallazgos ?? [];
  if (criticos.length === 0) {
    return NextResponse.json({ criticos: 0, enviados: 0 });
  }

  // ── A quién ────────────────────────────────────────────────────────────────
  //
  // Los roles se leen de Phoenix por Prisma, que es la MISMA tabla contra la
  // que `resolveActor` resolvió el id guardado en cada suscripción. Leer los
  // roles del otro proyecto dejaría ids que no matchean y el aviso no llegaría
  // a nadie, sin un solo error.
  const admins = await db.user.findMany({
    where: { role: { in: [...ROLES_AVISADOS] }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (admins.length === 0) {
    return NextResponse.json({ criticos: criticos.length, enviados: 0, motivo: 'sin admins' });
  }

  // ── El aviso ───────────────────────────────────────────────────────────────
  //
  // Uno solo, agrupado. Tres hallazgos son tres líneas en la pantalla del
  // Admin, pero un solo golpe en el teléfono: lo que hay que saber a las 7:30
  // es "hay plata que mirar hoy", y el detalle está a un toque.
  const cajas = criticos.filter((h) => h.module === 'caja_chica').length;
  const pagos = criticos.length - cajas;

  const partes: string[] = [];
  if (cajas > 0) partes.push(cajas === 1 ? '1 caja bajo el mínimo' : `${cajas} cajas bajo el mínimo`);
  if (pagos > 0) partes.push(pagos === 1 ? '1 pago para revisar' : `${pagos} pagos para revisar`);

  await enviarAviso(admins.map((a) => a.id), {
    titulo: criticos.length === 1 ? 'Hay algo que revisar' : `${criticos.length} cosas que revisar`,
    cuerpo: partes.join(' · '),
    // El detalle vive en el Admin, que es otro dominio: el Service Worker
    // resuelve las rutas contra SU origen, así que acá se manda una ruta de la
    // clínica y desde el panel se salta al Admin. Un aviso que abre una app que
    // la persona quizá no tiene instalada es un aviso que no lleva a ningún lado.
    url: '/dashboard',
    // Un tag por DÍA: si el cron se reintenta, reemplaza en vez de apilar.
    tag: `alertas-admin-${claveDia(new Date())}`,
    // Plata mal puesta o una caja vacía a las 7:30 sí interrumpe.
    urgente: true,
  });

  return NextResponse.json({
    criticos: criticos.length,
    cajas,
    pagos,
    admins: admins.length,
    enviados: admins.length,
  });
}

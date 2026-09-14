/**
 * GET /api/cron/alertas-admin → el parte de la mañana del administrador, 7:45.
 *
 * Erick lo definió en dos pasos. Primero (2026-09-09) pidió lo excepcional: "en
 * admin los pagos y cajas chicas menor al umbral", para SUPER_ADMIN y ADMIN.
 * Después (2026-09-13) lo convirtió en un PARTE DIARIO y agregó el resto:
 *
 *   · pagos pendientes de empleados **y freelancers**
 *   · los vencidos
 *   · cajas activas bajo el mínimo
 *   · citas del día de todas las clínicas **aunque sean 0**
 *   · no-shows
 *   · comisiones sin asignar
 *
 * ── Por qué ahora se manda TODOS los días, incluso sin novedades ───────────
 *
 * Antes era por excepción: sin críticos, nada. El problema es que el silencio
 * era ambiguo — no distingue "todo bien" de "el cron no corrió". Un parte que
 * llega todos los días convierte la ausencia en señal: el día que no llega, algo
 * se rompió. Es el mismo razonamiento del parte de la clínica de las 7:30, y fue
 * el argumento de Erick: "citas del día de todas las clínicas, así sea 0, que
 * envíe de todas formas".
 *
 * Por eso también se dice cuando el auditor NO corrió, en vez de dejar sus tres
 * cifras en cero, que se leen igual que "no hay nada".
 *
 * ── Por qué este cron vive en el BACK-OFFICE y no en el Admin ──────────────
 *
 * Parece fuera de lugar —es un parte de plata en la app de la clínica— pero es
 * donde puede funcionar sin duplicar nada:
 *
 *   · El push vive acá: `web-push`, `enviarAviso`, el Service Worker y las
 *     claves VAPID. `apps/web` no tiene con qué EMPUJAR, solo con qué recibir.
 *   · Las suscripciones (`push_subscriptions`) están en Phoenix, que es la base
 *     de Prisma de ESTE app.
 *   · Los hallazgos del auditor están en el proyecto de auth, que este app YA
 *     sabe leer con `createAdminClient()`.
 *   · Y las citas son de Phoenix, o sea de acá.
 *
 * O sea: la detección queda donde están los datos y la entrega donde están las
 * suscripciones. Se acoplan por tabla, no por una llamada HTTP entre apps.
 *
 * Para la persona el resultado es el que importa: el aviso llega a la PWA que YA
 * tiene instalada —el Admin, en el caso de Amanda y los dueños, que no usan otra
 * cosa— sin instalar una segunda app ni aceptar el permiso otra vez.
 *
 * ── El orden con el auditor ────────────────────────────────────────────────
 *
 * El auditor corre a las 7:30 (`apps/web`, `/api/cron/auditoria`). Este entra 15
 * minutos después y levanta lo que quedó escrito.
 *
 * ── Lo que el aviso NO dice ────────────────────────────────────────────────
 *
 * Montos, nombres y detalle. Solo CANTIDADES. Esto se dibuja en la pantalla de
 * bloqueo: "3 salarios vencen hoy · BOB 12.400" lo lee cualquiera que levante el
 * teléfono del mostrador. El número alcanza para decidir si hay que actuar; la
 * plata está a un toque, adentro.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { enviarAviso } from '@/lib/push';
import { armarParteAdmin, type ParteAdmin } from '@/lib/parte-admin';
import { horaLocalClinica, claveDia } from '@/lib/fechas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hora local a la que sale el parte (15 min después del auditor). */
const HORA_DEL_AVISO = 7;

/** Roles que lo reciben. Decisión de Erick. */
const ROLES_AVISADOS = ['SUPER_ADMIN', 'ADMIN'] as const;

/** Cuántas clínicas se nombran antes de resumir, para que entre en la pantalla. */
const MAX_CLINICAS = 3;

/** `1 cosa` / `N cosas`, sin repetir el ternario en cada línea. */
function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * El titular: el volumen del día, que es lo que le importa a todo el mundo.
 *
 * ⚠️ Sin `export`, igual que `cuerpoDelParte` de abajo. Un `route.ts` solo
 * puede exportar los handlers (`GET`, `POST`, …) y la config (`runtime`,
 * `dynamic`, …): cualquier otro VALOR exportado hace fallar el build entero con
 * `"tituloDelParte" is not a valid Route export field`. Los `export type` /
 * `export interface` sí se pueden, porque desaparecen al compilar.
 *
 * `tsc --noEmit` no lo ve —es una regla de Next, no de TypeScript—, así que el
 * árbol se ve limpio y el que se entera es Vercel. Rompió los deploys del
 * 13-sep durante horas. Si alguna pantalla llega a necesitar estas dos, van a
 * `lib/parte-admin.ts`, que es de donde sale `ParteAdmin`.
 */
function tituloDelParte(p: ParteAdmin): string {
  const cuando = p.citas.esHoy ? 'Hoy' : 'El lunes';
  if (p.citas.total === 0) return `${cuando} no hay citas`;
  return `${cuando}: ${plural(p.citas.total, 'cita', 'citas')}`;
}

/**
 * El cuerpo: las clínicas en una línea y los pendientes en otra.
 *
 * Van en DOS líneas y no en una porque son dos cosas distintas —cómo viene el
 * día y qué hay que mirar— y Android muestra la segunda al desplegar. En una
 * sola, el corte de la pantalla se come justo lo de atrás, que es lo accionable.
 */
function cuerpoDelParte(p: ParteAdmin): string {
  const lineas: string[] = [];

  if (p.citas.porClinica.length > 0) {
    const nombradas = p.citas.porClinica.slice(0, MAX_CLINICAS);
    const resto = p.citas.porClinica.length - nombradas.length;
    const partes = nombradas.map((c) => `${c.nombre} ${c.total}`);
    if (resto > 0) partes.push(`+${resto}`);
    lineas.push(partes.join(' · '));
  }

  const pendientes: string[] = [];

  // Primero lo vencido: es lo único que ya debería haber pasado y no pasó.
  const vencidos = p.salarios.vencidos + p.freelancers.vencidos;
  if (vencidos > 0) pendientes.push(`${plural(vencidos, 'pago vencido', 'pagos vencidos')}`);

  const deHoy = p.salarios.hoy + p.freelancers.hoy;
  if (deHoy > 0) pendientes.push(`${plural(deHoy, 'pago vence hoy', 'pagos vencen hoy')}`);

  if (p.cajasBajas > 0) pendientes.push(plural(p.cajasBajas, 'caja baja', 'cajas bajas'));
  if (p.pagosParaRevisar > 0) {
    pendientes.push(plural(p.pagosParaRevisar, 'pago para revisar', 'pagos para revisar'));
  }
  if (p.comisionesSinAsignar > 0) {
    pendientes.push(plural(p.comisionesSinAsignar, 'comisión sin asignar', 'comisiones sin asignar'));
  }
  if (p.noShowsAyer > 0) pendientes.push(`${plural(p.noShowsAyer, 'no-show', 'no-shows')} ayer`);

  if (pendientes.length > 0) lineas.push(pendientes.join(' · '));
  else if (p.auditorCorrio) lineas.push('Sin pendientes');

  // El aviso no puede callar que le falta la mitad de la información.
  if (!p.auditorCorrio) lineas.push('El auditor no corrió: faltan cajas, pagos y comisiones');

  return lineas.join('\n');
}

/**
 * ¿Esto interrumpe?
 *
 * Solo si hay plata mal puesta o una caja vacía. El parte de un día tranquilo
 * entra callado: si todo vibra, nada vibra.
 */
function esUrgente(p: ParteAdmin): boolean {
  return (
    p.salarios.vencidos + p.freelancers.vencidos > 0 ||
    p.cajasBajas > 0 ||
    p.pagosParaRevisar > 0
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hora = horaLocalClinica();
  if (hora !== HORA_DEL_AVISO) {
    // 200 y no 4xx: la corrida que no toca no es una falla, y un error haría
    // que Vercel marque el cron como fallido todos los días. El cron entra a
    // las dos horas UTC posibles porque Utah cambia de huso dos veces al año.
    return NextResponse.json({ salteado: true, horaLocal: hora });
  }

  // ── A quién ────────────────────────────────────────────────────────────────
  //
  // Los roles se leen de Phoenix por Prisma, que es la MISMA tabla contra la
  // que se resolvió el id guardado en cada suscripción — incluidas las que se
  // crean desde el Admin, que resuelve por correo justamente para eso. Leer los
  // roles del otro proyecto dejaría ids que no matchean y el parte no llegaría
  // a nadie, sin un solo error.
  const admins = await db.user.findMany({
    where: { role: { in: [...ROLES_AVISADOS] }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (admins.length === 0) {
    return NextResponse.json({ enviados: 0, motivo: 'sin admins' });
  }

  const parte = await armarParteAdmin();

  await enviarAviso(
    admins.map((a) => a.id),
    {
      titulo: tituloDelParte(parte),
      cuerpo: cuerpoDelParte(parte),
      // El panel existe en las dos apps, así que la ruta va RELATIVA: cada quien
      // abre la suya. Ver `destinoPara` en `lib/push.ts`.
      url: '/dashboard',
      // Un tag por DÍA: si el cron se reintenta, reemplaza en vez de apilar.
      tag: `parte-admin-${claveDia(new Date())}`,
      urgente: esUrgente(parte),
    },
  );

  return NextResponse.json({ admins: admins.length, enviados: admins.length, parte });
}

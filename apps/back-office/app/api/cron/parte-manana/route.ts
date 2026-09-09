/**
 * GET /api/cron/parte-manana → el parte de la mañana al teléfono, 7:30 Utah.
 *
 * Decisión de Erick (2026-09-09): "a las 7:30am, antes que ingresen, ya saben
 * cuántos tendrán". El aviso llega ANTES de la jornada, no durante: con la
 * clínica abriendo 08:00 ([[regla-horario-de-atencion]]), media hora antes es
 * cuando todavía se puede reacomodar algo.
 *
 * Qué recibe cada uno:
 *   · provider  → sus citas de hoy y la hora de la primera
 *   · clínica   → el total del día y cuántos llegan sin admisión firmada
 *   · abogado   → sus casos frenados, los mismos que le muestra Vigía
 *
 * El del abogado no es "pacientes del día" —él no tiene agenda— sino la cola de
 * atención de Vigía: los casos importantes que están atrasados. Erick lo definió
 * el 2026-09-09, corrigiendo la decisión anterior de dejarlo sin parte: "solo
 * ver los casos como muestra Vigía, los importantes que tienen que ver y están
 * retrasados".
 *
 * Se reusa `colaDeAtencion()` tal cual, sin recalcular nada: si algún día
 * cambia el criterio de "frenado" —los 21 días de meseta, los pesos— el aviso
 * cambia con él. Una segunda versión del criterio sería un aviso que dice algo
 * distinto de lo que muestra la pantalla.
 *
 * ── Por qué se dispara DOS veces y casi siempre no hace nada ────────────────
 *
 * Los crons de Vercel corren en UTC, y 7:30 de Utah son 13:30 UTC en invierno
 * y 14:30 en verano. Un horario UTC fijo se corre una hora dos veces al año, en
 * silencio — le pasa HOY al cron de salarios del Admin, que dice "8am Utah (14
 * UTC)" en su comentario y en invierno mandaría a las 7.
 *
 * Así que el cron entra a las 13:30 Y a las 14:30, y esta ruta pregunta si de
 * verdad son las 7 en la clínica. Exactamente una de las dos pasa, todo el año.
 *
 * ── Por qué recorre las suscripciones y no los usuarios ────────────────────
 *
 * Los avisos son opt-in: quien no aceptó no tiene fila en `push_subscriptions`.
 * Recorrer las suscripciones en vez de la tabla de usuarios hace que el trabajo
 * sea proporcional a quien REALMENTE quiere el parte, no a la nómina.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { enviarAviso } from '@/lib/push';
import { colaIntake } from '@/lib/cola-intake';
import { colaDeAtencion, diasDeLaFila } from '@/lib/vigia/queue';
import { lawyerPorEmail } from '@/lib/get-session-lawyer';
import { rangoDelDia, horaLocalClinica, claveDia, ZONA_CLINICA } from '@/lib/fechas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** La hora local de la clínica a la que sale el parte. */
const HORA_DEL_PARTE = 7;

/** Roles que viven en el portal médico. */
const ROLES_PROVIDER = ['DOCTOR', 'PROVIDER'];

/** Roles del portal legal. */
const ROLES_ABOGADO = ['LAWYER'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Sin el secreto cualquiera puede disparar el parte y mandarle un aviso al
  // teléfono de todo el staff. Vercel manda `Authorization: Bearer <secreto>`.
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hora = horaLocalClinica();
  if (hora !== HORA_DEL_PARTE) {
    // La corrida que no corresponde. Se responde 200 a propósito: un 4xx haría
    // que Vercel lo marque como cron fallido todos los días.
    return NextResponse.json({ salteado: true, horaLocal: hora });
  }

  const { start, end, key } = rangoDelDia();

  /** Quién tiene avisos encendidos, una vez por persona. */
  const suscriptos = await db.$queryRaw<Array<{ userId: string }>>`
    SELECT DISTINCT "userId" FROM "push_subscriptions"
  `;
  if (suscriptos.length === 0) {
    return NextResponse.json({ dia: key, suscriptos: 0, enviados: 0 });
  }

  const ids = suscriptos.map((s) => s.userId);

  /**
   * El rol de cada uno, para saber qué parte le toca.
   *
   * `users` por Prisma —o sea Phoenix— y no por REST contra el proyecto de
   * auth: es la MISMA tabla contra la que `resolveActor` resuelve el
   * `actorUserId` que quedó guardado en la suscripción (`lib/actor.ts` usa
   * `db.user.findFirst`). Consultar la otra dejaría ids sin match y el parte no
   * le llegaría a nadie, en silencio.
   */
  // El email va porque el parte del abogado necesita su ficha de `lawyers`, y
  // el puente entre la sesión y esa tabla es el correo (ver `get-session-lawyer`).
  const usuarios = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, email: true },
  });
  const porUsuario = new Map(usuarios.map((u) => [u.id, u]));

  /**
   * El parte de la clínica es el MISMO para todos, así que se calcula una vez
   * —no una por persona— y se manda a todos los del grupo de una sola llamada.
   * Los de provider y abogado son individuales por definición.
   */
  const idsClinica: string[] = [];
  const providers: string[] = [];
  const abogados: Array<{ id: string; email: string }> = [];

  for (const id of ids) {
    const u = porUsuario.get(id);
    const rol = u?.role ?? '';
    if (ROLES_PROVIDER.includes(rol)) providers.push(id);
    else if (ROLES_ABOGADO.includes(rol)) {
      // Sin correo no hay puente a su ficha: se saltea en vez de fallar.
      if (u?.email) abogados.push({ id, email: u.email });
    } else idsClinica.push(id);
  }

  let enviados = 0;

  // ── El parte de cada provider ──────────────────────────────────────────────
  //
  // Se resuelve el Provider desde el usuario: `appointments.providerId` apunta
  // a la FICHA de provider, no al usuario que inicia sesión.
  if (providers.length > 0) {
    const fichas = await db.provider.findMany({
      where: { userId: { in: providers } },
      select: { id: true, userId: true },
    });

    for (const ficha of fichas) {
      if (!ficha.userId) continue; // `Provider.userId` es opcional en el schema
      const citas = await db.appointment.findMany({
        where: {
          providerId: ficha.id,
          scheduledFor: { gte: start, lt: end },
          // Mismo filtro que Mi Día: una cancelada no es un paciente que viene.
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledFor: 'asc' },
        select: { scheduledFor: true },
      });

      // Sin pacientes no se manda nada. "Hoy tenés 0" es ruido, y el día franco
      // de alguien no es una noticia.
      if (citas.length === 0) continue;

      const primera = new Intl.DateTimeFormat('es-US', {
        timeZone: ZONA_CLINICA, hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(citas[0]!.scheduledFor);

      await enviarAviso([ficha.userId], {
        titulo: citas.length === 1 ? 'Hoy tenés 1 paciente' : `Hoy tenés ${citas.length} pacientes`,
        cuerpo: `El primero a las ${primera}`,
        url: '/doctor',
        // Un tag por DÍA: si el cron se reintenta, reemplaza en vez de apilar.
        tag: `parte-${key}`,
      });
      enviados += 1;
    }
  }

  // ── El parte de la clínica ─────────────────────────────────────────────────
  if (idsClinica.length > 0) {
    const cola = await colaIntake();
    if (cola.citasHoy > 0) {
      const sinFirmar = cola.filas.length;
      await enviarAviso(idsClinica, {
        titulo: cola.citasHoy === 1 ? 'Hoy hay 1 cita' : `Hoy hay ${cola.citasHoy} citas`,
        cuerpo: sinFirmar > 0
          ? `${sinFirmar} llegan sin admisión firmada`
          : 'Todas con su admisión firmada',
        url: '/dashboard',
        tag: `parte-${key}`,
      });
      enviados += idsClinica.length;
    }
  }

  // ── El parte del abogado: sus casos frenados ───────────────────────────────
  //
  // La cola de Vigía, sin recalcular el criterio. Va uno por uno porque cada
  // abogado ve solo los casos de SU bufete (`colaDeAtencion` aplica el scope).
  let abogadosAvisados = 0;
  for (const ab of abogados) {
    const lawyer = await lawyerPorEmail(ab.email);
    // Sin ficha activa no entra al portal, así que tampoco recibe su parte.
    if (!lawyer) continue;

    const cola = await colaDeAtencion(lawyer);
    if (cola.filas.length === 0) continue; // Nada frenado hoy: no se molesta.

    /**
     * El cuerpo lleva DÍAS, no identificadores.
     *
     * `FilaAtencion` trae `paciente` y `caseCode`, y ninguno de los dos entra
     * acá: esto se dibuja en la pantalla de bloqueo, con gente al lado. El
     * número de días alcanza para saber si hay que abrirlo ahora, y el detalle
     * está a un toque — misma regla que el aviso de mensaje, que solo dice
     * quién escribió.
     */
    const peor = cola.filas.reduce((a, b) => (diasDeLaFila(b) > diasDeLaFila(a) ? b : a));
    const dias = diasDeLaFila(peor);

    await enviarAviso([ab.id], {
      titulo: cola.filas.length === 1
        ? '1 caso necesita atención'
        : `${cola.filas.length} casos necesitan atención`,
      cuerpo: `El más atrasado, ${dias} ${dias === 1 ? 'día' : 'días'}`,
      url: '/attorney/vigia',
      tag: `parte-${key}`,
    });
    abogadosAvisados += 1;
    enviados += 1;
  }

  return NextResponse.json({
    dia: key,
    horaLocal: hora,
    suscriptos: ids.length,
    providers: providers.length,
    clinica: idsClinica.length,
    abogados: abogadosAvisados,
    enviados,
  });
}

/**
 * GET /api/cron/recordatorio-cita → el recordatorio de 24 h antes, POR CORREO.
 *
 * Pedido de Erick (2026-09-18): "como recordatorio que le avises 1 día antes,
 * o sea 24 horas antes de su cita, vía email".
 *
 * Hasta acá esto NO existía en v3. Lo único que tocaba las 24 h era
 * `confirm-appointment` (B.4), que es la llamada MANUAL que hace el staff y
 * deja un checklist — no un aviso al paciente. El recordatorio automático lo
 * manda hoy una herramienta externa por SMS; éste sale por correo, así que son
 * dos canales distintos y no dos copias del mismo mensaje.
 *
 * ── Por qué CADA HORA y no una vez al día ──────────────────────────────────
 *
 * "24 horas antes" tomado en serio. Una corrida diaria a las 17:00 le avisa a
 * las 17:00 al que tiene cita a las 8 de la mañana siguiente (15 h antes) y al
 * que la tiene a las 17:30 (24,5 h antes): el mismo cron, dos experiencias
 * distintas. Corriendo cada hora y buscando la franja [+24 h, +25 h), cada
 * paciente recibe el suyo con menos de una hora de error.
 *
 * Y sale dentro del horario de atención: las citas van de 08:00 a 18:00
 * ([[regla-horario-de-atencion]]), así que el correo del día antes cae en esa
 * misma franja. Nadie recibe un correo de la clínica a las 3 de la mañana.
 *
 * La franja se calcula con aritmética de instantes (`ahora + 24 h`), no con
 * horas de pared, así que el cambio de horario de verano no la mueve. Por eso
 * este cron NO necesita la guarda de "¿de verdad son las 7 en Utah?" que sí
 * tiene `parte-manana`.
 *
 * ── Por qué una cita agendada con menos de 24 h no recibe nada ─────────────
 *
 * Porque su franja ya pasó, y está bien: acaba de recibir el SMS del momento
 * de agendar. Recordarle a los diez minutos lo que le acabamos de decir es
 * ruido, y el ruido es lo que entrena a no leer los mensajes de la clínica.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { db, VIGENTES } from '@precision-medical/database';
import { cargarCitaParaAvisar, enviarRecordatorio24h } from '@/lib/recordatorio-cita';

export const dynamic = 'force-dynamic';

/** Solo las citas VIVAS. Una cancelada o ya atendida no se recuerda. */
const VIVAS = ['SCHEDULED', 'CONFIRMED'] as const;

/**
 * Techo de citas por corrida.
 *
 * Una hora de agenda no da para más de un puñado, así que esto nunca debería
 * activarse. Está para que un error de datos —mil citas con la misma fecha por
 * una migración corrida dos veces, que ya pasó en esta base— no se convierta en
 * mil correos antes de que alguien lo note.
 */
const MAX_POR_CORRIDA = 80;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Sin el secreto, cualquiera dispara correos a pacientes reales.
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const ahora = new Date();
  const desde = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const hasta = new Date(ahora.getTime() + 25 * 60 * 60 * 1000);

  const pendientes = await db.appointment.findMany({
    where: {
      ...VIGENTES,
      scheduledFor:      { gte: desde, lt: hasta },
      status:            { in: [...VIVAS] },
      recordatorio24hAt: null,
    },
    select: { id: true },
    orderBy: { scheduledFor: 'asc' },
    take: MAX_POR_CORRIDA,
  });

  let enviados = 0;
  let sinEmail = 0;
  let fallidos = 0;

  for (const { id } of pendientes) {
    /**
     * Se marca ANTES de mandar, no después.
     *
     * Si se marcara después y el proceso muriera en el medio —un timeout de
     * serverless con 80 citas en la cola—, la siguiente corrida volvería a
     * mandarle a los que ya recibieron. Marcando primero, el peor caso es que
     * alguien no reciba su recordatorio; marcando después, el peor caso es que
     * lo reciba varias veces. Entre esos dos, el que no molesta al paciente.
     *
     * Y la marca dice "me ocupé", no "llegó": la entrega vive en
     * `message_logs`, con su estado y su motivo de falla.
     */
    await db.appointment.update({
      where: { id },
      data:  { recordatorio24hAt: new Date() },
    });

    const cita = await cargarCitaParaAvisar(id);
    if (!cita) { fallidos++; continue; }

    // Sin correo no hay nada que mandar. No es una falla: el paciente que solo
    // dejó teléfono ya recibió su SMS al agendar.
    if (!cita.email) { sinEmail++; continue; }

    const res = await enviarRecordatorio24h(cita);
    if (res.enviado) enviados++;
    else {
      fallidos++;
      console.error('[recordatorio-24h] %s: %s %s', id, res.motivo, res.detalle ?? '');
    }
  }

  return NextResponse.json({
    ok: true,
    franja: { desde: desde.toISOString(), hasta: hasta.toISOString() },
    encontradas: pendientes.length,
    enviados,
    sinEmail,
    fallidos,
    // Si esto sale en true, la franja tenía más citas que el techo y quedaron
    // sin avisar. Es un dato para mirar, no un estado normal.
    tope: pendientes.length === MAX_POR_CORRIDA,
  });
}

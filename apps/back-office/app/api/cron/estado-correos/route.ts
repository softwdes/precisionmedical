/**
 * GET /api/cron/estado-correos → ¿qué pasó con los correos que mandamos?
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * El POST a la API de correo devuelve `202 Accepted`, que significa "Twilio lo
 * tomó" y nada más. Para el SMS, el resto de la historia la cuenta un webhook
 * y funciona. Para el correo **no hay webhook que configurar**: el Event
 * Webhook vive en la consola de SendGrid y esta cuenta usa Twilio puro.
 *
 * Resultado medido el 2026-10-07: **247 correos desde el 14-sep, ninguno
 * confirmado, y ni una sola fila modificada después de crearse**. Veníamos
 * diciendo "le avisamos al paciente" sin ninguna prueba de que el correo
 * hubiera llegado.
 *
 * Esto lo contesta preguntando, que es lo que Twilio documenta: una consulta
 * por operación, con el `operationId` que ya guardamos al enviar.
 *
 * ── Por qué CADA HORA, y no un botón ───────────────────────────────────────
 *
 * Porque la respuesta **se vence a los 7 días** y después no se puede
 * recuperar nunca. Un botón contesta lo que pasó hasta que alguien se acuerda
 * de apretarlo; acá olvidarse una semana no deja un hueco, deja un hueco
 * **permanente**. El 7-oct ya había 134 correos vencidos sin respuesta posible.
 *
 * Y por eso también mira 7 días hacia atrás y no solo la última hora: así la
 * primera corrida después de subir esto rescata todo lo que todavía está a
 * tiempo, y cualquier corrida que falle la cubre la siguiente.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import {
  consultarOperacion,
  estadoSegunStats,
  PISA_CORREO,
  DIAS_DE_VENTANA,
} from '@/lib/estado-correo';

export const dynamic = 'force-dynamic';
/** Son ~110 consultas en la primera corrida; los 10 s de default no alcanzan. */
export const maxDuration = 60;

/**
 * Techo por corrida. Si un día se acumulan más, la corrida siguiente sigue
 * donde quedó: se ordenan por el más viejo primero, que es el que está más
 * cerca de vencerse.
 */
const POR_CORRIDA = 300;

/** De a cuántas se pregunta a la vez. Suficiente para 300 en un minuto. */
const EN_PARALELO = 5;

export async function GET(req: NextRequest): Promise<NextResponse> {
  /**
   * Dos puertas: el cron de Vercel, y un admin desde el navegador.
   *
   * La segunda existe por una razón concreta y no por comodidad: la forma de
   * los contadores que devuelve Twilio salió de su documentación, no de una
   * llamada real —desde acá no hay credenciales para probarlo—. Si el nombre
   * de un campo no coincide, esto no explota: devuelve "sin novedad" para
   * todo, que desde afuera se ve EXACTAMENTE igual que hoy. Sin una forma de
   * dispararlo y leer el resultado, ese error pasaría una semana inadvertido
   * mientras los correos se vencen de a 25 por día.
   *
   * Abrir la URL con sesión de admin devuelve los contadores en pantalla.
   */
  const auth = req.headers.get('authorization');
  const esCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!esCron) {
    const acceso = await checkPatientStaff({ admin: true });
    if (acceso.deny) return acceso.deny;
  }

  const desde = new Date(Date.now() - DIAS_DE_VENTANA * 86_400_000);

  /**
   * Las que todavía tienen respuesta posible.
   *
   * `DELIVERED`, `UNDELIVERED` y `FAILED` no se vuelven a preguntar: ya se
   * sabe. Y las de más de 7 días tampoco, porque Twilio ya no las tiene —
   * preguntarlas sería gastar 134 consultas por corrida para recibir 134
   * "no existe".
   */
  const pendientes = await db.messageLog.findMany({
    where: {
      channel: 'EMAIL',
      status: { in: ['QUEUED', 'SENT'] },
      providerMessageId: { not: null },
      createdAt: { gte: desde },
    },
    orderBy: { createdAt: 'asc' },
    take: POR_CORRIDA,
    select: { id: true, providerMessageId: true, status: true },
  });

  let entregados = 0, rebotados = 0, salidos = 0, sinNovedad = 0, vencidas = 0;

  for (let i = 0; i < pendientes.length; i += EN_PARALELO) {
    const tanda = pendientes.slice(i, i + EN_PARALELO);
    await Promise.all(tanda.map(async (fila) => {
      const r = await consultarOperacion(fila.providerMessageId!);
      if (!r.ok) { if (r.vencida) vencidas++; else sinNovedad++; return; }

      const estado = estadoSegunStats(r.operacion);
      if (!estado) { sinNovedad++; return; }

      /**
       * El estado anterior va en el WHERE, no en un `if` previo.
       *
       * Entre leer y escribir puede haberse metido otra corrida (o el webhook,
       * si algún día se habilita) y dejado la fila más avanzada. Preguntando
       * antes y escribiendo después, la carrera se gana sola; preguntando y
       * escribiendo en el mismo UPDATE, no hay carrera.
       */
      const res = await db.messageLog.updateMany({
        where: { id: fila.id, status: { in: PISA_CORREO[estado] } },
        data: {
          status: estado,
          ...(estado === 'DELIVERED'
            ? { deliveredAt: r.operacion.updatedAt ? new Date(r.operacion.updatedAt) : new Date() }
            : {}),
        },
      });
      if (res.count === 0) { sinNovedad++; return; }

      if (estado === 'DELIVERED') entregados++;
      else if (estado === 'SENT') salidos++;
      else {
        rebotados++;
        // Ruidoso a propósito: un correo que no llegó es un paciente que no se
        // enteró de su cita, y eso lo tiene que ver alguien.
        console.error('[cron/estado-correos] NO LLEGÓ · messageLog %s · %s', fila.id, estado);
      }
    }));
  }

  console.log('[cron/estado-correos] consultadas %d · entregados %d · rebotados %d · salidos %d · sin novedad %d · vencidas %d',
    pendientes.length, entregados, rebotados, salidos, sinNovedad, vencidas);

  return NextResponse.json({
    ok: true,
    consultadas: pendientes.length,
    entregados,
    rebotados,
    salidos,
    sinNovedad,
    /** Twilio ya no las tiene: quedan sin respuesta para siempre. */
    vencidas,
  });
}

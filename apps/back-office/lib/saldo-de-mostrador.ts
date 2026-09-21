import { db, type Prisma } from '@precision-medical/database';

/**
 * El saldo que el paciente debe EN EL MOSTRADOR — la fórmula, una sola vez.
 *
 * ── Por qué no alcanza con `balanceDue` ────────────────────────────────────
 *
 * Porque casi nadie debe lo que parece que debe. Hay **dos circuitos de plata**
 * (regla de Erick, 2026-08-08):
 *
 *   · MOSTRADOR — férulas, servicios del catálogo cash y laboratorios. Se
 *     cobran al salir. Son del paciente.
 *   · SEGURO / ABOGADO — los CPT. Los gestiona el encargado contra el seguro o
 *     el bufete y pueden tardar meses. **Nunca se le piden al paciente.**
 *
 * Medido el 2026-09-20: de **6.097 cargos con saldo, 5 son del mostrador**; los
 * otros 6.080 son historia migrada del v2, que cae en el circuito del seguro.
 * En plata (medición del 2026-09-16, en `cobranzas-query.ts`): de $1.377.546 de
 * deuda, **$1.377.371 son de terceros y $164,81 del mostrador**.
 *
 * Un aviso que dispare por `balanceDue` a secas le salta a casi todos y pone a
 * recepción reclamándole al paciente de MVA la plata que debe su abogado. Eso
 * es exactamente lo que el concepto de `payer` existe para evitar.
 *
 * ── Por qué está en su propio archivo ──────────────────────────────────────
 *
 * Porque lo piden varias puntas —el saludo de CIFO, la ficha del paciente, las
 * listas del día— y ya estuvo a punto de escribirse dos veces el mismo día.
 * `saldo-del-cargo.ts` documenta lo que pasa cuando una fórmula de plata vive
 * en tres lugares: tres respuestas distintas para la misma pregunta.
 */

/**
 * Qué cargo es del paciente: el que nació en el mostrador.
 *
 * Es el MISMO criterio que usa la pantalla del caso para decidir el `payer`
 * (`app/api/admin/cases/[id]/billing/route.ts`): se identifica por el origen del
 * cargo, no por un campo que alguien pueda olvidarse de poner.
 */
export const CARGO_DEL_MOSTRADOR = {
  OR: [
    { braceId: { not: null } },
    { cashServiceId: { not: null } },
    { labOrderId: { not: null } },
  ],
} satisfies Prisma.AppointmentBillingWhereInput;

/**
 * El saldo de mostrador de VARIOS pacientes, en una consulta.
 *
 * Devuelve un `Map` y no una lista: quien llama casi siempre ya tiene sus
 * pacientes y lo que necesita es preguntar por uno. Los que no deben nada no
 * están en el mapa — leer con `?? 0`.
 */
export async function saldosDeMostrador(patientIds: string[]): Promise<Map<string, number>> {
  // Sin nadie en la lista no hay nada que preguntar. Sin este corte, un `in: []`
  // se va igual a la base para volver vacío.
  if (patientIds.length === 0) return new Map();

  /**
   * Sin `groupBy`: Prisma no agrupa por un campo de la relación, así que
   * agrupar por cita obligaría a un segundo viaje para llegar al paciente. Las
   * filas que matchean son un puñado —5 en toda la base— y se suman acá.
   */
  const cargos = await db.appointmentBilling.findMany({
    where: {
      balanceDue: { gt: 0 },
      appointment: { patientId: { in: patientIds } },
      ...CARGO_DEL_MOSTRADOR,
    },
    select: { balanceDue: true, appointment: { select: { patientId: true } } },
  });

  const porPaciente = new Map<string, number>();
  for (const c of cargos) {
    const pid = c.appointment.patientId;
    porPaciente.set(pid, (porPaciente.get(pid) ?? 0) + Number(c.balanceDue));
  }
  // Redondeo al cerrar y no en cada suma: sumar centavos ya redondeados arrastra
  // el error, y acá cada cargo puede traer decimales del descuento.
  for (const [pid, monto] of porPaciente) {
    porPaciente.set(pid, Math.round(monto * 100) / 100);
  }
  return porPaciente;
}

/** El de UNO. Misma fórmula; existe para que la ficha no arme un array de uno. */
export async function saldoDeMostrador(patientId: string): Promise<number> {
  return (await saldosDeMostrador([patientId])).get(patientId) ?? 0;
}

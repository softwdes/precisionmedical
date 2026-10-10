import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal } from '@/lib/decrypt';
import { saldosDeMostrador } from '@/lib/saldo-de-mostrador';

/**
 * Quién viene hoy y hay que cobrarle antes de atenderlo.
 *
 * ── Dos fuentes, una línea ─────────────────────────────────────────────────
 *
 * 1. **El saldo del mostrador** — automático y exacto. La fórmula y el porqué
 *    viven en `saldo-de-mostrador.ts`: en resumen, `balanceDue` a secas le
 *    saltaría a casi todos, porque el 99,99% de la deuda es del seguro o del
 *    abogado y no del paciente.
 *
 * 2. **La marca manual** (`collectBeforeVisit`) — la roja del v2: *"no lo
 *    atiendan sin un pago sustancial"*. Es CRITERIO, no aritmética, y hoy es la
 *    que hace el trabajo: con 5 cargos de mostrador con saldo en toda la base,
 *    el número solo casi no avisaría de nadie.
 *
 * 3. **El crédito en cobranza** (`creditOnFile`) — la marca del signo
 *    CONTRARIO: a este paciente NO se le pide el copago, porque la plata está
 *    retenida a su nombre en CBO. Entra por la misma puerta a propósito: la
 *    pregunta del mostrador es una sola —qué le pido a esta persona cuando
 *    llega— y tener dos listas para contestarla es tener una que alguien no mira.
 *
 * Las tres entran por la misma puerta y salen en la misma línea del saludo.
 */

export interface DeudaDelDia {
  patientId: string;
  /** Ya descifrado: los nombres viajan cifrados en la base. */
  nombre: string;
  /** Saldo del MOSTRADOR. Puede ser 0 si solo está la marca manual. */
  monto: number;
  /** La marca de criterio: no lo atiendas sin pasar por caja. */
  marcado: boolean;
  /** El texto que dejó quien marcó. Es lo más útil de los dos. */
  nota: string | null;
  /**
   * La marca del signo CONTRARIO: tiene crédito retenido en CBO, así que el
   * copago **no se le pide**.
   *
   * Vive en la misma línea que la deuda porque es la misma pregunta —qué le
   * pido a esta persona cuando llega— y porque un paciente puede tener las dos
   * cosas: crédito para el copago y, aparte, un brace sin pagar.
   */
  credito: boolean;
  /** Lo que escribió quien marcó el crédito. */
  notaCredito: string | null;
}

/**
 * Los de la lista que tienen algo que cobrar, o marca.
 *
 * Recibe los `patientId` en vez de resolverlos por su cuenta: **el alcance lo
 * pone quien llama**, y así la misma función sirve para los dos portales sin
 * saber nada de ninguno — recepción le pasa los de toda la clínica, el provider
 * solo los suyos. Es la misma inversión de alcance que ya rige en CIFO.
 */
export async function deudasDelDia(patientIds: string[]): Promise<DeudaDelDia[]> {
  if (patientIds.length === 0) return [];

  // En paralelo: son dos tablas sin relación entre sí, y un `include` traería
  // todos los cargos de cada paciente para descartarlos en memoria.
  const [pacientes, saldos] = await Promise.all([
    db.patient.findMany({
      where: { id: { in: patientIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        collectBeforeVisit: true,
        collectBeforeVisitNote: true,
        creditOnFile: true,
        creditOnFileNote: true,
      },
    }),
    saldosDeMostrador(patientIds),
  ]);

  return pacientes
    .map((p) => ({
      patientId: p.id,
      nombre: `${decryptFieldOrOriginal(p.firstName) ?? ''} ${decryptFieldOrOriginal(p.lastName) ?? ''}`.trim(),
      monto: saldos.get(p.id) ?? 0,
      marcado: p.collectBeforeVisit,
      nota: p.collectBeforeVisitNote,
      credito: p.creditOnFile,
      notaCredito: p.creditOnFileNote,
    }))
    // Solo los que tienen algo que decir. Un paciente sin saldo y sin ninguna
    // de las dos marcas no es una línea con un cero: no es una línea.
    //
    // El crédito entra aunque el monto sea 0, y es el punto: sin saldo de
    // mostrador y sin marca roja, el paciente con crédito no aparecería — y es
    // justo del que hay que avisar, porque si no, se le pide el copago.
    .filter((d) => d.marcado || d.credito || d.monto > 0)
    /**
     * Primero las instrucciones, después los números.
     *
     * Entre las dos marcas gana la roja: frena la atención de una persona, y
     * eso no puede quedar debajo de un aviso de "a éste no le cobres". Dentro
     * de cada grupo, el monto más alto arriba.
     */
    .sort((a, b) =>
      Number(b.marcado) - Number(a.marcado)
      || Number(b.credito) - Number(a.credito)
      || b.monto - a.monto);
}

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
 * Las dos entran por la misma puerta y salen en la misma línea del saludo.
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
    }))
    // Solo los que tienen algo que decir. Un paciente sin saldo y sin marca no
    // es una línea con un cero: no es una línea.
    .filter((d) => d.marcado || d.monto > 0)
    // Primero los marcados —son una instrucción, no un número— y dentro de cada
    // grupo, el monto más alto arriba.
    .sort((a, b) => Number(b.marcado) - Number(a.marcado) || b.monto - a.monto);
}

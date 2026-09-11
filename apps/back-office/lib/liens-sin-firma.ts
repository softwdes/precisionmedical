import { db } from '@precision-medical/database';
import { CLOSED_STATUSES } from '@/lib/attorney-portal';

/**
 * El caso que se cerró SIN el lien firmado por el abogado.
 *
 * ── Por qué esto vive acá y no adentro de quien lo pregunta ──────────────────
 *
 * El criterio tiene tres condiciones sutiles y las tres importan:
 *
 *   1. `signatureExempt: false` — hay casos que legítimamente no llevan lien.
 *      Contarlos sería inventar un problema que no existe.
 *   2. `closedAt: { not: null }` — solo los cierres que vimos pasar. Un caso con
 *      status cerrado pero sin fecha es data vieja de la migración, no un cierre.
 *   3. `signerType: 'ATTORNEY'` — la firma que falta es la del abogado. La del
 *      paciente es otra cosa y está en la misma tabla.
 *
 * Escribir eso dos veces es garantizar que un día el saludo de CIFO diga 12 y la
 * cola de Vigía muestre 9, sin que nadie sepa cuál miente. Así que el `where` es
 * uno solo y lo importan los dos: `vigia/queue.ts` para armar sus filas, y el
 * dashboard para contar.
 *
 * ── Por qué CERRADO y no "lien sin firmar" a secas ───────────────────────────
 *
 * En un caso ABIERTO y recién entrado el lien sin firmar es lo normal: todavía
 * no llegó el momento. Contar esos daría un número enorme que no pide ninguna
 * acción, y un número que nadie puede bajar deja de leerse a la semana.
 *
 * Cerrado es distinto: el caso terminó y el papel que respalda el cobro no está.
 * Por eso en la cola de Vigía pesa 80 — es de lo más caro que hay ahí.
 */
export const WHERE_LIEN_SIN_FIRMA_CERRADO = {
  status: { in: CLOSED_STATUSES as unknown as never[] },
  signatureExempt: false,
  closedAt: { not: null },
  lienSignatures: { none: { signerType: 'ATTORNEY' } },
} as const;

/**
 * Cuántos hay, para toda la clínica.
 *
 * Sin `scope`: el dashboard es de la clínica y ve todo, al revés del portal
 * legal, donde el mismo criterio va filtrado por bufete. Es un `count` — no trae
 * ni un caso a memoria.
 */
export async function contarLiensSinFirmaCerrados(): Promise<number> {
  return db.case.count({
    where: { ...WHERE_LIEN_SIN_FIRMA_CERRADO, deletedAt: null },
  });
}

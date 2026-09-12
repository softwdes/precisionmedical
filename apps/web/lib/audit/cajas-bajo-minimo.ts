import type { createAdminClient } from '@precision-medical/auth';

/**
 * El cliente del proyecto del Admin — que es donde viven las cajas.
 *
 * Se tipa desde `createAdminClient` y no importando `@supabase/supabase-js`:
 * el SDK no es dependencia directa de esta app y agregarlo solo para un tipo
 * sería traer un paquete entero por una firma.
 */
type ClienteAdmin = ReturnType<typeof createAdminClient>;

export interface CajaBaja {
  id: string;
  name: string;
  currency: string;
  balance: number;
  lowBalanceThreshold: number;
  /** Cuánto falta para llegar al mínimo. Es lo accionable: el monto a reponer. */
  falta: number;
}

/**
 * Las cajas por debajo de su mínimo — la regla, una sola vez.
 *
 * ── Las dos guardas, que costaron trabajo y NO son opcionales ───────────────
 *
 * 1. **Solo cajas activas.** Una caja desactivada con saldo cero no es un
 *    problema: es una caja que ya no se usa.
 * 2. **Solo cajas con al menos una transacción.** Una caja recién creada arranca
 *    en cero, y cero siempre está por debajo de cualquier mínimo. Sin esta
 *    guarda, cada caja nueva disparaba una alerta crítica el día que se creaba.
 *
 * Las dos venían del auditor (`runAuditScan`), donde se escribieron después de
 * comerse los falsos positivos. Se extraen acá para que la herramienta de CIFO
 * las use TAL CUAL en vez de reimplementarlas: una segunda copia se separa de la
 * original en el primer cambio, y entonces el agente y el correo de la mañana
 * dicen cosas distintas sobre la misma caja.
 *
 * ⚠️ El comparador es `<` ESTRICTO, igual que el auditor. La pantalla de
 * Finanzas usa `<=`, así que una caja exactamente en su mínimo sale marcada ahí
 * y no acá. Es una diferencia real y vieja; no se toca desde este archivo
 * porque cambiar el criterio cambia a quién se le avisa — es decisión de Erick,
 * no un detalle de implementación.
 */
export async function cajasBajoMinimo(supabase: ClienteAdmin): Promise<CajaBaja[]> {
  const { data: cajas } = await supabase
    .from('cash_boxes')
    .select('id, name, currency, balance, lowBalanceThreshold')
    .eq('is_active', true);

  const bajas = (cajas ?? []).filter(
    (b: { balance: number; lowBalanceThreshold: number }) =>
      Number(b.balance) < Number(b.lowBalanceThreshold),
  );
  if (bajas.length === 0) return [];

  const { data: movs } = await supabase
    .from('cash_transactions')
    .select('cashBoxId')
    .in('cashBoxId', bajas.map((b: { id: string }) => b.id));

  const aperturadas = new Set((movs ?? []).map((t: { cashBoxId: string }) => t.cashBoxId));

  return bajas
    .filter((b: { id: string }) => aperturadas.has(b.id))
    .map((b: Omit<CajaBaja, 'falta'>) => ({
      id: b.id,
      name: b.name,
      currency: b.currency,
      balance: Number(b.balance),
      lowBalanceThreshold: Number(b.lowBalanceThreshold),
      falta: Number(b.lowBalanceThreshold) - Number(b.balance),
    }));
}

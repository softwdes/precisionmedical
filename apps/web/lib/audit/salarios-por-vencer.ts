import type { createAdminClient } from '@precision-medical/auth';

type ClienteAdmin = ReturnType<typeof createAdminClient>;

export interface SalariosPorVencer {
  /** Vencen HOY en la zona de la clínica. */
  hoy: number;
  /** Vencen exactamente en 3 días — el mismo aviso anticipado que manda el cron. */
  enTresDias: number;
}

/**
 * Los salarios pendientes que vencen — la regla, una sola vez.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 *
 * Del cron `api/cron/salary-alerts`, que ya detecta esto y manda la
 * notificación a la campana con enlace a `/dashboard/employees?tab=pagos`. Se
 * extrae acá para que el aviso de CIFO use la MISMA regla y no una copia: si un
 * día cambia la ventana o el estado que cuenta, se mueven los dos juntos.
 *
 * ── La sutileza de la fecha, que costó un bug ──────────────────────────────
 *
 * NO se filtra por rango UTC directo. Se trae una ventana ANCHA (de ayer a
 * dentro de 4 días) y se compara la fecha **local de Utah** en JS. El comentario
 * del cron explica por qué: un pago creado a última hora de Utah tiene un UTC
 * que cae en el día siguiente, y el filtro por rango se lo perdía.
 *
 * Cuenta solo `status = 'PENDING'`: un salario ya pagado no vence.
 */
export async function salariosPorVencer(supabase: ClienteAdmin): Promise<SalariosPorVencer> {
  const fechaUtah = (dias: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  };

  const desde = new Date();
  desde.setDate(desde.getDate() - 1);
  const hasta = new Date();
  hasta.setDate(hasta.getDate() + 4);

  const { data } = await supabase
    .from('payments')
    .select('id, scheduledDate, status')
    .eq('status', 'PENDING')
    .gte('scheduledDate', desde.toISOString())
    .lte('scheduledDate', hasta.toISOString());

  const diaDe = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

  const filas = (data ?? []) as Array<{ scheduledDate: string }>;
  return {
    hoy: filas.filter((p) => diaDe(p.scheduledDate) === fechaUtah(0)).length,
    enTresDias: filas.filter((p) => diaDe(p.scheduledDate) === fechaUtah(3)).length,
  };
}

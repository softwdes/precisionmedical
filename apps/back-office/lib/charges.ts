/**
 * Escribir un cargo en una cita.
 *
 * Un cargo puede ir por dos circuitos y cada uno tiene su tabla:
 *
 *  · **INSURANCE** — es una línea del JSON `plannedServiceCodes` de la cita.
 *    Después hay que llamar a `sync-billing`, que es quien crea la fila real en
 *    `appointment_billing` (la deuda). Sin ese segundo paso el cargo se ve en la
 *    cita y no existe en facturación.
 *  · **CASH** — tabla propia (`cash_services`), y su fila de facturación la crea
 *    el mismo endpoint. Un inyectable aplicado dos veces son dos cobros
 *    legítimos, así que acá no se deduplica.
 *
 * Vive en un módulo aparte porque lo necesitan dos pantallas: el tab de Servicios
 * del panel de la cita y el modal de penalidad de Admisión del día.
 *
 * @todo El panel de la cita todavía tiene su propia copia de esta escritura
 *       (`addBillable`). Migrarlo acá cuando se lo toque — no se hizo en el mismo
 *       cambio para no pisar trabajo en curso de otra sesión en ese archivo.
 */

/** Una línea de `plannedServiceCodes`. */
export interface PlannedService {
  id: string;
  code: string;
  description: string;
  fee: number;
  category: string;
}

/**
 * Lo que devuelve el picker de cargos, en forma estructural para no acoplar este
 * módulo a un componente. Es `BillableItem` de `charge-picker-dialog`.
 */
export interface CargoElegido {
  source: 'INSURANCE' | 'CASH';
  refId: string;
  code: string;
  name: string;
  price: number;
  category: string | null;
  unitLabel: string | null;
  insuranceCode: string | null;
}

/** Los cargos que la cita ya tiene. `GET /api/admin/appointments/:id` los trae. */
export async function leerCargos(appointmentId: string): Promise<PlannedService[]> {
  const res = await fetch(`/api/admin/appointments/${appointmentId}`);
  if (!res.ok) return [];
  const d = (await res.json()) as { plannedServiceCodes?: PlannedService[] };
  return d.plannedServiceCodes ?? [];
}

export interface AgregarCargoResultado {
  ok: boolean;
  /** La lista nueva de `plannedServiceCodes` (igual a la anterior si fue CASH). */
  servicios: PlannedService[];
  /** Mensaje para mostrar cuando `ok` es false. */
  error?: string;
}

/**
 * Agrega un cargo a la cita y deja la deuda creada.
 *
 * `caseId` es obligatorio para el circuito de seguro: sin caso no hay dónde
 * colgar la deuda y `sync-billing` responde `no_case` sin escribir nada. Se
 * devuelve el error en vez de fallar en silencio, que es exactamente lo que
 * pasaba antes.
 */
export async function agregarCargo(opts: {
  appointmentId: string;
  caseId: string | null | undefined;
  item: CargoElegido;
  /** Lo que la cita ya tenía — se le agrega encima. */
  actuales: PlannedService[];
}): Promise<AgregarCargoResultado> {
  const { appointmentId, caseId, item, actuales } = opts;

  if (item.source === 'CASH') {
    const res = await fetch(`/api/admin/cash-services/${appointmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalogItemId: Number(item.refId),
        code:      item.code,
        name:      item.name,
        unitPrice: item.price,
        cptCode:   item.insuranceCode,
        unitLabel: item.unitLabel,
        quantity:  1,
      }),
    });
    return res.ok
      ? { ok: true, servicios: actuales }
      : { ok: false, servicios: actuales, error: 'CASH_FAILED' };
  }

  // El JSON indexa por código: un duplicado se perdería igual, así que se avisa
  // en vez de escribir dos veces lo mismo.
  if (actuales.some((s) => s.code === item.code)) {
    return { ok: true, servicios: actuales };
  }

  const siguientes: PlannedService[] = [
    ...actuales,
    {
      id:          item.refId,
      code:        item.code,
      description: item.name,
      fee:         item.price,
      category:    item.category ?? '',
    },
  ];

  const res = await fetch(`/api/admin/appointments/${appointmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plannedServiceCodes: siguientes }),
  });
  if (!res.ok) return { ok: false, servicios: actuales, error: 'PATCH_FAILED' };

  // El cargo recién existe como deuda después de esto.
  const sync = await fetch(`/api/admin/appointments/${appointmentId}/sync-billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: caseId ?? undefined }),
  });
  const syncBody = await sync.json().catch(() => ({}) as { reason?: string });
  if ((syncBody as { reason?: string }).reason === 'no_case') {
    return { ok: false, servicios: siguientes, error: 'NO_CASE' };
  }

  return { ok: true, servicios: siguientes };
}

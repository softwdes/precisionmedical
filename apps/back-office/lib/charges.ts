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
 * ─── Deuda conocida: el panel de la cita tiene su propia copia ───────────────
 *
 * `appointment-detail-panel.tsx` escribe los cargos por su lado
 * (`addBillable` → `addService` → `patchServices`). **No lo migres llamando a
 * `agregarCargo` desde ahí: eso sería una regresión.** El panel hace tres cosas
 * que esta función no:
 *
 *  1. Es optimista con rollback — pinta la lista antes de saber la respuesta y
 *     vuelve atrás con `previo` si el PATCH falla. Sin eso la pantalla muestra un
 *     cargo quitado que sigue facturado.
 *  2. Traduce el rechazo a una frase para el mostrador (`explicarRechazo`): un
 *     cargo ya cobrado no se puede quitar, y dice cuánto se pagó.
 *  3. Usa la fila que devuelve el circuito de efectivo para su propia lista; acá
 *     se descarta.
 *
 * Y `patchServices` es el primitivo de **tres** operaciones (agregar, quitar y
 * editar el fee), no solo de agregar.
 *
 * La forma correcta, cuando alguien toque ese archivo por otra razón:
 *
 *  · Subir a esta lib el primitivo `guardarCargos(appointmentId, caseId, lista)`
 *    — el par PATCH + `sync-billing`, que es lo único realmente duplicado.
 *  · Subir también `explicarRechazo`, para que las dos pantallas den el mismo
 *    mensaje.
 *  · `agregarCargo` pasa a ser un envoltorio fino sobre `guardarCargos`.
 *  · El `patchServices` del panel se queda con lo suyo (optimismo, rollback,
 *    `savedOk`, `onRefresh`) y solo delega la red.
 *  · El circuito de efectivo devuelve la fila creada.
 *
 * No se hizo aparte porque **no arregla ningún bug vivo** (medido 2026-08-29:
 * 0 códigos duplicados en el catálogo activo y 0 citas sin caso de 14.631, así
 * que ni la diferencia de dedupe `id`/`code` ni el `no_case` que el panel se
 * traga son alcanzables hoy) y toca el camino del dinero. El costo real de ese
 * cambio es la prueba en navegador de los cuatro caminos, no el código.
 */

/** Una línea de `plannedServiceCodes`. */
export interface PlannedService {
  id: string;
  code: string;
  description: string;
  /**
   * EL CARGO DE LA LÍNEA, no el precio unitario.
   *
   * Es lo que va en la casilla 24F del CMS-1500 y lo que `sync-billing` escribe
   * como `totalCost`. Con `units: 2` este número ya viene multiplicado — por eso
   * agregar la cantidad no obligó a tocar ninguna de las cinco pantallas que
   * suman cargos, y por eso el fee editable a mano sigue mandando sobre el
   * cálculo: quien factura ajusta el monto de la línea, no el del ítem.
   */
  fee: number;
  category: string;
  /**
   * MODIFICADORES CPT, en orden (casilla 24D). Hasta 4, que es lo que admite el
   * formulario.
   *
   * Pedido de Devin (2026-09-29): el **25** cuando el E/M va junto a un
   * procedimiento, el **95** cuando la visita fue por telemedicina. Sin ellos el
   * pagador rechaza la línea o paga una sola de las dos.
   *
   * Se guarda texto libre de 2 caracteres y NO una opción de una lista cerrada:
   * el catálogo tiene `modifiersAllowed` cargado en 30 códigos de 408, y el
   * 99214 —2.248 usos, el más facturado de la clínica, y justo el que lleva el
   * 25 y el 95— lo tiene vacío. Una lista cerrada le habría dejado a Devin sin
   * opciones en el código que más usa.
   */
  modifiers?: string[];
  /**
   * LOS DIAGNÓSTICOS QUE JUSTIFICAN ESTA LÍNEA, por código ICD-10 (casilla 24E).
   *
   * `undefined` significa **todos los de la nota**, y es el default: así trabaja
   * el v2 (su casilla "All Diagnosis" nace tildada) y así ninguna nota queda
   * peor que hoy por no haberlo tocado. En cuanto alguien desmarca uno se
   * materializa la lista explícita; si vuelve a marcarlos todos, regresa a
   * `undefined` y sigue otra vez a la nota.
   *
   * Se referencia por CÓDIGO y no por id de fila a propósito: al guardar, la
   * nota BORRA y recrea sus diagnósticos (`deleteMany` + `createMany` en
   * `visit-notes/[appointmentId]`), así que esos ids cambian en cada guardado.
   * Un puntero por id habría quedado colgado al primer autoguardado.
   */
  dx?: string[];
  /**
   * Unidades (casilla 24G). Ausente = 1.
   *
   * Dos aplicaciones del mismo inyectable son dos unidades de una línea, no dos
   * líneas: el JSON indexa por código y la segunda se perdía.
   */
  units?: number;
}

/**
 * Lo que vale una línea. Existe para que nadie multiplique por `units` de nuevo:
 * `fee` YA es el total de la línea. Un helper que devuelve `fee` parece de más
 * hasta que alguien lee `units` en la fila de al lado y "corrige" la suma.
 */
export const totalDeLinea = (s: Pick<PlannedService, 'fee'>): number => s.fee ?? 0;

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

/**
 * El mapa `added` que espera `ChargePickerDialog`, con los DOS circuitos.
 *
 * Existe porque la forma de las claves es un contrato del picker y estaba
 * copiada a mano en cinco pantallas: dos la armaban bien y **tres solo con las
 * claves de seguro**, que es el bug de los cargos repetidos. Un contrato que se
 * reescribe en cada consumidor es un contrato que alguien va a escribir mal.
 *
 * Las claves las define `/api/admin/billable-items`: `s<refId>` para el circuito
 * de seguro y `c<catalogItemId>` para el de efectivo — con `c-<code>` como
 * respaldo cuando el cargo no salió del catálogo.
 *
 * El valor es la CANTIDAD, no un booleano: en el tab de Servicios repetir es
 * legítimo y la fila muestra "×2".
 */
export function mapaDeCargos(
  servicios: readonly PlannedService[],
  efectivo: readonly CargoEfectivo[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of servicios) m.set(`s${s.id}`, 1);
  for (const c of efectivo) {
    const k = c.catalogItemId !== null ? `c${c.catalogItemId}` : `c-${c.code}`;
    m.set(k, (m.get(k) ?? 0) + (c.quantity || 1));
  }
  return m;
}

/** Los cargos que la cita ya tiene. `GET /api/admin/appointments/:id` los trae. */
export async function leerCargos(appointmentId: string): Promise<PlannedService[]> {
  const res = await fetch(`/api/admin/appointments/${appointmentId}`);
  if (!res.ok) return [];
  const d = (await res.json()) as { plannedServiceCodes?: PlannedService[] };
  return d.plannedServiceCodes ?? [];
}

/**
 * Un cargo de efectivo ya creado, en lo mínimo que la pantalla necesita para
 * marcarlo como agregado en el picker.
 */
export interface CargoEfectivo {
  id: string;
  catalogItemId: number | null;
  code: string;
  quantity: number;
}

export interface AgregarCargoResultado {
  ok: boolean;
  /** La lista nueva de `plannedServiceCodes` (igual a la anterior si fue CASH). */
  servicios: PlannedService[];
  /**
   * El cargo de EFECTIVO recién creado, o `null` si el circuito fue de seguro.
   *
   * ── Por qué esto no estaba, y qué rompía ────────────────────────────────────
   *
   * Esta función descartaba la fila que devuelve el endpoint y contestaba
   * `servicios: actuales` — o sea, "no cambió nada". Las tres pantallas de
   * penalidad hacían `setCargosActuales(r.servicios)` con el mismo array, así
   * que su mapa `added` nunca se enteraba del cargo. Y como la clave de un ítem
   * de efectivo es `c<catalogItemId>` y ese mapa solo llevaba claves de seguro
   * (`s<id>`), el picker no tenía forma de saber que el ítem ya estaba.
   *
   * Resultado, reportado por Erick el 2026-09-08: el botón quedaba idéntico
   * después del clic, sin marca y sin aviso, así que se volvía a apretar — y el
   * POST no tiene idempotencia. Cinco clics en "Cancel Same Day" dejaron **cinco
   * cargos de $50 = $250** de deuda real en una cita.
   *
   * El comentario que estaba arriba —«acá se descarta»— ya señalaba esto como
   * deuda conocida. Era un bug esperando el clic.
   */
  efectivo?: CargoEfectivo | null;
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
    if (!res.ok) return { ok: false, servicios: actuales, efectivo: null, error: 'CASH_FAILED' };

    /**
     * La fila creada se devuelve, no se descarta. Si por lo que sea el cuerpo no
     * viniera parseable, `efectivo` queda en `null` y la pantalla se comporta
     * como antes: el cargo SÍ se creó, así que responder `ok: false` sería peor
     * —haría que alguien lo cargue de nuevo, que es justo el bug que esto cierra.
     */
    const cuerpo = await res.json().catch(() => null) as { charge?: CargoEfectivo } | null;
    return { ok: true, servicios: actuales, efectivo: cuerpo?.charge ?? null };
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

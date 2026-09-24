'use client';

/**
 * NoteCharges — los cargos de la visita, al pie de la nota y bajo los diagnósticos.
 *
 * Pedido de Devin (2026-09-17, reconfirmado el 21): *"Add the CPT/Charges
 * section at the bottom of the note under the diagnosis codes section"*. Va
 * junto al aviso de "falta el CPT" que sale al firmar: el aviso dice qué falta y
 * esto es dónde se arregla, sin salir de la nota.
 *
 * ── Los DOS circuitos, no uno ───────────────────────────────────────────────
 *
 * Esto nació administrando solo los CPT del seguro y mandando lo de efectivo al
 * tab de Servicios con un aviso. Devin lo probó y lo rechazó (2026-09-23):
 * *"Any codes for insurance or selfpay should be added here"*. Tenía razón y el
 * aviso era la parte mal pensada — el 40% de las visitas de medicina general se
 * cobran de bolsillo, así que el camino más común terminaba en un cartel que
 * decía "acá no". Un cargo es un cargo: se elige del mismo catálogo, en la misma
 * pantalla, y esta sección lo guarda en el circuito que le corresponde.
 *
 * Cada circuito tiene su tabla y su facturación, y eso no cambia:
 *
 *  · **Seguro** — línea del JSON `plannedServiceCodes` de la cita; la deuda la
 *    crea después `sync-billing`. Sin ese segundo paso el cargo se ve en la cita
 *    y no existe en facturación.
 *  · **Efectivo** — fila en `appointment_services`; el propio endpoint crea su
 *    facturación. Repetir es legítimo (dos aplicaciones del mismo inyectable son
 *    dos cobros), así que acá no se deduplica.
 *
 * Por eso los totales van separados: el "$107" de un solo número mezclaba plata
 * de la aseguradora con plata del mostrador, y quien cobra tenía que separarla de
 * cabeza. Lo único que sigue viviendo solo en Servicios son las **férulas** y los
 * **labs**, que tienen su propio circuito y sus propios campos; el enlace a ese
 * tab se queda a la vista para eso.
 *
 * ── NO es parte del documento firmado ───────────────────────────────────────
 *
 * Y por eso se dibuja separado del cuerpo. Lo que se firma son las seis
 * secciones SOAP más los diagnósticos; los cargos viven en otro reloj: la nota
 * se congela al firmar y **la plata sigue meses** (Erick, 2026-09-21 — Finanzas
 * cobra mucho después). Si los cargos fueran parte de la nota, tocar un código
 * el martes cambiaría un documento firmado el lunes, que es justo lo que el
 * versionado existe para impedir.
 *
 * De ahí las dos consecuencias que se ven acá: **sigue editable con la nota ya
 * firmada**, y **no lo alcanza el candado de la nota**. Los cargos ya se editan
 * sin candado desde el tab de Servicios y desde Day Admission; ponérselo solo
 * acá dejaría el mismo dato trabado desde una pantalla y libre desde otra.
 *
 * ── Deuda conocida ──────────────────────────────────────────────────────────
 *
 * La fila de efectivo está tipada por cuarta vez (acá, `appointment-detail-panel`,
 * `visit-summary` y, recortada, en `lib/charges.ts`). No se unificó en este
 * cambio porque tocar el tipo compartido arrastra las tres pantallas del camino
 * del dinero y el costo real de eso es volver a probarlas, no el código. Cuando
 * alguien toque `lib/charges.ts` por otra razón, ahí va.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X, Loader2, Briefcase, AlertTriangle } from 'lucide-react';
import { ChargePickerDialog, precioDeCargo, type BillableItem } from '@/components/visit/charge-picker-dialog';
import { mapaDeCargos } from '@/lib/charges';
import type { CoverageDTO } from '@/lib/coverage';

export interface PlannedService {
  id: string;
  code: string;
  description: string;
  fee?: number;
  category?: string;
}

/** Fila real de `appointment_services` — lo que paga el paciente. */
interface CargoEfectivo {
  id: string;
  catalogItemId: number | null;
  code: string;
  name: string;
  unitPrice: number;
  unitLabel: string | null;
  cptCode: string | null;
  quantity: number;
  /** Distingue dos cobros idénticos del mismo ítem en la lista. */
  chargedAt: string;
}

export interface NoteChargesProps {
  appointmentId: string;
  caseId: string | null;
  coverage: CoverageDTO;
  /** Los CPT que ya tiene la visita, del payload del server. */
  initial: PlannedService[];
  /** Llevar al tab de Servicios (férulas y labs). */
  onVerServicios?: () => void;
  /** Avisa al padre que la lista de CPT cambió, para refrescar lo que dependa. */
  onChanged?: (list: PlannedService[]) => void;
  /**
   * Cuántos cargos tiene la visita en TOTAL, sumando los dos circuitos.
   *
   * Existe para el aviso de "no tiene cargos" que sale al firmar. El padre solo
   * ve los CPT del payload del server, así que una visita cobrada entera de
   * bolsillo le avisaba al provider que no había cargado nada — con los cargos
   * listados tres centímetros más arriba.
   */
  onCuenta?: (total: number) => void;
}

const money = (n: number | undefined): string =>
  typeof n === 'number' ? `$${n.toFixed(2)}` : '—';

export function NoteCharges({
  appointmentId, caseId, coverage, initial, onVerServicios, onChanged, onCuenta,
}: NoteChargesProps): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const tc = useTranslations('phoenix.charges');
  const [items, setItems] = React.useState<PlannedService[]>(initial);
  const [efectivo, setEfectivo] = React.useState<CargoEfectivo[]>([]);
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pickerAbierto, setPickerAbierto] = React.useState(false);

  /**
   * El server es la fuente: si el tab de Servicios agregó algo, esto tiene que
   * reflejarlo al volver. Se compara por contenido y no por referencia porque el
   * payload se rearma en cada render del padre.
   */
  const firmaInicial = JSON.stringify(initial);
  React.useEffect(() => { setItems(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [firmaInicial]);

  /**
   * Los de efectivo no vienen en el payload: viven en su propia tabla y se piden
   * aparte, igual que hace el tab de Servicios.
   */
  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/cash-services/${appointmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { charges?: CargoEfectivo[] } | null) => {
        if (vivo && d?.charges) setEfectivo(d.charges);
      })
      .catch(() => { /* la lista queda vacía; agregar sigue funcionando */ });
    return () => { vivo = false; };
  }, [appointmentId]);

  const totalSeguro = items.reduce((s, x) => s + (x.fee ?? 0), 0);
  const totalEfectivo = efectivo.reduce((s, x) => s + x.unitPrice * x.quantity, 0);
  const cuenta = items.length + efectivo.length;
  const losDos = items.length > 0 && efectivo.length > 0;

  // El padre necesita el total para el aviso del firmado; se avisa cada vez que
  // cambia cualquiera de los dos circuitos.
  React.useEffect(() => { onCuenta?.(cuenta); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cuenta]);

  /** Traduce el rechazo del server. Un cargo ya cobrado no se puede quitar. */
  const explicarRechazo = async (res: Response): Promise<string> => {
    const d = await res.json().catch(() => ({}) as { error?: string; paid?: number });
    if (d.error === 'ALREADY_PAID') return tc('errAlreadyPaid', { amount: money(Number(d.paid ?? 0)) });
    return tc('errRemoveFailed');
  };

  /**
   * Guarda los CPT y sincroniza la facturación, en ese orden.
   *
   * Si el PATCH falla se vuelve atrás la lista: mostrar un cargo quitado que
   * sigue facturado es peor que no haberlo quitado.
   */
  const guardar = async (lista: PlannedService[], previo: PlannedService[]): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedServiceCodes: lista }),
      });
      if (!res.ok) { setItems(previo); setError(await explicarRechazo(res)); return; }
      // Una fila de facturación por CPT. Sin esto el cargo existe en la visita
      // y no en la cuenta del caso.
      await fetch(`/api/admin/appointments/${appointmentId}/sync-billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      }).catch(() => {});
      onChanged?.(lista);
    } catch {
      setItems(previo);
      setError(t('chgSaveError'));
    } finally {
      setGuardando(false);
    }
  };

  /** El circuito de efectivo: su endpoint ya crea la facturación. */
  const agregarEfectivo = async (item: BillableItem): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cash-services/${appointmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogItemId: Number(item.refId),
          code: item.code,
          name: item.name,
          unitPrice: item.price,
          cptCode: item.insuranceCode,
          unitLabel: item.unitLabel,
          quantity: 1,
        }),
      });
      if (!res.ok) { setError(t('chgSaveError')); return; }
      const d = await res.json().catch(() => null) as { charge?: CargoEfectivo } | null;
      // Si el cuerpo no viniera parseable, el cargo SÍ se creó: se recarga la
      // lista en vez de dar error, porque un error acá hace que alguien lo cargue
      // de nuevo y el POST no tiene idempotencia.
      if (d?.charge) setEfectivo((prev) => [...prev, d.charge as CargoEfectivo]);
      else {
        const r2 = await fetch(`/api/admin/cash-services/${appointmentId}`);
        const d2 = r2.ok ? await r2.json().catch(() => null) as { charges?: CargoEfectivo[] } | null : null;
        if (d2?.charges) setEfectivo(d2.charges);
      }
      // El saldo del caso y el Resumen del paso 4 salen del server.
      onChanged?.(items);
    } catch {
      setError(t('chgSaveError'));
    } finally {
      setGuardando(false);
    }
  };

  const agregar = async (item: BillableItem): Promise<void> => {
    if (item.source === 'CASH') { await agregarEfectivo(item); return; }
    // El JSON indexa por código: un duplicado se perdería igual.
    if (items.some((x) => x.code === item.code)) return;
    const next = [...items, {
      id: item.refId, code: item.code, description: item.name,
      // `precioDeCargo` y no `item.price`: los mismos códigos valen distinto en
      // un MVA que en medicina general (el 99214 son $300 y $166). Cotizar al de
      // tarifario en una visita general cobra el doble.
      fee: precioDeCargo(item, coverage.caseType),
      category: item.category ?? '',
    }];
    setItems(next);
    await guardar(next, items);
  };

  const quitar = (code: string): void => {
    const next = items.filter((x) => x.code !== code);
    setItems(next);
    void guardar(next, items);
  };

  /** Anular, no borrar: el cargo pasó y queda en la auditoría. */
  const anular = async (id: string): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cash-services/item/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'VOIDED' }),
      });
      if (!res.ok) { setError(await explicarRechazo(res)); return; }
      setEfectivo((prev) => prev.filter((c) => c.id !== id));
      onChanged?.(items);
    } catch {
      setError(tc('errRemoveFailed'));
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Qué está ya cargado y cuántas veces, en el formato del picker.
   *
   * Sale de `mapaDeCargos` y no de un objeto armado a mano: las claves son un
   * contrato de `/api/admin/billable-items` (`s<refId>` y `c<catalogItemId>`).
   * Acá estaban escritas como `INSURANCE:<id>`, que no coincide con ninguna, así
   * que **ningún cargo se marcaba como agregado** — el catálogo se abría en
   * blanco aunque la visita ya tuviera los códigos puestos.
   */
  const yaCargados = React.useMemo(
    () => mapaDeCargos(
      items.map((x) => ({
        id: x.id, code: x.code, description: x.description,
        fee: x.fee ?? 0, category: x.category ?? '',
      })),
      efectivo,
    ),
    [items, efectivo],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
          {t('sec_CARGOS')}
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          {onVerServicios && (
            <button
              type="button"
              onClick={onVerServicios}
              className="text-[11px] font-semibold text-text-muted hover:text-text-1 hover:underline flex items-center gap-1"
            >
              <Briefcase className="w-3 h-3" /> {t('chgOpenServices')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPickerAbierto(true)}
            className="text-[11px] font-semibold text-violet-text hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> {t('chgAdd')}
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-bg-2/30 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[13px] font-semibold text-text-1">
              {t('chgAdded', { count: cuenta })}
            </div>
            {/* El aviso de por qué esto no se congela con la firma. Va acá y no
                en un tooltip: es la pregunta que se hace cualquiera que vea
                campos editables debajo de una nota cerrada. */}
            <div className="text-[11px] text-text-muted">{t('chgHint')}</div>
          </div>
          {cuenta > 0 && (
            <div className="text-right shrink-0">
              {/* Dos totales cuando hay de los dos. Un solo número mezclaría
                  plata de la aseguradora con plata del mostrador, y quien cobra
                  tendría que separarla de cabeza. */}
              {losDos ? (
                <div className="space-y-0.5">
                  <div className="flex items-baseline justify-end gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('chgToInsurance')}</span>
                    <span className="text-[13px] font-semibold text-text-1 tabular-nums">{money(totalSeguro)}</span>
                  </div>
                  <div className="flex items-baseline justify-end gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-amber">{t('chgToday')}</span>
                    <span className="text-[13px] font-semibold text-amber tabular-nums">{money(totalEfectivo)}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    {efectivo.length > 0 ? t('chgToday') : t('chgTotal')}
                  </div>
                  <div className="text-[15px] font-bold text-text-1 tabular-nums">
                    {money(items.length > 0 ? totalSeguro : totalEfectivo)}
                  </div>
                </>
              )}
            </div>
          )}
          {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted shrink-0" />}
        </div>

        {error && (
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
          </div>
        )}

        {cuenta === 0 ? (
          <div className="rounded-md bg-bg-2/40 px-3 py-2.5 text-center text-[11px] text-text-muted">
            {t('chgNone')}
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((x) => (
              <div key={x.code} className="rounded-md bg-bg-2/40 px-3 py-2 flex items-center gap-2">
                <span className="font-mono text-[11.5px] text-violet-text shrink-0">{x.code}</span>
                <span className="text-[12px] text-text-1 flex-1 min-w-0 truncate">{x.description}</span>
                <span className="text-[12px] text-text-2 tabular-nums shrink-0">{money(x.fee)}</span>
                <button
                  type="button"
                  onClick={() => quitar(x.code)}
                  aria-label={t('chgRemove')}
                  className="shrink-0 text-text-muted hover:text-rose transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {/* Los de efectivo, marcados: quien cobra tiene que ver de un vistazo
                cuáles se le piden al paciente hoy. El punto ámbar hace ese
                trabajo sin agregarle una fila de encabezado a una lista corta. */}
            {efectivo.map((c) => (
              <div key={c.id} className="rounded-md bg-bg-2/40 px-3 py-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" title={t('chgToday')} />
                <span className="font-mono text-[11.5px] text-amber shrink-0">{c.code}</span>
                <span className="text-[12px] text-text-1 flex-1 min-w-0 truncate">
                  {c.name}
                  {c.quantity > 1 && <span className="text-text-muted"> ×{c.quantity}</span>}
                </span>
                <span className="text-[12px] text-text-2 tabular-nums shrink-0">{money(c.unitPrice * c.quantity)}</span>
                <button
                  type="button"
                  onClick={() => void anular(c.id)}
                  aria-label={t('chgRemove')}
                  className="shrink-0 text-text-muted hover:text-rose transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pickerAbierto && (
        <ChargePickerDialog
          coverage={coverage}
          added={yaCargados}
          onClose={() => setPickerAbierto(false)}
          onAdd={agregar}
        />
      )}
    </div>
  );
}

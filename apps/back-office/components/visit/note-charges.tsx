'use client';

/**
 * NoteCharges — los CPT de la visita, al pie de la nota y bajo los diagnósticos.
 *
 * Pedido de Devin (2026-09-17, reconfirmado el 21): *"Add the CPT/Charges
 * section at the bottom of the note under the diagnosis codes section"*. Va
 * junto al aviso de "falta el CPT" que sale al firmar: el aviso dice qué falta y
 * esto es dónde se arregla, sin salir de la nota.
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
 * ── Qué administra, y qué no esconde ────────────────────────────────────────
 *
 * Administra los CPT que se le facturan al seguro (`plannedServiceCodes` de la
 * cita, que es el circuito vivo: lo lee `sync-billing` y termina en
 * `appointment_billing`). Lo de efectivo, las férulas y los labs tienen cada uno
 * su propio camino y viven en Servicios — así que hay un enlace visible a ese
 * tab. Un filtro que oculta en silencio es el error que el propio selector de
 * cargos evita; acá vale igual.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X, Loader2, Briefcase, AlertTriangle } from 'lucide-react';
import { ChargePickerDialog, precioDeCargo, type BillableItem } from '@/components/visit/charge-picker-dialog';
import type { CoverageDTO } from '@/lib/coverage';

export interface PlannedService {
  id: string;
  code: string;
  description: string;
  fee?: number;
  category?: string;
}

export interface NoteChargesProps {
  appointmentId: string;
  caseId: string | null;
  coverage: CoverageDTO;
  /** Lo que ya tiene cargado la visita, del payload del server. */
  initial: PlannedService[];
  /** Llevar al tab de Servicios (efectivo, férulas, labs). */
  onVerServicios?: () => void;
  /** Avisa al padre que la lista cambió, para refrescar lo que dependa. */
  onChanged?: (list: PlannedService[]) => void;
}

const money = (n: number | undefined): string =>
  typeof n === 'number' ? `$${n.toFixed(2)}` : '—';

export function NoteCharges({
  appointmentId, caseId, coverage, initial, onVerServicios, onChanged,
}: NoteChargesProps): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [items, setItems] = React.useState<PlannedService[]>(initial);
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

  const total = items.reduce((s, x) => s + (x.fee ?? 0), 0);

  /**
   * Guarda y sincroniza la facturación, en ese orden.
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
      if (!res.ok) { setItems(previo); setError(t('chgSaveError')); return; }
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

  const agregar = async (item: BillableItem): Promise<void> => {
    // De efectivo, férulas y labs se encarga Servicios: cada uno guarda en su
    // propia tabla. Se avisa en vez de tragárselo — el clic no puede no hacer nada.
    if (item.source !== 'INSURANCE') { setError(t('chgCashGoesToServices')); return; }
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

  const yaCargados = React.useMemo(
    () => new Map(items.map((x) => [`INSURANCE:${x.id}`, 1] as const)),
    [items],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
          {t('sec_CARGOS')}
        </span>
        <div className="flex items-center gap-3">
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
              {t('chgAdded', { count: items.length })}
            </div>
            {/* El aviso de por qué esto no se congela con la firma. Va acá y no
                en un tooltip: es la pregunta que se hace cualquiera que vea
                campos editables debajo de una nota cerrada. */}
            <div className="text-[11px] text-text-muted">{t('chgHint')}</div>
          </div>
          {items.length > 0 && (
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('chgTotal')}</div>
              <div className="text-[15px] font-bold text-text-1 tabular-nums">{money(total)}</div>
            </div>
          )}
          {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted shrink-0" />}
        </div>

        {error && (
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
          </div>
        )}

        {items.length === 0 ? (
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

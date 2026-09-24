'use client';

/**
 * La papelera de citas — "Citas eliminadas" en el calendario.
 *
 * Es una pantalla de AUDITORÍA antes que de recuperación. Cada fila responde
 * las cuatro preguntas que uno se hace mirándola (Erick, 2026-09-23: *"que
 * muestre la fecha, hora y usuario que lo eliminó"*):
 *
 *   · CUÁNDO se eliminó · QUIÉN la eliminó · POR QUÉ · QUÉ era
 *
 * Y de paso permite deshacer, que es el otro pedido: *"si se equivocaron, ahí la
 * podemos retornar"*.
 *
 * ── Restaurar puede chocar ──────────────────────────────────────────────────
 *
 * Mientras la cita estaba eliminada su horario quedó libre y alguien pudo
 * usarlo. El servidor responde 409 con la cita que choca y acá se muestra el
 * aviso con el botón para restaurar igual — avisa, no bloquea, que es la regla
 * de toda la agenda desde agosto.
 */

import { useState, useEffect, useCallback } from 'react';
import { useServerError, type ServerErrorBody } from '@/lib/server-error';
import { useTranslations } from 'next-intl';
import { Trash2, RotateCcw, Search, AlertCircle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@precision/ui';
import { EmptyState } from '@/components/ui-phoenix';
import { localeApp } from '@/lib/fechas';

interface CitaEliminada {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  status: string;
  isOnline: boolean;
  deletedAt: string;
  deletedByName: string | null;
  deleteReason: string | null;
  patient: { id: string; firstName: string; lastName: string };
  clinicName: string | null;
  providerName: string | null;
  caseCode: string | null;
  caseType: string | null;
}

/** Choque al restaurar: lo que devuelve el 409, ya listo para el cartel. */
interface Choque {
  citaId: string;
  texto: string;
}

export function DeletedAppointmentsDialog({
  open, onOpenChange, onRestored,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Para que el calendario vuelva a pedir sus citas cuando una regresa. */
  onRestored: () => void;
}) {
  const serverError = useServerError();
  const t = useTranslations('phoenix.calendar');

  const [citas,     setCitas]     = useState<CitaEliminada[]>([]);
  const [cargando,  setCargando]  = useState(false);
  const [busqueda,  setBusqueda]  = useState('');
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [choque,    setChoque]    = useState<Choque | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const cargar = useCallback(async (q: string) => {
    setCargando(true); setError(null);
    try {
      const url = q.trim() ? `/api/admin/appointments/deleted?q=${encodeURIComponent(q.trim())}` : '/api/admin/appointments/deleted';
      const res = await fetch(url);
      const data = await res.json();
      setCitas(data.appointments ?? []);
    } catch {
      setError(t('deletedLoadError'));
    } finally { setCargando(false); }
  }, [t]);

  useEffect(() => { if (open) void cargar(''); }, [open, cargar]);

  /**
   * El buscador espera medio segundo. La papelera no es una lista chica —trae
   * hasta 200— y pedirla en cada tecla es ruido para el servidor sin ganancia
   * para quien escribe.
   */
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => { void cargar(busqueda); }, 500);
    return () => clearTimeout(id);
  }, [busqueda, open, cargar]);

  const restaurar = async (cita: CitaEliminada, solaparIgual = false) => {
    setRestaurando(cita.id); setError(null); setChoque(null);
    try {
      const res = await fetch(`/api/admin/appointments/${cita.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(solaparIgual ? { allowOverlap: true } : {}),
      });
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        if (d.error === 'SLOT_CONFLICT') {
          const hora = d.conflictAt
            ? new Date(d.conflictAt).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })
            : '';
          setChoque({
            citaId: cita.id,
            texto: d.conflictPatient
              ? t('overlapBody', { time: hora, patient: d.conflictPatient })
              : t('overlapBodyAnon', { time: hora }),
          });
          return;
        }
      }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(serverError(d as ServerErrorBody)); }
      setCitas(cs => cs.filter(c => c.id !== cita.id));
      onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('deletedRestoreError'));
    } finally { setRestaurando(null); }
  };

  const fechaLarga = (iso: string) =>
    new Date(iso).toLocaleString(localeApp(), {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver',
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-text-muted" />
            {t('deletedTitle')}
          </DialogTitle>
          <DialogDescription>{t('deletedHint')}</DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('deletedSearchPlaceholder')}
              className="w-full h-9 pl-8 pr-2 rounded-md border border-border bg-bg-2 text-xs text-text-1 placeholder:text-text-muted focus:outline-none focus:border-cyan transition-colors"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
            </div>
          )}

          {cargando && citas.length === 0 && (
            <p className="text-[11px] text-text-muted italic py-6 text-center">{t('deletedLoading')}</p>
          )}

          {!cargando && citas.length === 0 && (
            <EmptyState.Rich icon={Trash2} title={t("deletedEmptyTitle")} subtitle={t("deletedEmptyHint")} />
          )}

          {citas.map(cita => (
            <div key={cita.id} className="rounded-lg bg-bg-1 p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-1 truncate">
                    {cita.patient.firstName} {cita.patient.lastName}
                    {cita.caseCode && (
                      <span className="ml-2 text-[11px] font-mono text-text-muted">#{cita.caseCode.replace('PMC-', '')}</span>
                    )}
                  </div>
                  {/* Qué era la cita: la fecha y hora que TENÍA, no la del borrado. */}
                  <div className="text-[12.5px] text-text-2 mt-0.5">
                    {fechaLarga(cita.scheduledFor)}
                    {cita.clinicName    && <> · {cita.clinicName}</>}
                    {cita.providerName  && <> · {cita.providerName}</>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { void restaurar(cita); }}
                  disabled={restaurando === cita.id}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-0 rounded-md border border-cyan/40 bg-cyan/[0.08] text-cyan hover:bg-cyan/15 text-[11px] font-semibold transition-colors disabled:opacity-50"
                >
                  {restaurando === cita.id
                    ? <Clock className="w-3.5 h-3.5 animate-spin" />
                    : <RotateCcw className="w-3.5 h-3.5" />}
                  {t('deletedRestore')}
                </button>
              </div>

              {/* Quién, cuándo y por qué — las tres que pidió Erick. */}
              <div className="mt-2 pt-2 border-t border-row-sep text-[11px] text-text-muted flex flex-wrap gap-x-4 gap-y-1">
                <span>{t('deletedWhen')}: <span className="text-text-2">{fechaLarga(cita.deletedAt)}</span></span>
                <span>{t('deletedBy')}: <span className="text-text-2">{cita.deletedByName ?? '—'}</span></span>
                {cita.deleteReason && (
                  <span>{t('deletedWhy')}: <span className="text-text-2">{cita.deleteReason}</span></span>
                )}
              </div>

              {choque?.citaId === cita.id && (
                <div className="mt-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber space-y-2">
                  <p className="flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {choque.texto}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => { void restaurar(cita, true); }}
                      className="px-2.5 py-1.5 rounded-md bg-amber/20 border border-amber/40 text-amber text-[11px] font-semibold hover:bg-amber/25 transition-colors">
                      {t('overlapConfirm')}
                    </button>
                    <button type="button" onClick={() => setChoque(null)}
                      className="px-2.5 py-1.5 rounded-md border border-border text-text-2 text-[11px] hover:bg-white/5 transition-colors">
                      {t('actionBack')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

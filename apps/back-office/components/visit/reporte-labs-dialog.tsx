'use client';

/**
 * El reporte de órdenes de laboratorio, antes de mandarlas a LabCorp.
 *
 * ── Qué problema resuelve ──────────────────────────────────────────────────
 * Los cuatro motivos por los que una orden no se emite se descubrían de a uno:
 * apretabas "Generar orden" y recibías el error. Con diez pacientes eso eran
 * diez intentos y ninguna vista de conjunto. Acá se ve la lista completa, con
 * qué falta y de quién es cada cosa (Erick, 2026-09-13).
 *
 * ── El orden de la lista no es cronológico ─────────────────────────────────
 * Va de lo más grave a lo menos: primero lo que se perdió, después lo trabado,
 * al final lo que ya salió. Quien abre esto lo hace para ACTUAR, no para
 * consultar — y lo que exige acción tiene que estar arriba sin scrollear.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button } from '@precision/ui';
import { Loader2, ExternalLink, RefreshCw, FlaskConical } from 'lucide-react';
import { TagPill, EmptyState } from '@/components/ui-phoenix';
import type { EstadoOrden } from '@/lib/reporte-labs';

interface Fila {
  groupId: string;
  appointmentId: string;
  fecha: string;
  paciente: string;
  patientCode: string | null;
  caseCode: string | null;
  sinCaso: boolean;
  providerName: string | null;
  estudios: number;
  estado: EstadoOrden;
  numero: string | null;
  seguroHoja: string | null;
  seguroCaso: string | null;
  otroSeguro: boolean;
  anuladaNumero: string | null;
  anuladaMotivo: string | null;
}

interface Resumen {
  total: number; anuladasSinReemitir: number; sinNpi: number; sinPoliza: number;
  mezcladas: number; listas: number; emitidas: number; conOtroSeguro: number; sinCaso: number;
}

/**
 * El color dice la URGENCIA, no la categoría.
 *
 * `rose` solo para lo que exige actuar —se perdió una hoja ya emitida— igual
 * que en las alertas de vitales. Lo trabado es ámbar: falta un dato, no está
 * roto. Lo emitido, emerald. Y `LISTA` en cyan: es información, no un problema.
 */
const TONO: Record<EstadoOrden, string> = {
  ANULADA_SIN_REEMITIR: 'bg-rose/15 text-rose border-rose/40',
  SIN_NPI:              'bg-amber/10 text-amber border-amber/30',
  MEZCLADO:             'bg-amber/10 text-amber border-amber/30',
  SIN_POLIZA:           'bg-amber/10 text-amber border-amber/30',
  LISTA:                'bg-cyan/10 text-cyan border-cyan/30',
  EMITIDA:              'bg-emerald/10 text-emerald border-emerald/30',
};

/** De lo más grave a lo menos. Es el orden en que se lee la lista. */
const PESO: Record<EstadoOrden, number> = {
  ANULADA_SIN_REEMITIR: 0, SIN_NPI: 1, MEZCLADO: 2, SIN_POLIZA: 3, LISTA: 4, EMITIDA: 5,
};

export function ReporteLabsDialog({ scope, hrefVisita, onClose }: {
  /** `mine` = las del provider de la sesión · `clinic` = todas. */
  scope: 'mine' | 'clinic';
  /** A dónde lleva cada fila. Cada pantalla vuelve a su propio lugar. */
  hrefVisita: (appointmentId: string) => string;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [filas, setFilas] = React.useState<Fila[]>([]);
  const [resumen, setResumen] = React.useState<Resumen | null>(null);
  /** `null` = sin filtrar. Las pastillas del resumen filtran la lista. */
  const [soloEstado, setSoloEstado] = React.useState<EstadoOrden | null>(null);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/lab-orders/reporte?scope=${scope}`);
      if (!res.ok) throw new Error();
      const d = await res.json() as { filas: Fila[]; resumen: Resumen };
      setFilas(d.filas ?? []);
      setResumen(d.resumen ?? null);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [scope]);

  React.useEffect(() => { void cargar(); }, [cargar]);

  const ordenadas = React.useMemo(
    () => [...filas]
      .filter((f) => !soloEstado || f.estado === soloEstado)
      .sort((a, b) => PESO[a.estado] - PESO[b.estado] || b.fecha.localeCompare(a.fecha)),
    [filas, soloEstado],
  );

  /** Las pastillas del encabezado. Solo se dibujan las que tienen algo. */
  const chips: Array<{ estado: EstadoOrden; n: number }> = resumen ? ([
    { estado: 'ANULADA_SIN_REEMITIR' as EstadoOrden, n: resumen.anuladasSinReemitir },
    { estado: 'SIN_NPI' as EstadoOrden,              n: resumen.sinNpi },
    { estado: 'MEZCLADO' as EstadoOrden,             n: resumen.mezcladas },
    { estado: 'SIN_POLIZA' as EstadoOrden,           n: resumen.sinPoliza },
    { estado: 'LISTA' as EstadoOrden,                n: resumen.listas },
    { estado: 'EMITIDA' as EstadoOrden,              n: resumen.emitidas },
  ]).filter((c) => c.n > 0) : [];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl p-0 max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm uppercase tracking-wider">
            <FlaskConical className="w-4 h-4 text-violet-text" />
            {t('repLabsTitulo')}
          </DialogTitle>
          <p className="text-[11.5px] text-text-muted mt-1 leading-relaxed">{t('repLabsIntro')}</p>
        </DialogHeader>

        {/* Resumen — las pastillas filtran. `flex-wrap` obligatorio: son seis y
            en teléfono no entran en una línea. */}
        {resumen && resumen.total > 0 && (
          <div className="px-4 sm:px-6 py-3 flex items-center gap-1.5 flex-wrap border-b border-border">
            <button
              type="button"
              onClick={() => setSoloEstado(null)}
              className={`px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors ${
                soloEstado === null ? 'bg-violet/15 text-violet-text' : 'bg-bg-2 text-text-muted hover:text-text-1'
              }`}
            >
              {t('repLabsTodas')} ({resumen.total})
            </button>
            {chips.map((c) => (
              <button
                key={c.estado}
                type="button"
                onClick={() => setSoloEstado(soloEstado === c.estado ? null : c.estado)}
                className={`px-2.5 h-7 rounded-md border text-[11px] font-semibold transition-opacity ${TONO[c.estado]} ${
                  soloEstado && soloEstado !== c.estado ? 'opacity-40' : ''
                }`}
              >
                {t(`repLabsEstado_${c.estado}`)} ({c.n})
              </button>
            ))}
            {resumen.conOtroSeguro > 0 && (
              <span className="px-2.5 h-7 inline-flex items-center rounded-md border border-violet/30 bg-violet/10 text-[11px] font-semibold text-violet-text">
                {t('repLabsOtroSeguro', { n: resumen.conOtroSeguro })}
              </span>
            )}
            <button
              type="button"
              onClick={() => void cargar()}
              disabled={cargando}
              className="ml-auto p-1.5 rounded-md text-text-muted hover:text-text-1 disabled:opacity-40"
              title={t('refresh')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3">
          {cargando ? (
            <div className="flex items-center gap-2 text-[12px] text-text-muted py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('repLabsCargando')}
            </div>
          ) : error ? (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11.5px] text-rose">
              {t('repLabsError')}
            </div>
          ) : ordenadas.length === 0 ? (
            <EmptyState.Rich icon={FlaskConical} title={t('repLabsVacio')} subtitle={t('repLabsVacioAyuda')} />
          ) : (
            <div className="space-y-1.5">
              {ordenadas.map((f) => (
                <div key={f.groupId} className="rounded-md bg-bg-2/40 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-semibold text-text-1 truncate">{f.paciente}</span>
                      {f.patientCode && <span className="font-mono text-[10px] text-text-muted">{f.patientCode}</span>}
                      <TagPill label={t(`repLabsEstado_${f.estado}`)} colorClass={TONO[f.estado]} />
                      {f.otroSeguro && (
                        <TagPill label={t('repLabsChipOtroSeguro')} colorClass="bg-violet/15 text-violet-text border-violet/30" />
                      )}
                      {/* Que no tenga caso no traba la emisión, pero la hoja no
                          llega a Documentos: es un aviso, no un error. */}
                      {f.sinCaso && (
                        <TagPill label={t('repLabsChipSinCaso')} colorClass="bg-bg-2 text-text-muted border-border" />
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-text-muted flex items-center gap-2 flex-wrap">
                      <span>{t('repLabsEstudios', { n: f.estudios })}</span>
                      {f.caseCode && <span className="font-mono">{f.caseCode}</span>}
                      {f.providerName && <span>· {f.providerName}</span>}
                      {f.numero && <span className="font-mono text-emerald">· {f.numero}</span>}
                    </div>
                    {/* El detalle que explica la pastilla, cuando lo hay. */}
                    {f.estado === 'ANULADA_SIN_REEMITIR' && (
                      <div className="mt-1 text-[11px] text-rose leading-relaxed">
                        {t('repLabsAnuladaDetalle', {
                          number: f.anuladaNumero ?? '—',
                          motivo: f.anuladaMotivo ?? '—',
                        })}
                      </div>
                    )}
                    {f.otroSeguro && (
                      <div className="mt-1 text-[11px] text-violet-text leading-relaxed">
                        {t('repLabsOtroSeguroDetalle', {
                          hoja: f.seguroHoja ?? '—',
                          caso: f.seguroCaso ?? '—',
                        })}
                      </div>
                    )}
                  </div>
                  <a
                    href={hrefVisita(f.appointmentId)}
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] font-semibold text-text-2 hover:text-text-1 hover:bg-bg-2 transition-colors w-full sm:w-auto"
                  >
                    <ExternalLink className="w-3 h-3" /> {t('repLabsAbrir')}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t('repLabsCerrar')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

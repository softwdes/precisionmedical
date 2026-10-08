'use client';

/**
 * Laboratorios traídos de otro sistema — lista + importación.
 *
 * ## Por qué vive acá y no en el historial médico
 *
 * Porque son laboratorios, y los laboratorios se leen en el tab de
 * laboratorios. El diálogo del historial tiene 3.600 líneas y lo tocan varias
 * sesiones a la vez; meter una sección más ahí es costo sin beneficio para quien
 * los va a mirar.
 *
 * ## Siempre se mira antes de escribir
 *
 * El botón no importa: ANALIZA. Sube el archivo, muestra qué encontró —cuántos
 * resultados, de qué paneles, qué fechas, cuántos ya estaban— y recién entonces
 * aparece el botón de guardar.
 *
 * No es cortesía. El archivo viene de MEDUSA, puede ser del paciente equivocado,
 * y una vez adentro los resultados se mezclan con los nuestros en el expediente.
 * Este paso es el único lugar donde eso se puede atajar, y por eso el resumen
 * muestra el rango de FECHAS y los paneles: si dice "2016-2019, Perfil
 * tiroideo" y el paciente tiene 20 años, se ve antes de guardar.
 *
 * ## Solo lectura una vez adentro
 *
 * No hay editar ni borrar fila por fila: no son órdenes nuestras, nadie las pidió
 * desde acá, y corregirlas a mano sería reescribir el expediente de otro sistema.
 */

import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@precision/ui';
import { FlaskConical, Upload, Loader2, AlertTriangle, ChevronDown, FileUp, Check } from 'lucide-react';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import type { ImportedLabGroup } from '@/app/api/admin/patients/[patientId]/imported-labs/route';

/** Lo que devuelve la ruta cuando solo analiza. */
interface Resumen {
  archivo: string;
  paneles: number;
  leidos: number;
  nuevos: number;
  yaEstaban: number;
  descartadas: Array<{ motivo: string; codigo: string | null }>;
  desde: string | null;
  hasta: string | null;
  panelesDetalle: Array<{ panel: string; n: number }>;
  aplicado?: boolean;
  insertados?: number;
}

const MAX_MB = 20;

export function ImportedLabsPanel({ patientId }: { patientId: string }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const locale = useLocale();

  const [groups, setGroups] = React.useState<ImportedLabGroup[]>([]);
  const [total, setTotal] = React.useState(0);
  const [cargando, setCargando] = React.useState(true);
  const [abiertos, setAbiertos] = React.useState<Set<string>>(new Set());

  const [dialogo, setDialogo] = React.useState(false);
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [resumen, setResumen] = React.useState<Resumen | null>(null);
  const [trabajando, setTrabajando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const cargar = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/imported-labs`);
      if (!res.ok) return;
      const d = await res.json() as { groups: ImportedLabGroup[]; total: number };
      setGroups(d.groups ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setCargando(false);
    }
  }, [patientId]);

  React.useEffect(() => { void cargar(); }, [cargar]);

  const fecha = (iso: string): string =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-US', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });

  /** Sube el archivo. `aplicar` false = solo analiza. */
  const enviar = async (aplicar: boolean): Promise<void> => {
    if (!archivo) return;
    setTrabajando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', archivo);
      if (aplicar) fd.append('aplicar', 'true');
      const res = await fetch(`/api/admin/patients/${patientId}/import-ccd`, { method: 'POST', body: fd });
      const d = await res.json().catch(() => null) as (Resumen & { error?: string }) | null;

      if (!res.ok) {
        setError(
          d?.error === 'NO_ES_UN_CCD' ? t('ccdErrNotCcd')
          : d?.error === 'CCD_SIN_LABORATORIOS' ? t('ccdErrNoLabs')
          : d?.error === 'FILE_TOO_LARGE' ? t('ccdErrTooLarge', { mb: MAX_MB })
          : t('ccdErrGeneric'),
        );
        return;
      }
      setResumen(d);
      if (aplicar) await cargar();
    } catch {
      setError(t('ccdErrGeneric'));
    } finally {
      setTrabajando(false);
    }
  };

  const cerrar = (): void => {
    setDialogo(false); setArchivo(null); setResumen(null); setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const alternar = (k: string): void => setAbiertos((prev) => {
    const s = new Set(prev);
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  });

  return (
    <div className="rounded-lg bg-bg-1">
      <div className="px-4 py-3 border-b border-row-sep flex items-center gap-2 flex-wrap">
        <FlaskConical className="w-4 h-4 text-cyan shrink-0" />
        <span className="text-text-1 font-semibold text-[12px] uppercase tracking-wider">
          {t('ccdSectionTitle')}
        </span>
        {total > 0 && (
          <TagPill label={t('ccdCount', { count: total })} colorClass="bg-cyan/15 text-cyan border-cyan/30" />
        )}
        <button
          type="button"
          onClick={() => setDialogo(true)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11.5px] font-semibold text-cyan bg-cyan/10 hover:bg-cyan/20 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> {t('ccdImportBtn')}
        </button>
      </div>

      <div className="p-4">
        {cargando ? (
          <div className="flex items-center gap-2 text-text-muted text-[12px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('ccdLoading')}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState.Rich icon={FlaskConical} title={t('ccdEmptyTitle')} subtitle={t('ccdEmptySubtitle')} />
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => {
              const clave = `${g.date}|${g.panelName ?? ''}`;
              const abierto = abiertos.has(clave);
              return (
                <div key={clave} className="rounded-md bg-bg-2/40">
                  <button
                    type="button"
                    onClick={() => alternar(clave)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-text-1 truncate">
                        {g.panelName ?? t('ccdNoPanel')}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {fecha(g.date)}
                        {g.performedBy ? ` · ${g.performedBy}` : ''}
                      </div>
                    </div>
                    <span className="text-[10.5px] text-text-muted shrink-0">
                      {t('ccdResultCount', { count: g.results.length })}
                    </span>
                  </button>

                  {abierto && (
                    <div className="px-3 pb-3">
                      <table className="w-full">
                        <tbody>
                          {g.results.map((r) => (
                            <tr key={r.id} className="border-b border-row-sep last:border-0">
                              <td className="py-1.5 pr-3 text-[12.5px] text-text-1">{r.name}</td>
                              <td className="py-1.5 text-right text-[12.5px] font-semibold text-text-1 tabular-nums whitespace-nowrap">
                                {r.value}
                                {r.unit && <span className="font-normal text-text-muted ml-1">{r.unit}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {/* No hay rango de referencia porque el archivo NO lo trae.
                          Decirlo es la diferencia entre "está bien" y "no sé". */}
                      <div className="mt-2 text-[10.5px] text-text-muted leading-relaxed">
                        {t('ccdNoRefRange')}
                        {g.sourceFileName ? ` · ${g.sourceFileName}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Diálogo: analizar y después guardar ─────────────────────────────── */}
      <Dialog open={dialogo} onOpenChange={(v) => { if (!v) cerrar(); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[88vh]">
          <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
            <DialogTitle className="text-[14px] flex items-center gap-2">
              <FileUp className="w-4 h-4 text-cyan shrink-0" /> {t('ccdDialogTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 overflow-y-auto space-y-3">
            <p className="text-[11.5px] text-text-muted leading-relaxed">{t('ccdDialogHint')}</p>

            {/* Lo que NO se importa, dicho antes y no después: el archivo trae
                medicación y alergias, pero sin dosis y sin un solo código, así
                que entrarían como adorno y harían creer que están revisadas. */}
            <p className="text-[11.5px] text-amber leading-relaxed">{t('ccdDialogOnlyLabs')}</p>

            {!resumen && (
              <div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setError(null); }}
                  className="w-full text-[12px] text-text-2 file:mr-3 file:h-8 file:px-3 file:rounded-md file:border-0 file:bg-cyan/10 file:text-cyan file:text-[11.5px] file:font-semibold file:cursor-pointer"
                />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11.5px] text-rose flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {resumen && (
              <div className="space-y-2.5">
                {resumen.aplicado ? (
                  <div className="rounded-md border border-emerald/30 bg-emerald/10 px-3 py-2 text-[12px] text-emerald flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    {t('ccdDone', { count: resumen.insertados ?? 0 })}
                  </div>
                ) : (
                  <div className="rounded-md bg-bg-2/40 p-3 space-y-1.5">
                    <div className="text-[12.5px] text-text-1 font-semibold">{resumen.archivo}</div>
                    <div className="text-[11.5px] text-text-2">
                      {t('ccdSummaryFound', { count: resumen.leidos, panels: resumen.paneles })}
                    </div>
                    {resumen.desde && resumen.hasta && (
                      <div className="text-[11.5px] text-text-2">
                        {t('ccdSummaryRange', { from: fecha(resumen.desde), to: fecha(resumen.hasta) })}
                      </div>
                    )}
                    <div className="text-[11.5px] text-text-2">
                      {t('ccdSummaryNew', { count: resumen.nuevos })}
                      {resumen.yaEstaban > 0 && ` · ${t('ccdSummaryExisting', { count: resumen.yaEstaban })}`}
                    </div>
                    {resumen.descartadas.length > 0 && (
                      <div className="text-[11.5px] text-amber leading-relaxed">
                        {t('ccdSummarySkipped', { count: resumen.descartadas.length })}
                      </div>
                    )}
                    <div className="pt-1.5 flex flex-wrap gap-1">
                      {resumen.panelesDetalle.slice(0, 8).map((p) => (
                        <TagPill key={p.panel} label={`${p.panel} · ${p.n}`} colorClass="bg-bg-2 text-text-2 border-transparent" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-3 shrink-0 border-t border-border flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={cerrar} className="w-full sm:w-auto">
              {resumen?.aplicado ? t('ccdClose') : t('ccdCancel')}
            </Button>
            {!resumen && (
              <Button
                onClick={() => void enviar(false)}
                disabled={!archivo || trabajando}
                className="w-full sm:w-auto gap-1.5"
              >
                {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                {t('ccdAnalyze')}
              </Button>
            )}
            {resumen && !resumen.aplicado && resumen.nuevos > 0 && (
              <Button
                onClick={() => void enviar(true)}
                disabled={trabajando}
                className="w-full sm:w-auto gap-1.5"
              >
                {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {t('ccdApply', { count: resumen.nuevos })}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

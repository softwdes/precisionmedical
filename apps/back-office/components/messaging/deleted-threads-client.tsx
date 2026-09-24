'use client';

/**
 * Panel de hilos eliminados — la contracara de haber abierto el boton de borrar.
 *
 * Desde el 2026-09-20 cualquiera que participe de un hilo puede sacarlo del
 * historial del paciente. Eso resolvio un problema real —25 de 28 personas no
 * tenian forma de limpiar un mensaje de prueba de un expediente— pero solo es
 * defendible si alguien puede ver lo que se saco y devolverlo. Esta pantalla es
 * esa mitad: sin ella, "es recuperable" era cierto en la base de datos y falso
 * para cualquier persona.
 *
 * Vive como PESTAÑA al lado de la bandeja, no en Configuracion, y la diferencia
 * importa: una cola que hay que acordarse de visitar termina funcionando como un
 * borrado silencioso. Ya paso en este proyecto con `needsReview` de las notas de
 * release, donde se juntaron 30 entradas que nadie miro nunca.
 *
 * NO muestra el contenido de los mensajes a proposito. Quien revisa necesita
 * saber QUE se elimino, DE QUIEN era y QUIEN lo hizo para decidir si lo
 * devuelve; leer la conversacion es otra cosa y para eso hay que restaurarla,
 * que es una accion registrada.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw, Trash2, User, Paperclip } from 'lucide-react';
import { EmptyState, StatusPill, TableFooter } from '@/components/ui-phoenix';
import { useToast } from '@/components/ui-phoenix/toast';
import { fechaHora } from '@/lib/fechas';

interface HiloEliminado {
  id: string;
  subject: string;
  type: string;
  priority: 'NORMAL' | 'URGENT' | string;
  createdByName: string | null;
  lastEntryAt: string;
  deletedAt: string;
  deletedByName: string | null;
  patient: { id: string; name: string } | null;
  caseCode: string | null;
  entryCount: number;
}

export function DeletedThreadsClient(): React.ReactElement {
  const t = useTranslations('phoenix.messaging');
  const toast = useToast();

  const [filas, setFilas] = useState<HiloEliminado[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    try {
      const res = await fetch(`/api/messages/deleted?page=${page}`, { cache: 'no-store' });
      if (!res.ok) { setFallo(true); return; }
      const data = (await res.json()) as { threads: HiloEliminado[]; total: number };
      setFilas(data.threads);
      setTotal(data.total);
      setFallo(false);
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [page]);

  useEffect(() => { void cargar(); }, [cargar]);

  const restaurar = async (id: string): Promise<void> => {
    setRestaurando(id);
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success(t('delRestoreOk'));
      // Se quita de la lista al instante: ya no esta eliminado, no tiene por que
      // seguir aca esperando un refetch.
      setFilas((prev) => prev.filter((f) => f.id !== id));
      setTotal((n) => Math.max(0, n - 1));
    } catch {
      toast.error(t('delRestoreError'));
    } finally {
      setRestaurando(null);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-4">
      <p className="text-[12px] text-text-2 mb-3">{t('delIntro')}</p>

      {fallo ? (
        <EmptyState.Inline message={t('delError')} />
      ) : cargando ? (
        <EmptyState.Inline message={t('loading')} />
      ) : filas.length === 0 ? (
        <EmptyState.Inline message={t('delEmpty')} />
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-bg-2/40">
                  {[t('delColDeleted'), t('delColSubject'), t('delColPatient'), t('delColBy'), ''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-t border-border hover:bg-white/[0.02]">
                    <td className="px-3 !py-1.5 text-[11px] tabular-nums whitespace-nowrap text-text-muted">
                      {fechaHora(f.deletedAt)}
                    </td>
                    <td className="px-3 !py-1.5 text-[12.5px] text-text-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[22rem]">{f.subject}</span>
                        {f.priority === 'URGENT' && <StatusPill state="danger" label={t('priorityURGENT')} />}
                      </div>
                      <div className="flex items-center gap-2 text-[10.5px] text-text-muted mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="w-2.5 h-2.5" />
                          {t('delEntries', { count: f.entryCount })}
                        </span>
                        {f.caseCode && <span className="font-mono">{f.caseCode}</span>}
                        {f.createdByName && <span>{t('delOpenedBy', { name: f.createdByName })}</span>}
                      </div>
                    </td>
                    <td className="px-3 !py-1.5 text-[12.5px] text-text-2 whitespace-nowrap">
                      {f.patient?.name ?? '—'}
                    </td>
                    <td className="px-3 !py-1.5 text-[12.5px] text-text-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="w-3 h-3 text-text-muted" />
                        {f.deletedByName ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 !py-1.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={restaurando === f.id}
                        onClick={() => void restaurar(f.id)}
                        title={t('delRestoreTip')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t('delRestore')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TableFooter
            left={t('delCount', { count: total })}
            right={
              <span className="inline-flex items-center gap-2">
                <button type="button" disabled={page === 1}
                  onClick={() => setPage((n) => Math.max(1, n - 1))}
                  className="px-2 py-1 rounded border border-border hover:bg-white/5 disabled:opacity-40">
                  {t('prev')}
                </button>
                <button type="button" disabled={page * 20 >= total}
                  onClick={() => setPage((n) => n + 1)}
                  className="px-2 py-1 rounded border border-border hover:bg-white/5 disabled:opacity-40">
                  {t('next')}
                </button>
              </span>
            }
          />
        </>
      )}
    </div>
  );
}

/** Icono de la pestaña, para que el hub no importe lucide por su cuenta. */
export { Trash2 as DeletedTabIcon };

'use client';

/**
 * "Nuevo SMS": elegir a QUIÉN escribirle cuando no hay conversación previa.
 *
 * Pedido de la clínica (2026-10-06). Hasta hoy, desde esta pantalla solo se le
 * podía escribir a alguien que YA tuviera un mensaje: para el resto había que
 * ir a buscarlo a Pacientes. Medido el mismo día: de 2.046 pacientes con
 * teléfono, solo 215 tenían un SMS. **1.831 eran inalcanzables desde acá**, el
 * 89% — y hay 477 mensajes escritos a mano por 14 personas distintas, así que
 * no es un caso de borde.
 *
 * ── Este diálogo NO manda mensajes ─────────────────────────────────────────
 *
 * Contesta una sola pregunta —a quién— y le entrega el paciente a la ventana
 * de conversación de siempre. La caja de texto, el contador de segmentos, los
 * iconos, el aviso de quién más está mirando y el envío ya existen ahí. Una
 * segunda caja de redacción terminaría comportándose distinto de la primera;
 * acá ya pasó con el buscador de cargos.
 *
 * ── Los "no se puede" se muestran ANTES de escribir ────────────────────────
 *
 * La ruta de envío rechaza por tres motivos: sin teléfono, dado de baja y
 * fuera de horario. En una conversación existente eso molesta; en un mensaje
 * nuevo es peor —elegís a alguien, redactás, y recién ahí te enterás—, así que
 * los dos primeros se pintan en el renglón del resultado y el tercero arriba.
 *
 * Y el que no se puede NO se esconde: de 5.824 pacientes solo 2.046 tienen
 * número. Escondiéndolos, la misma persona buscaría tres veces al mismo y
 * pensaría que el buscador está roto.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@precision/ui';
import { Search, Loader2, UserX } from 'lucide-react';
import { EmptyState, PersonAvatar, Skeleton } from '@/components/ui-phoenix';
import { formatUsPhone } from '@/lib/phone';
import type { PacienteDelHilo } from './patient-thread-dialog';

const CLINIC_TZ = 'America/Denver';

interface Resultado {
  id: string;
  label: string;
  patientCode: string | null;
  /** El número al que SALDRÍA el mensaje. Vacío = no se le puede escribir. */
  smsPhone: string;
  /** Cuando sale al apoderado de un menor, su nombre. */
  smsVia: string | null;
  smsOptOutSince: string | null;
  isArchived: boolean;
}

export function NuevoSmsDialog({
  abierto, onOpenChange, onElegir,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  /** Entrega el paciente elegido a la ventana de conversación de siempre. */
  onElegir: (p: PacienteDelHilo) => void;
}) {
  const t      = useTranslations('phoenix.sms');
  const locale = useLocale();

  const [texto, setTexto]       = useState('');
  const [q, setQ]               = useState('');
  const [filas, setFilas]       = useState<Resultado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState(false);
  const cajaRef = useRef<HTMLInputElement | null>(null);

  // Al abrir: campo limpio y foco adentro, que es lo único que se va a hacer acá.
  useEffect(() => {
    if (!abierto) return;
    setTexto(''); setQ(''); setFilas([]); setError(false);
    const id = setTimeout(() => cajaRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [abierto]);

  /** 300 ms, igual que el buscador de al lado: una consulta por tecla no. */
  useEffect(() => {
    const id = setTimeout(() => setQ(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  const buscar = useCallback(async (termino: string) => {
    if (termino.length < 2) { setFilas([]); setCargando(false); return; }
    setCargando(true); setError(false);
    try {
      // `canal=sms` agrega el número real de destino y la baja. Es el mismo
      // buscador que usa el resto de la app, no uno nuevo.
      const res = await fetch(`/api/admin/patients/autocomplete?canal=sms&q=${encodeURIComponent(termino)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { results?: Resultado[] };
      setFilas(data.results ?? []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void buscar(q); }, [q, buscar]);


  const elegir = (r: Resultado) => {
    if (!r.smsPhone || r.smsOptOutSince) return;
    onElegir({
      // La conversación de un paciente se identifica así en toda la pantalla.
      clave: `pac:${r.id}`,
      id: r.id,
      nombre: r.label,
      numero: r.smsPhone,
      candidatos: [],
    });
    onOpenChange(false);
  };

  const cuando = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: CLINIC_TZ });

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[88vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 shrink-0">
          <DialogTitle className="text-text-1 text-base">{t('newSmsTitle')}</DialogTitle>
          <DialogDescription className="text-text-muted text-xs">{t('newSmsHint')}</DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 shrink-0 space-y-2">

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={cajaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t('newSmsSearch')}
              className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
          {texto.trim().length < 2 ? (
            <p className="text-center text-[11px] text-text-muted py-6">{t('newSmsMin')}</p>
          ) : cargando && filas.length === 0 ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : error ? (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
              {t('loadError')}
            </div>
          ) : filas.length === 0 ? (
            <EmptyState.Rich icon={UserX} title={t('newSmsNoResults')} subtitle={t('newSmsNoResultsHint')} />
          ) : (
            <div className="rounded-lg overflow-hidden">
              {filas.map((r) => {
                const [nom, ...resto] = r.label.split(' ');
                const sinTelefono = !r.smsPhone;
                const deBaja      = !!r.smsOptOutSince;
                const bloqueado   = sinTelefono || deBaja;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => elegir(r)}
                    disabled={bloqueado}
                    /* Se MUESTRA aunque no se pueda, con el motivo al lado.
                       Esconderlo haría buscar al mismo paciente tres veces. */
                    className={`w-full text-left flex items-start gap-3 px-3 py-2.5 border-b border-row-sep last:border-0 transition-colors ${
                      bloqueado ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <PersonAvatar firstName={nom || '?'} lastName={resto.join(' ')} size={8} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-text-1">{r.label}</span>
                        {r.patientCode && (
                          <span className="font-mono text-[10px] text-text-muted">{r.patientCode}</span>
                        )}
                        {r.isArchived && (
                          <span className="text-[10px] text-text-muted">· {t('newSmsArchived')}</span>
                        )}
                      </div>
                      {sinTelefono ? (
                        <p className="text-[11px] text-amber mt-0.5">{t('newSmsNoPhone')}</p>
                      ) : deBaja ? (
                        <p className="text-[11px] text-rose mt-0.5">
                          {t('newSmsOptOut', { fecha: cuando(r.smsOptOutSince!) })}
                        </p>
                      ) : (
                        <p className="text-[11px] text-text-2 mt-0.5">
                          {formatUsPhone(r.smsPhone)}
                          {/* A un menor el SMS NO le llega a él: sale al teléfono
                              del apoderado. Decirlo antes de redactar. */}
                          {r.smsVia && (
                            <span className="text-amber"> · {t('newSmsVia', { nombre: r.smsVia })}</span>
                          )}
                        </p>
                      )}
                    </div>
                    {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted shrink-0 mt-1" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

/**
 * Los mensajes del caso, dentro del tab Notas.
 *
 * ── Por qué acá y no en un tab ──────────────────────────────────────────────
 *
 * Pedido de la clínica (Erick, 2026-09-03): al escribir la nota hace falta
 * saber si alguien dijo algo de este paciente. El botón "Ver caso" ya llegaba a
 * los mensajes, pero abre el expediente COMPLETO —todas las citas, todos los
 * labs, la facturación— y en un tab aparte no se lee mientras se escribe.
 *
 * ── La línea que no se cruza ────────────────────────────────────────────────
 *
 * La nota es un documento que se FIRMA: lo que está en el cuerpo es lo que el
 * provider atestigua. Así que los mensajes van AL LADO de la nota y nunca
 * adentro, y si el contenido importa clínicamente se CITA a propósito con
 * `onCitar` — nunca se inyecta solo.
 *
 * ── Tamaño ──────────────────────────────────────────────────────────────────
 *
 * Medido el 2026-09-03: mediana de 1 hilo por caso (máximo 5) y 2 mensajes por
 * hilo. Es una tarjeta, no un panel de chat: se listan TODOS los hilos sin
 * paginar, y leer el hilo completo abre el `ThreadViewDialog` que ya existe
 * (que además responde). El diálogo va encima y la nota queda montada y
 * autoguardada, así que no se pierde nada.
 *
 * ── Alcance: el CASO, no el paciente ───────────────────────────────────────
 *
 * Un caso MVA tiene mensajes que involucran al bufete; mostrarlos bajo la nota
 * de un caso GM es una fuga entre expedientes. Los de otros casos se CUENTAN
 * (línea al pie, que lleva al expediente) pero no se listan — la cuenta la hace
 * el servidor, ver `otrosCasos` en la ruta.
 */

import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AlertTriangle, ChevronDown, Eye, Lock, MessagesSquare, Paperclip, Quote } from 'lucide-react';
import { ThreadViewDialog } from '@/components/messaging/thread-view-dialog';
import { ZONA_CLINICA } from '@/lib/fechas';

export interface HiloDelCaso {
  id: string;
  subject: string;
  type: 'ALERT' | 'REMINDER' | 'REQUEST' | 'MESSAGE';
  priority: 'NORMAL' | 'URGENT';
  createdByName: string;
  lastAuthorName: string | null;
  lastEntryAt: string;
  sealedAt: string | null;
  preview: string | null;
  attachmentCount: number;
  unread: boolean;
}

interface Datos {
  hilos: HiloDelCaso[];
  /** Urgentes SIN LEER y sin archivar — los que ameritan la tira sobre la nota. */
  urgentes: HiloDelCaso[];
  otrosCasos: number;
  cargando: boolean;
  recargar: () => void;
}

/**
 * Una sola consulta para los dos lugares (la tarjeta del contexto y la tira del
 * urgente). Viven en ramas distintas del árbol, así que el hook va en el padre
 * y baja los datos: dos `fetch` del mismo endpoint en la misma pantalla sería
 * pedir lo mismo dos veces y poder mostrarlo distinto.
 */
export function useMensajesDelCaso(
  patientId: string | null,
  caseId: string | null,
): Datos {
  const [hilos, setHilos] = React.useState<HiloDelCaso[]>([]);
  const [otrosCasos, setOtrosCasos] = React.useState(0);
  const [cargando, setCargando] = React.useState(true);

  const cargar = React.useCallback(async () => {
    if (!patientId || !caseId) { setHilos([]); setOtrosCasos(0); setCargando(false); return; }
    setCargando(true);
    try {
      const res = await fetch(`/api/messages/patient/${patientId}?caseId=${caseId}`);
      const json = await res.json().catch(() => ({}));
      setHilos(Array.isArray(json.threads) ? json.threads : []);
      setOtrosCasos(typeof json.otrosCasos === 'number' ? json.otrosCasos : 0);
    } catch {
      setHilos([]);
      setOtrosCasos(0);
    } finally {
      setCargando(false);
    }
  }, [patientId, caseId]);

  React.useEffect(() => { void cargar(); }, [cargar]);

  /**
   * Archivado (`sealedAt`) no es pendiente: sellar saca el hilo de todas las
   * bandejas justamente porque ya se atendió. Sigue en la lista, apagado y al
   * final, porque es el antecedente que un provider quiere leer.
   */
  const urgentes = React.useMemo(
    () => hilos.filter((h) => h.priority === 'URGENT' && h.unread && !h.sealedAt),
    [hilos],
  );

  return { hilos, urgentes, otrosCasos, cargando, recargar: cargar };
}

/** El tono de cada tipo. ALERT en rosa, y el resto según la paleta de Regla #5. */
const TONO: Record<HiloDelCaso['type'], string> = {
  ALERT:    'text-rose bg-rose/15',
  REQUEST:  'text-cyan bg-cyan/15',
  REMINDER: 'text-amber bg-amber/15',
  MESSAGE:  'text-text-2 bg-white/[0.06]',
};

/** HTML del cuerpo → texto plano, sin ejecutar nada de lo que venga adentro.
 *
 *  `DOMParser` y no `innerHTML` sobre un div suelto: con `innerHTML` un
 *  `<img src=x onerror=...>` dispara igual aunque el nodo no esté en el
 *  documento. `parseFromString` no ejecuta scripts ni carga recursos. */
function aTexto(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────

interface CardProps {
  datos: Datos;
  currentUserId: string | null;
  /**
   * Inserta la cita en el HPI. `null` = no se puede escribir la nota ahora
   * (turno del provider, o nota firmada): el botón se MUESTRA bloqueado con el
   * motivo, no se esconde.
   */
  onCitar: ((html: string) => void) | null;
  /** Motivo del bloqueo, cuando `onCitar` es null. */
  motivoBloqueo?: string | null;
  /** Abre el expediente del paciente — la línea "N en otro caso". */
  onVerCaso?: (() => void) | null;
  isAdmin?: boolean;
}

export function MensajesDelCasoCard({
  datos, currentUserId, onCitar, motivoBloqueo, onVerCaso, isAdmin = false,
}: CardProps): React.ReactElement | null {
  const t  = useTranslations('phoenix.messaging');
  const locale = useLocale();
  const { hilos, urgentes, otrosCasos, cargando, recargar } = datos;

  /**
   * `null` = todavía nadie tocó nada: abierta en desktop y cerrada en mobile,
   * por CSS. Ahí el contexto entero se pliega en un acordeón, y una tarjeta
   * abierta adentro empuja la nota fuera de la pantalla. Al hacer clic pasa a
   * booleano y manda en los dos tamaños.
   */
  const [abierta, setAbierta] = React.useState<boolean | null>(null);
  const [hiloAbierto, setHiloAbierto] = React.useState<string | null>(null);
  const [citando, setCitando] = React.useState<string | null>(null);

  const cuerpo = abierta === null ? 'hidden lg:block' : abierta ? 'block' : 'hidden';

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-US' : 'en-US', {
      day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: ZONA_CLINICA,
    });

  /**
   * Cita el ÚLTIMO mensaje del hilo, con su fuente y su fecha.
   *
   * Se trae el hilo completo en vez de usar `preview`: la vista previa está
   * recortada a 140 caracteres y una cita clínica cortada a la mitad es peor
   * que no citar. La cita se arma acá y no en el servidor porque el idioma del
   * encabezado es el de quien escribe la nota.
   */
  async function citar(h: HiloDelCaso): Promise<void> {
    if (!onCitar) return;
    setCitando(h.id);
    try {
      const res  = await fetch(`/api/messages/${h.id}`);
      const json = await res.json().catch(() => ({}));
      const entradas = Array.isArray(json.thread?.entries) ? json.thread.entries : [];
      const ultima = entradas[entradas.length - 1];
      if (!ultima?.body) return;
      const texto = aTexto(ultima.body);
      if (!texto) return;
      const sello = `[${fecha(ultima.sentAt ?? h.lastEntryAt)}] ${ultima.authorName ?? h.createdByName}`;
      onCitar(
        `<blockquote><p><em>${escapar(t('noteQuoteHeading'))} — ${escapar(sello)}</em></p>` +
        `<p>${escapar(texto)}</p></blockquote>`,
      );
    } catch {
      /* silencio: no citar no rompe nada y el hilo sigue ahí para leerlo */
    } finally {
      setCitando(null);
    }
  }

  if (!cargando && hilos.length === 0 && otrosCasos === 0) return null;

  return (
    <div className="rounded-lg bg-bg-2/30 overflow-hidden">
      {/* La anatomía es la del `Section` del panel de contexto (icono + título +
          contador + chevron). Está replicada y no importada porque ese `Section`
          es local de `patient-context-panel` y acá el contador cambia de color
          cuando hay un urgente — si se promueve a ui-phoenix, este es el
          primer llamador que hay que migrar. */}
      <button
        type="button"
        onClick={() => setAbierta((v) => (v === null ? false : !v))}
        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-11 hover:bg-white/[0.02] transition-colors"
      >
        <MessagesSquare className="w-3.5 h-3.5 text-violet-text shrink-0" />
        <span className="text-[12px] font-semibold text-text-1 flex-1 text-left">{t('noteCardTitle')}</span>
        {hilos.length > 0 && (
          <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
            urgentes.length > 0 ? 'text-rose bg-rose/20' : 'text-violet-text bg-violet/15'
          }`}>
            {hilos.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${abierta === false ? '-rotate-90' : ''}`} />
      </button>

      <div className={`px-3 pb-3 ${cuerpo}`}>
        {cargando ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <div key={i} className="h-12 rounded-md bg-bg-2/40 animate-pulse" />)}
          </div>
        ) : (
          <>
            {hilos.length === 0 && (
              <div className="text-[11px] text-text-muted py-1">{t('noteCardEmpty')}</div>
            )}

            {hilos.map((h) => {
              const esUrgente = h.priority === 'URGENT' && h.unread && !h.sealedAt;
              return (
                <div
                  key={h.id}
                  className={`py-2.5 border-t border-row-sep first:border-t-0 ${
                    esUrgente ? 'border-l-2 border-l-rose pl-2 -ml-2 bg-rose/[0.05]' : ''
                  } ${h.sealedAt ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className={`text-[9.5px] font-bold rounded px-1.5 py-px ${TONO[h.type]}`}>
                      {t(`type${h.type}` as 'typeMESSAGE')}
                    </span>
                    {esUrgente && (
                      <span className="text-[9.5px] font-bold rounded px-1.5 py-px bg-rose text-bg-0">
                        {t('priorityURGENT')}
                      </span>
                    )}
                    <span className="text-[9.5px] text-text-muted">{fecha(h.lastEntryAt)}</span>
                    {h.sealedAt && (
                      <span className="text-[9px] text-text-muted inline-flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> {t('noteSealed')}
                      </span>
                    )}
                    {h.attachmentCount > 0 && (
                      <span className="text-[9.5px] text-text-muted inline-flex items-center gap-0.5">
                        <Paperclip className="w-2.5 h-2.5" /> {h.attachmentCount}
                      </span>
                    )}
                  </div>

                  <div className={`text-[11.5px] leading-tight ${
                    h.unread ? 'font-bold text-text-1' : 'font-medium text-text-2'
                  }`}>
                    {h.subject}
                  </div>
                  <div className="text-[10.5px] text-text-muted mt-px">
                    {h.lastAuthorName ?? h.createdByName}
                  </div>

                  {h.preview && (
                    <div className="text-[11px] text-text-2 mt-1.5 pl-2 border-l-2 border-border-strong leading-snug">
                      {h.preview}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setHiloAbierto(h.id)}
                      className="text-[10px] font-bold inline-flex items-center gap-1 px-1.5 py-1 rounded text-brand-text bg-brand/[0.14] hover:bg-brand/25 transition-colors"
                    >
                      <Eye className="w-2.5 h-2.5" /> {t('noteActRead')}
                    </button>
                    {/* Bloqueado se MUESTRA con el motivo. Esconderlo haría
                        pensar que la función no existe. */}
                    <button
                      type="button"
                      disabled={!onCitar || citando === h.id}
                      title={onCitar ? undefined : (motivoBloqueo ?? undefined)}
                      onClick={() => void citar(h)}
                      className={`text-[10px] font-bold inline-flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
                        onCitar
                          ? 'text-violet-text bg-violet/[0.14] hover:bg-violet/25'
                          : 'text-text-muted bg-white/[0.04] cursor-not-allowed'
                      }`}
                    >
                      <Quote className="w-2.5 h-2.5" /> {t('noteActQuote')}
                    </button>
                  </div>
                </div>
              );
            })}

            {otrosCasos > 0 && (
              <div className="border-t border-row-sep pt-2 mt-0.5">
                <button
                  type="button"
                  disabled={!onVerCaso}
                  onClick={() => onVerCaso?.()}
                  className={`text-[10px] text-left ${onVerCaso ? 'text-text-muted hover:text-brand-text' : 'text-text-muted cursor-default'}`}
                >
                  {t('noteOtherCases', { count: otrosCasos })}
                  {onVerCaso && <span className="text-brand-text font-semibold"> →</span>}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {hiloAbierto && currentUserId && (
        <ThreadViewDialog
          open
          threadId={hiloAbierto}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setHiloAbierto(null)}
          onChanged={recargar}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface StripProps {
  datos: Datos;
  currentUserId: string | null;
  isAdmin?: boolean;
}

/**
 * La tira del urgente, SOBRE la nota.
 *
 * Va en el mismo slot donde vive el aviso del turno, que es el lugar ya
 * establecido para "algo que cambia lo que estás por hacer". Cuando están los
 * dos, el turno va PRIMERO: decide si podés escribir.
 *
 * En teléfono es la única vía — ahí el contexto se pliega entero y la tarjeta
 * arranca cerrada, así que un urgente adentro no lo ve nadie.
 *
 * Tope de dos: la tira es un aviso, no una bandeja. Del tercero en adelante se
 * cuenta y se leen en la tarjeta.
 */
const TOPE_TIRA = 2;

export function MensajeUrgenteStrip({
  datos, currentUserId, isAdmin = false,
}: StripProps): React.ReactElement | null {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();
  const [hiloAbierto, setHiloAbierto] = React.useState<string | null>(null);

  const { urgentes, recargar } = datos;
  if (urgentes.length === 0) return null;

  const visibles = urgentes.slice(0, TOPE_TIRA);
  const resto = urgentes.length - visibles.length;

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === 'es' ? 'es-US' : 'en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: ZONA_CLINICA,
    });

  return (
    <div className="space-y-2">
      {visibles.map((h) => (
        <div
          key={h.id}
          className="rounded-md border border-rose/35 bg-rose/10 px-3 py-2.5 flex items-start gap-2 flex-wrap"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose shrink-0 mt-px" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9.5px] font-bold rounded px-1.5 py-px bg-rose text-bg-0">
                {t('priorityURGENT')}
              </span>
              <span className="text-[12px] font-semibold text-rose">{h.subject}</span>
              <span className="text-[10.5px] text-text-muted">
                · {h.lastAuthorName ?? h.createdByName} · {hora(h.lastEntryAt)}
              </span>
            </div>
            {h.preview && (
              <div className="text-[11px] text-text-2 mt-1 leading-snug">{h.preview}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setHiloAbierto(h.id)}
            className="text-[11px] font-bold rounded-md bg-rose text-bg-0 px-3 py-1.5 min-h-8 hover:bg-rose/90 transition-colors shrink-0"
          >
            {t('noteActRead')}
          </button>
        </div>
      ))}

      {resto > 0 && (
        <div className="text-[10.5px] text-text-muted px-1">{t('noteMoreUrgent', { count: resto })}</div>
      )}

      {hiloAbierto && currentUserId && (
        <ThreadViewDialog
          open
          threadId={hiloAbierto}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setHiloAbierto(null)}
          onChanged={recargar}
        />
      )}
    </div>
  );
}

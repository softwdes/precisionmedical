'use client';

/**
 * La conversación con UN paciente: lo que le mandamos y lo que contestó.
 *
 * Pedido de la clínica (2026-09-28): "We need to be able to look at all the
 * messages sent to the patient", con Weave como referencia. El historial
 * general contesta "¿este mensaje llegó?"; esto contesta "¿qué hablamos con
 * esta persona?", que es otra pregunta y no se responde leyendo una tabla
 * ordenada por fecha con todos los pacientes mezclados.
 *
 * Va en orden ASCENDENTE, como cualquier chat: lo último abajo, pegado a la
 * caja de respuesta, que es donde la vista arranca.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button } from '@precision/ui';
import { Send, AlertTriangle, Loader2, Smile, Eye, Undo2 } from 'lucide-react';
import { PersonAvatar, StatusPill, Skeleton } from '@/components/ui-phoenix';
import { formatUsPhone } from '@/lib/phone';
import { segmentosSms } from '@/lib/sms-segmentos';
import { claveDeConversacion } from '@/lib/presencia-sms';
import { usePresenciaSms } from '@/lib/use-presencia-sms';

/**
 * Los iconos que ofrece la caja de respuesta. Pedido de Reagan (2026-09-29).
 *
 * Una lista CORTA y a mano, no una libreria de emojis: las librerias pesan
 * cientos de kB para elegir entre mil caritas, y en una respuesta de clinica
 * se usan siempre los mismos cinco. Estos son los que dicen algo en este
 * contexto — confirmar, hora, fecha, llamar, donde — mas los tres de cortesia.
 *
 * ⚠️ Cada uno pasa el SMS a UCS-2, donde el segmento cae de 160 a 70
 * caracteres. En un mensaje corto no cuesta nada; en uno de ~74 lo parte en
 * dos. Por eso el contador de al lado los detecta y avisa en el momento, en
 * vez de prohibirlos: la decision es de quien escribe, con el precio a la vista.
 */
const ICONOS = ['✅', '⏰', '📅', '📞', '📍', '🙂', '👍', '🙏', '⚠️'] as const;

const CLINIC_TZ = 'America/Denver';

interface Mensaje {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  body: string;
  createdAt: string;
  sentByName: string | null;
  errorCode: number | null;
  /** Alguien decidio que no necesitaba respuesta. Solo en los ENTRANTES. */
  resolvedAt: string | null;
  resolvedByName: string | null;
}

/**
 * Una CONVERSACION, que es con un numero. El paciente es un dato que
 * resolvemos cuando podemos, no un requisito para abrirla (Erick, 2026-10-01).
 */
export interface PacienteDelHilo {
  /** `pac:<id>` o `tel:<10 digitos>`. */
  clave: string;
  /** `null` cuando el numero coincide con varias fichas, o con ninguna. */
  id: string | null;
  nombre: string | null;
  numero: string;
  /** Los que comparten ese numero. Vacio cuando ya esta resuelto. */
  candidatos?: Array<{ id: string; nombre: string }>;
}

export function PatientThreadDialog({
  patient, onOpenChange, onEnviado,
}: {
  patient: PacienteDelHilo | null;
  onOpenChange: (open: boolean) => void;
  /** Para que la lista de atrás se entere de que hay un mensaje nuevo. */
  onEnviado?: () => void;
}) {
  const t      = useTranslations('phoenix.sms');
  const locale = useLocale();

  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto]       = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  const cajaRef = useRef<HTMLTextAreaElement | null>(null);
  const [iconosAbiertos, setIconosAbiertos] = useState(false);
  const [asignando, setAsignando] = useState(false);

  /**
   * Decir a que paciente pertenece esta conversacion.
   *
   * Se guarda en TODOS los mensajes de ese numero, no solo en el que esta a la
   * vista: la gracia es que el hilo aparezca en la ficha y que el proximo
   * mensaje entre ya resuelto. Una eleccion, una vez.
   */
  const asignar = async (patientId: string) => {
    if (!patient || asignando) return;
    setAsignando(true);
    try {
      const res = await fetch('/api/admin/message-logs/conversaciones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: patient.clave, patientId }),
      });
      if (!res.ok) { setError(t('assignError')); return; }
      onEnviado?.();     // la lista de atras tiene que re-resolver el nombre
      onOpenChange(false);
    } catch {
      setError(t('assignError'));
    } finally {
      setAsignando(false);
    }
  };

  /**
   * Devolver la conversacion a *Por responder*.
   *
   * Es el deshacer que sobrevive a cerrar la pantalla: el de la lista vive en
   * memoria y se pierde al salir, y sin este el unico camino de vuelta seria
   * esperar a que el paciente escriba. Aparece solo cuando hay algo marcado.
   */
  const [reabriendo, setReabriendo] = useState(false);
  const reabrir = async () => {
    if (!patient || reabriendo) return;
    setReabriendo(true);
    try {
      const res = await fetch('/api/admin/message-logs/conversaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: patient.clave, abrir: true }),
      });
      if (!res.ok) { setError(t('resolveError')); return; }
      await cargar(patient.clave);
      onEnviado?.();         // la lista de atras y el badge
    } catch {
      setError(t('resolveError'));
    } finally {
      setReabriendo(false);
    }
  };

  const patientId = patient?.id ?? null;

  /**
   * Quien MAS esta mirando esta conversacion ahora mismo.
   *
   * Avisa, no bloquea: la caja de respuesta sigue habilitada. Lo que resuelve
   * es el caso real —dos personas de recepcion contestandole lo mismo al
   * mismo paciente— y para eso alcanza con que se vean.
   */
  const claveConv = patient?.clave ?? null;
  const otrosMirando = usePresenciaSms(claveConv);

  const cargar = useCallback(async (clave: string) => {
    setCargando(true);
    try {
      // Por CLAVE y no por paciente: asi funciona tambien con `tel:`.
      const res = await fetch(`/api/admin/message-logs/conversaciones?clave=${encodeURIComponent(clave)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { mensajes?: Mensaje[] };
      setMensajes(data.mensajes ?? []);
    } catch {
      setError(t('threadLoadError'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    if (!claveConv) return;
    setTexto('');
    setError(null);
    void cargar(claveConv);
  }, [claveConv, cargar]);

  // El chat arranca abajo: lo último es lo que importa.
  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [mensajes]);

  /**
   * Inserta en el CURSOR, no al final.
   *
   * Pegarlo siempre al final obliga a escribir el mensaje, poner el icono y
   * despues moverlo a mano — que es exactamente el trabajo que el boton venia
   * a ahorrar. El foco vuelve a la caja para poder seguir escribiendo.
   */
  const insertarIcono = (icono: string) => {
    const caja = cajaRef.current;
    if (!caja) { setTexto((t) => t + icono); return; }
    const ini = caja.selectionStart ?? texto.length;
    const fin = caja.selectionEnd ?? ini;
    setTexto(texto.slice(0, ini) + icono + texto.slice(fin));
    requestAnimationFrame(() => {
      caja.focus();
      const pos = ini + icono.length;
      caja.setSelectionRange(pos, pos);
    });
  };

  const medida = segmentosSms(texto);

  const enviar = async () => {
    if (!patient || !texto.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/message-logs/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sin paciente va el NUMERO: el servidor usa la ficha cuando hay una
        // y el numero cuando no. Ver la ruta de envio.
        body: JSON.stringify({ patientId, numero: patient.numero, body: texto.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) {
        /**
         * Los tres rechazos que NO son fallas técnicas llevan su propia frase.
         * "Error 409" le dice a recepción que algo se rompió cuando en realidad
         * el sistema está haciendo exactamente lo que tiene que hacer.
         */
        if (data.error === 'FUERA_DE_HORARIO') { setError(t('outsideHours')); return; }
        if (data.error === 'DADO_DE_BAJA')     { setError(t('optedOut'));     return; }
        if (data.error === 'SIN_TELEFONO')     { setError(t('noPhone'));      return; }
        setError(t('sendError'));
        return;
      }

      setTexto('');
      await cargar(claveConv!);
      onEnviado?.();
    } catch {
      setError(t('sendError'));
    } finally {
      setEnviando(false);
    }
  };

  /**
   * El ULTIMO entrante es el que define el estado del hilo, igual que en la
   * lista. Los viejos pueden estar marcados y no significan nada: lo que
   * importa es si lo ultimo que dijo el paciente quedo cerrado o abierto.
   */
  const ultimoEntrante = [...mensajes].reverse().find((m) => m.direction === 'INBOUND');
  const marcadoSinRespuesta = ultimoEntrante?.resolvedAt != null;

  const cuando = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: CLINIC_TZ,
    });

  return (
    <Dialog open={patient !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 shrink-0">
          <DialogTitle className="text-text-1 flex items-center gap-2 text-base">
            {patient && <PersonAvatar firstName={patient.nombre ?? '?'} lastName="" size={8} />}
            {patient?.nombre ?? (patient ? formatUsPhone(patient.numero) : '')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {patient?.nombre ? formatUsPhone(patient.numero) : t('unassignedThread')}
          </DialogDescription>
        </DialogHeader>

        {/* Varios pacientes comparten este numero. El sistema NO elige —meter un
            mensaje en la ficha clinica equivocada es peor que no meterlo— pero
            tampoco deja la conversacion muerta: se puede leer, responder, y
            decidir de quien es. */}
        {patient && !patient.id && (patient.candidatos?.length ?? 0) > 0 && (
          <div className="mx-4 sm:mx-6 rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 shrink-0">
            <p className="text-[11px] text-amber">{t('assignAsk', { n: patient.candidatos!.length })}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {patient.candidatos!.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void asignar(c.id)}
                  disabled={asignando}
                  className="px-2 py-1 rounded-md border border-amber/40 text-[11px] text-amber hover:bg-amber/15 disabled:opacity-50 transition-colors"
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gris y no ambar: no es un problema ni algo que haya que atender, es
            el estado en el que alguien dejo la conversacion a proposito. El
            aviso existe para que se sepa POR QUE no aparece en la pestaña, y
            para tener el camino de vuelta a mano. */}
        {marcadoSinRespuesta && (
          <div className="mx-4 sm:mx-6 rounded-md bg-bg-2/40 px-3 py-2 shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-text-muted">
              {ultimoEntrante?.resolvedByName
                ? t('resolvedBy', { nombre: ultimoEntrante.resolvedByName })
                : t('resolvedByUnknown')}
            </span>
            <button
              type="button"
              onClick={() => void reabrir()}
              disabled={reabriendo}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-text hover:underline disabled:opacity-50"
            >
              {reabriendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
              {t('reopen')}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 space-y-2.5">
          {cargando && mensajes.length === 0 ? (
            <>
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-12 w-2/3 ml-auto" />
            </>
          ) : mensajes.length === 0 ? (
            <p className="text-center text-xs text-text-muted py-8">{t('threadEmpty')}</p>
          ) : mensajes.map((m) => {
            const nuestro = m.direction === 'OUTBOUND';
            return (
              /* Lo nuestro a la derecha, lo del paciente a la izquierda: la
                 convención de cualquier chat, y ahorra leer quién habla. */
              <div key={m.id} className={`flex ${nuestro ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 ${nuestro ? 'bg-brand/10' : 'bg-bg-2'}`}>
                  <p className="text-[12.5px] text-text-1 whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-text-muted">{cuando(m.createdAt)}</span>
                    {nuestro && m.sentByName && (
                      <span className="text-[10px] text-text-muted">· {m.sentByName}</span>
                    )}
                    {/* El estado solo en lo nuestro: de lo que llegó no hay duda. */}
                    {nuestro && m.status !== 'DELIVERED' && (
                      <StatusPill
                        state={m.status === 'QUEUED' || m.status === 'SENT' ? 'warning' : 'danger'}
                        label={m.status}
                      />
                    )}
                    {m.errorCode != null && (
                      <span className="font-mono text-[9.5px] text-rose">#{m.errorCode}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={finRef} />
        </div>

        <div className="border-t border-border px-4 sm:px-6 py-3 shrink-0 space-y-2">
          {/* Ambar y no rojo: es un dato para tener en cuenta, no un error ni
              algo que impida seguir. La caja de abajo queda habilitada. */}
          {otrosMirando.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
              <Eye className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                {otrosMirando.length === 1
                  ? t('alsoViewing', { nombre: otrosMirando[0]?.nombre ?? t('someone') })
                  : t('alsoViewingMany', { n: otrosMirando.length })}
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
          {iconosAbiertos && (
            <div className="flex items-center gap-1 flex-wrap">
              {ICONOS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => insertarIcono(ic)}
                  className="w-7 h-7 rounded-md text-base leading-none hover:bg-bg-2 transition-colors"
                >
                  {ic}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={cajaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t('replyPlaceholder')}
            rows={2}
            className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* El contador es de SEGMENTOS, no de caracteres: un solo acento
                parte el mensaje de 153 a 67 y ahí está el costo real. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIconosAbiertos(v => !v)}
                title={t('icons')}
                aria-label={t('icons')}
                className={`w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors ${iconosAbiertos ? 'bg-brand/15 text-brand-text' : 'text-text-muted hover:bg-bg-2'}`}
              >
                <Smile className="w-4 h-4" />
              </button>
              <div className="text-[11px] text-text-muted">
              {t('segments', { n: medida.segmentos, chars: texto.length })}
              {!medida.gsm && (
                <span className="text-amber ml-1.5">
                  · {t('unicodeWarning', { chars: medida.culpables.slice(0, 3).join(' ') })}
                </span>
              )}
              </div>
            </div>
            <Button onClick={() => void enviar()} disabled={!texto.trim() || enviando} className="gap-1.5">
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {t('send')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

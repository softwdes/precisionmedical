'use client';

/**
 * La pestaña *Por responder*: las conversaciones que esperan algo.
 *
 * Pedido de la clínica el 2026-10-01, con Weave de referencia. La diferencia
 * con la lista de al lado es que acá hay **un renglón por conversación**, no
 * por mensaje: un paciente que escribió cuatro veces seguidas es una cosa
 * pendiente, no cuatro.
 *
 * Por qué "pendiente" no es "sin leer" —y por qué el número da 3 donde el otro
 * daría 6— está en `lib/conversaciones-sms.ts`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Inbox, Loader2, RefreshCw, Undo2 } from 'lucide-react';
import { EmptyState, PersonAvatar, Skeleton } from '@/components/ui-phoenix';
import { formatUsPhone } from '@/lib/phone';
import type { PacienteDelHilo } from './patient-thread-dialog';

const CLINIC_TZ = 'America/Denver';

interface Conversacion {
  clave: string;
  patientId: string | null;
  nombre: string | null;
  numero: string;
  ultimo: { body: string; createdAt: string; deEntrada: boolean; sinLeer: boolean };
  total: number;
  pendiente: boolean;
  candidatos: Array<{ id: string; nombre: string }>;
}

export function ConversacionesPendientes({
  onAbrir, recargar, onCambio,
}: {
  /** Abre el hilo. `null` en `patientId` significa que no se pudo reconocer. */
  onAbrir: (p: PacienteDelHilo) => void;
  /** Cambia para forzar una recarga desde afuera (al responder, por ejemplo). */
  recargar?: number;
  /** Avisa que el número del badge cambió: descartar una conversación lo baja. */
  onCambio?: () => void;
}) {
  const t      = useTranslations('phoenix.sms');
  const locale = useLocale();

  const [filas, setFilas]       = useState<Conversacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(false);
  /**
   * Las que se acaban de descartar, con su botón de deshacer.
   *
   * Viven acá y NO en `filas` a propósito: la recarga que baja el badge las
   * borraría de la lista y el deshacer se evaporaría justo en el momento en que
   * hace falta. Se pierden al salir de la pantalla — para entonces el camino de
   * vuelta es el hilo, que ofrece reabrir.
   */
  const [descartadas, setDescartadas] = useState<Conversacion[]>([]);
  /** Las claves con una petición en vuelo, para no mandar dos. */
  const [enVuelo, setEnVuelo] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const res = await fetch('/api/admin/message-logs/conversaciones?pendientes=1');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { conversaciones: Conversacion[] };
      setFilas(data.conversaciones ?? []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar, recargar]);

  /**
   * Marcar "no necesita respuesta", y el camino de vuelta.
   *
   * La fila se mueve ANTES de que conteste el servidor: con un "Ok" en pantalla
   * la decisión ya está tomada, y esperar un viaje de red para verla moverse
   * hace que se sienta rota. Si el servidor rechaza, vuelve a su lugar — la
   * pantalla no puede quedar afirmando algo que la base no guardó.
   */
  const marcar = async (c: Conversacion, abrir: boolean) => {
    if (enVuelo.includes(c.clave)) return;
    setEnVuelo((v) => [...v, c.clave]);

    const aPendientes = () => {
      setDescartadas((d) => d.filter((x) => x.clave !== c.clave));
      setFilas((f) => (f.some((x) => x.clave === c.clave) ? f : [c, ...f]));
    };
    const aDescartadas = () => {
      setFilas((f) => f.filter((x) => x.clave !== c.clave));
      setDescartadas((d) => (d.some((x) => x.clave === c.clave) ? d : [c, ...d]));
    };

    if (abrir) aPendientes(); else aDescartadas();

    try {
      const res = await fetch('/api/admin/message-logs/conversaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: c.clave, abrir }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onCambio?.();          // el badge de la pestaña tiene que moverse
    } catch {
      if (abrir) aDescartadas(); else aPendientes();
      setError(true);
    } finally {
      setEnVuelo((v) => v.filter((k) => k !== c.clave));
    }
  };

  /** "hace 2 h" dice mejor que una hora exacta cuánto lleva esperando alguien. */
  const hace = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1)  return t('justNow');
    if (min < 60) return t('agoMin', { n: min });
    const h = Math.round(min / 60);
    if (h < 24)   return t('agoHour', { n: h });
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: CLINIC_TZ });
  };

  const comoSeLlama = (c: Conversacion) => c.nombre ?? formatUsPhone(c.numero);

  const vacio = filas.length === 0 && descartadas.length === 0;

  if (cargando && vacio) {
    return <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>;
  }

  if (error && vacio) {
    return (
      <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-center justify-between gap-3 flex-wrap">
        <span>{t('loadError')}</span>
        <button type="button" onClick={() => void cargar()} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
          <RefreshCw className="w-3 h-3" />{t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Lo recién descartado, arriba y en chico: ya no pide nada, pero todavía
          tiene que poder volver. */}
      {descartadas.map((c) => (
        <div
          key={c.clave}
          className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-row-sep last:border-0 text-[11px] text-text-muted"
        >
          <span className="truncate">{t('resolvedRow', { nombre: comoSeLlama(c) })}</span>
          <button
            type="button"
            onClick={() => void marcar(c, true)}
            disabled={enVuelo.includes(c.clave)}
            className="shrink-0 inline-flex items-center gap-1 font-semibold text-brand-text hover:underline disabled:opacity-50"
          >
            <Undo2 className="w-3 h-3" />{t('undo')}
          </button>
        </div>
      ))}

      {/* Vacío es el estado BUENO acá: no hay nadie esperando. El texto lo dice
          así en vez de "no se encontraron resultados", que suena a que falló.
          Con algo recién descartado arriba no se muestra: la pantalla ya está
          diciendo qué pasó, y el cartel grande taparía el deshacer. */}
      {filas.length === 0 ? (
        descartadas.length === 0 && (
          <EmptyState.Rich icon={Inbox} title={t('actionableEmptyTitle')} subtitle={t('actionableEmptyHint')} />
        )
      ) : filas.map((c) => {
        const [nom, ...resto] = (c.nombre ?? '').split(' ');
        const ocupada = enVuelo.includes(c.clave);
        return (
          <div
            key={c.clave}
            className="flex items-start border-b border-row-sep last:border-0 hover:bg-white/[0.02] transition-colors"
          >
            <button
              type="button"
              /* Se abre SIEMPRE, con paciente o sin él: la conversación es con
                 un número. Antes esta fila estaba deshabilitada y la única
                 forma de leer esos mensajes era entrar desde Pacientes. */
              onClick={() => onAbrir({
                clave: c.clave,
                id: c.patientId,
                nombre: c.nombre,
                numero: c.numero,
                candidatos: c.candidatos,
              })}
              className="flex-1 min-w-0 text-left flex items-start gap-3 px-3 py-2.5"
            >
              <PersonAvatar firstName={nom || '?'} lastName={resto.join(' ')} size={8} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-text-1">{comoSeLlama(c)}</span>
                  {/* El punto, y no un número: lo que importa es que espera, no cuántas veces escribió. */}
                  {c.ultimo.sinLeer && <span className="w-1.5 h-1.5 rounded-full bg-rose" />}
                  <span className="text-[10px] text-text-muted">{hace(c.ultimo.createdAt)}</span>
                  {c.total > 1 && <span className="text-[10px] text-text-muted">· {t('msgCount', { n: c.total })}</span>}
                </div>
                <p className="text-[12px] text-text-2 truncate mt-0.5">{c.ultimo.body}</p>
                {!c.patientId && (
                  <p className="text-[10px] text-amber mt-0.5">
                    {c.candidatos.length > 0
                      ? t('actionableAmbiguous', { n: c.candidatos.length })
                      : t('actionableNoPatient')}
                  </p>
                )}
              </div>
            </button>

            {/* Siempre visible, no al pasar el mouse. Medido el 2026-10-03: 7 de
                11 entrantes tienen 15 caracteres o menos, así que descartar no
                es la acción rara que se esconde detrás de un hover — es la que
                más se va a usar. Va FUERA del botón de arriba porque un botón
                no puede anidar otro. */}
            <button
              type="button"
              onClick={() => void marcar(c, false)}
              disabled={ocupada}
              title={t('resolveTitle')}
              aria-label={t('resolveTitle')}
              className="shrink-0 self-center mr-2 w-8 h-8 rounded-md inline-flex items-center justify-center text-text-muted hover:text-brand-text hover:bg-brand/10 disabled:opacity-50 transition-colors"
            >
              {ocupada ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

'use client';

/**
 * La pestaña *Actionable*: las conversaciones que esperan respuesta.
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
import { Inbox, RefreshCw } from 'lucide-react';
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
}

export function ConversacionesPendientes({
  onAbrir, recargar,
}: {
  /** Abre el hilo. `null` en `patientId` significa que no se pudo reconocer. */
  onAbrir: (p: PacienteDelHilo) => void;
  /** Cambia para forzar una recarga desde afuera (al responder, por ejemplo). */
  recargar?: number;
}) {
  const t      = useTranslations('phoenix.sms');
  const locale = useLocale();

  const [filas, setFilas]     = useState<Conversacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]     = useState(false);

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

  /** "hace 2 h" dice mejor que una hora exacta cuánto lleva esperando alguien. */
  const hace = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1)  return t('justNow');
    if (min < 60) return t('agoMin', { n: min });
    const h = Math.round(min / 60);
    if (h < 24)   return t('agoHour', { n: h });
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: CLINIC_TZ });
  };

  if (cargando && filas.length === 0) {
    return <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-center justify-between gap-3 flex-wrap">
        <span>{t('loadError')}</span>
        <button type="button" onClick={() => void cargar()} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
          <RefreshCw className="w-3 h-3" />{t('retry')}
        </button>
      </div>
    );
  }

  /* Vacío es el estado BUENO acá: no hay nadie esperando. El texto lo dice así
     en vez de "no se encontraron resultados", que suena a que algo falló. */
  if (filas.length === 0) {
    return <EmptyState.Rich icon={Inbox} title={t('actionableEmptyTitle')} subtitle={t('actionableEmptyHint')} />;
  }

  return (
    <div className="rounded-lg overflow-hidden">
      {filas.map((c) => {
        const [nom, ...resto] = (c.nombre ?? '').split(' ');
        return (
          <button
            key={c.clave}
            type="button"
            onClick={() => onAbrir({
              id: c.patientId ?? '',
              firstName: nom || c.numero,
              lastName: resto.join(' '),
              phone: c.numero,
            })}
            disabled={!c.patientId}
            title={c.patientId ? undefined : t('actionableUnknown')}
            className="w-full text-left flex items-start gap-3 px-3 py-2.5 border-b border-row-sep last:border-0 hover:bg-white/[0.02] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PersonAvatar firstName={nom || '?'} lastName={resto.join(' ')} size={8} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-text-1">
                  {c.nombre ?? formatUsPhone(c.numero)}
                </span>
                {/* El punto, y no un número: lo que importa es que espera, no cuántas veces escribió. */}
                {c.ultimo.sinLeer && <span className="w-1.5 h-1.5 rounded-full bg-rose" />}
                <span className="text-[10px] text-text-muted">{hace(c.ultimo.createdAt)}</span>
                {c.total > 1 && <span className="text-[10px] text-text-muted">· {t('msgCount', { n: c.total })}</span>}
              </div>
              <p className="text-[12px] text-text-2 truncate mt-0.5">{c.ultimo.body}</p>
              {!c.patientId && (
                <p className="text-[10px] text-amber mt-0.5">{t('actionableUnknown')}</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

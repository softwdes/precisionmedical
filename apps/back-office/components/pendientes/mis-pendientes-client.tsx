'use client';

/**
 * "Mis pendientes de corrección" — lo que la persona creó y hoy conviene arreglar,
 * y lo que ya corrigió.
 *
 * Todo sale de `/api/pendientes/mios`, que devuelve SOLO lo de quien pregunta.
 * Acá no se calcula nada: se muestra, con el porqué y un botón que lleva al
 * sitio donde se corrige. El tono importa: son "pendientes", no "errores", y la
 * pestaña "Corregidos" existe para que se vea el avance y no solo lo que falta.
 *
 * Plan: docs/plan-mis-pendientes.html.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, CheckCircle2, CopyX, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { cn } from '@precision/ui';
import { EmptyState, FilterPill, KpiCard, PageHeader, Skeleton } from '@/components/ui-phoenix';
import type { PendienteTipo, ResultadoPendientes } from '@/lib/pendientes';
import type { Corregido } from '@/lib/pendientes/corregidos';
import { ListaCorregidos, ListaPendientes } from './lista';

type Datos = ResultadoPendientes & { corregidos: Corregido[] };

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'listo'; data: Datos };

type Pestana = 'abiertos' | 'corregidos';
type Filtro = 'todos' | 'citas' | 'mensajes' | 'cierre';

const REFRESCO_MS = 90_000;
const DIAS_HISTORIAL = 90;

const FILTRO_DE: Record<Filtro, (t: PendienteTipo) => boolean> = {
  todos: () => true,
  citas: (t) => t === 'CITA_DUPLICADA',
  mensajes: (t) => t === 'SMS_FALLIDO' || t === 'CORREO_FALLIDO' || t === 'MENSAJE_DUPLICADO',
  cierre: (t) => t === 'CITA_SIN_CERRAR' || t === 'CITA_SIN_PROVIDER',
};

export function MisPendientesClient(): React.ReactElement {
  const t = useTranslations('phoenix.pendientes');
  const pathname = usePathname();
  // El portal médico tiene sus propias pantallas bajo /doctor.
  const base = pathname.startsWith('/doctor') ? '/doctor' : '';

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [pestana, setPestana] = useState<Pestana>('abiertos');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [refrescando, setRefrescando] = useState(false);
  const enCurso = useRef(false);

  const cargar = useCallback(async (enVivo = false) => {
    if (enCurso.current) return;
    enCurso.current = true;
    if (enVivo) setRefrescando(true);
    try {
      const res = await fetch('/api/pendientes/mios', { cache: 'no-store' });
      if (!res.ok) { if (!enVivo) setEstado({ tipo: 'error' }); return; }
      const body = (await res.json()) as Datos;
      setEstado({ tipo: 'listo', data: { ...body, corregidos: body.corregidos ?? [] } });
    } catch {
      // La recarga de fondo no borra lo que ya se ve: un corte de red no es un error de pantalla.
      if (!enVivo) setEstado({ tipo: 'error' });
    } finally {
      enCurso.current = false;
      if (enVivo) setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') void cargar(true); }, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  if (estado.tipo === 'cargando') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  if (estado.tipo === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <EmptyState.Rich
          icon={RefreshCw}
          title={t('errorTitle')}
          subtitle={t('errorSub')}
          action={
            <button
              type="button" onClick={() => { setEstado({ tipo: 'cargando' }); void cargar(); }}
              className="rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-medium text-white"
            >
              {t('retry')}
            </button>
          }
        />
      </div>
    );
  }

  const d = estado.data;
  const visibles = d.items.filter((i) => FILTRO_DE[filtro](i.tipo));
  const nMensajes = d.counts.SMS_FALLIDO + d.counts.CORREO_FALLIDO + d.counts.MENSAJE_DUPLICADO;
  const nCierre = d.counts.CITA_SIN_CERRAR + d.counts.CITA_SIN_PROVIDER;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={
          <button
            type="button" onClick={() => void cargar(true)} disabled={refrescando}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-text-muted hover:text-text-1 hover:bg-bg-2 disabled:opacity-60"
            aria-label={t('refresh')}
          >
            {t('refresh')}
            <RefreshCw className={cn('w-3 h-3', refrescando && 'motion-safe:animate-spin')} />
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiOpen')} value={d.counts.total}
          color={d.counts.total === 0 ? 'text-emerald' : 'text-text-1'}
          icon={CheckCircle2} iconBg={d.counts.total === 0 ? 'bg-emerald/10' : 'bg-bg-2'}
          iconColor={d.counts.total === 0 ? 'text-emerald' : 'text-text-muted'}
        />
        <KpiCard label={t('kpiDup')} value={d.counts.CITA_DUPLICADA} icon={CopyX} iconBg="bg-amber/10" iconColor="text-amber" />
        <KpiCard label={t('kpiMsg')} value={nMensajes} icon={MessageSquareWarning} iconBg="bg-rose/10" iconColor="text-rose" />
        <KpiCard label={t('kpiCierre')} value={nCierre} icon={CalendarClock} iconBg="bg-cyan/10" iconColor="text-cyan" />
      </div>

      {/* Las dos pestañas: lo que falta y lo que ya se arregló. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2" role="tablist">
        <FilterPill active={pestana === 'abiertos'} onClick={() => setPestana('abiertos')} label={t('tabOpen')} count={d.counts.total} />
        <FilterPill active={pestana === 'corregidos'} onClick={() => setPestana('corregidos')} label={t('tabDone')} count={d.corregidos.length} />
      </div>

      {pestana === 'abiertos' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill active={filtro === 'todos'} onClick={() => setFiltro('todos')} label={t('filterAll')} count={d.counts.total} />
            <FilterPill active={filtro === 'citas'} onClick={() => setFiltro('citas')} label={t('filterDup')} count={d.counts.CITA_DUPLICADA} />
            <FilterPill active={filtro === 'mensajes'} onClick={() => setFiltro('mensajes')} label={t('filterMsg')} count={nMensajes} />
            <FilterPill active={filtro === 'cierre'} onClick={() => setFiltro('cierre')} label={t('filterCierre')} count={nCierre} />
          </div>

          {visibles.length === 0 ? (
            <EmptyState.Rich
              icon={CheckCircle2}
              title={d.counts.total === 0 ? t('emptyTitle') : t('emptyFilterTitle')}
              subtitle={d.counts.total === 0 ? t('emptySub') : undefined}
            />
          ) : (
            <ListaPendientes items={visibles} base={base} />
          )}

          <p className="text-[11px] text-text-muted">
            {t('footer')}
            {d.ocultas > 0 && ` ${t('hiddenTests', { n: d.ocultas })}`}
          </p>
        </>
      ) : (
        <>
          {d.corregidos.length === 0 ? (
            <EmptyState.Rich icon={CheckCircle2} title={t('doneEmptyTitle')} subtitle={t('doneEmptySub')} />
          ) : (
            <ListaCorregidos items={d.corregidos} base={base} vista="propia" />
          )}
          <p className="text-[11px] text-text-muted">{t('doneNote', { dias: DIAS_HISTORIAL })}</p>
        </>
      )}
    </div>
  );
}

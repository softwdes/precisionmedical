'use client';

/**
 * "Mis pendientes de corrección" — lo que la persona creó y hoy conviene arreglar.
 *
 * Todo sale de `/api/pendientes/mios`, que devuelve SOLO lo de quien pregunta.
 * Acá no se calcula nada: se muestra, con el porqué y un botón que lleva al
 * sitio donde se corrige. El tono importa: son "pendientes", no "errores".
 *
 * Plan: docs/plan-mis-pendientes.html (Fase 1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, CheckCircle2, CopyX, MailWarning, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { cn } from '@precision/ui';
import { EmptyState, FilterPill, KpiCard, PageHeader, Skeleton, TagPill } from '@/components/ui-phoenix';
import { fechaCorta, hora } from '@/lib/fechas';
import type { Pendiente, PendienteTipo, ResultadoPendientes } from '@/lib/pendientes';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'listo'; data: ResultadoPendientes };

type Filtro = 'todos' | 'citas' | 'mensajes' | 'cierre';

const REFRESCO_MS = 90_000;

const COLOR_TIPO: Record<PendienteTipo, string> = {
  CITA_DUPLICADA: 'bg-amber/15 text-amber border-amber/30',
  SMS_FALLIDO: 'bg-rose/15 text-rose border-rose/30',
  CORREO_FALLIDO: 'bg-rose/15 text-rose border-rose/30',
  CITA_SIN_CERRAR: 'bg-cyan/15 text-cyan border-cyan/30',
};

const ICONO_TIPO: Record<PendienteTipo, React.ElementType> = {
  CITA_DUPLICADA: CopyX,
  SMS_FALLIDO: MessageSquareWarning,
  CORREO_FALLIDO: MailWarning,
  CITA_SIN_CERRAR: CalendarClock,
};

const FILTRO_DE: Record<Filtro, (t: PendienteTipo) => boolean> = {
  todos: () => true,
  citas: (t) => t === 'CITA_DUPLICADA',
  mensajes: (t) => t === 'SMS_FALLIDO' || t === 'CORREO_FALLIDO',
  cierre: (t) => t === 'CITA_SIN_CERRAR',
};

export function MisPendientesClient(): React.ReactElement {
  const t = useTranslations('phoenix.pendientes');
  const locale = useLocale();
  const pathname = usePathname();
  // El portal médico tiene sus propias pantallas bajo /doctor.
  const base = pathname.startsWith('/doctor') ? '/doctor' : '';

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
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
      setEstado({ tipo: 'listo', data: (await res.json()) as ResultadoPendientes });
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

  /** A dónde lleva "corregir". El calendario abre el caso con la cita filtrada. */
  const destino = (p: Pendiente): string => {
    if (p.tipo === 'CITA_DUPLICADA' || p.tipo === 'CITA_SIN_CERRAR') {
      if (base === '' && p.caseId) {
        const q = new URLSearchParams({ case: p.caseId });
        if (p.appointmentId) q.set('visit', p.appointmentId);
        return `/calendar?${q.toString()}`;
      }
    }
    return p.patientId ? `${base}/patients/${p.patientId}` : `${base || ''}/`;
  };

  const esCita = (tipo: PendienteTipo) => tipo === 'CITA_DUPLICADA' || tipo === 'CITA_SIN_CERRAR';

  const textoMotivo = (p: Pendiente): string => {
    if (p.motivo === 'MISMA_HORA') {
      return p.otraCreadaPor
        ? t('motivo.MISMA_HORA_POR', { otra: p.otraCreadaPor })
        : t('motivo.MISMA_HORA');
    }
    if (p.motivo === 'PASADA_SIN_ESTADO') {
      return t('motivo.PASADA_SIN_ESTADO', { estado: p.estado ? t(`estadoCita.${p.estado}`) : '—' });
    }
    return t(`motivo.${p.motivo}`);
  };

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
  const nMensajes = d.counts.SMS_FALLIDO + d.counts.CORREO_FALLIDO;

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
        <KpiCard label={t('kpiCierre')} value={d.counts.CITA_SIN_CERRAR} icon={CalendarClock} iconBg="bg-cyan/10" iconColor="text-cyan" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={filtro === 'todos'} onClick={() => setFiltro('todos')} label={t('filterAll')} count={d.counts.total} />
        <FilterPill active={filtro === 'citas'} onClick={() => setFiltro('citas')} label={t('filterDup')} count={d.counts.CITA_DUPLICADA} />
        <FilterPill active={filtro === 'mensajes'} onClick={() => setFiltro('mensajes')} label={t('filterMsg')} count={nMensajes} />
        <FilterPill active={filtro === 'cierre'} onClick={() => setFiltro('cierre')} label={t('filterCierre')} count={d.counts.CITA_SIN_CERRAR} />
      </div>

      {visibles.length === 0 ? (
        <EmptyState.Rich
          icon={CheckCircle2}
          title={d.counts.total === 0 ? t('emptyTitle') : t('emptyFilterTitle')}
          subtitle={d.counts.total === 0 ? t('emptySub') : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((p) => {
            const Icono = ICONO_TIPO[p.tipo];
            return (
              <li key={p.id} className="rounded-lg bg-bg-1 p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1 basis-72">
                  <Icono className="w-4 h-4 mt-0.5 shrink-0 text-text-muted" aria-hidden />
                  <div className="min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TagPill compact label={t(`tipo.${p.tipo}`)} colorClass={COLOR_TIPO[p.tipo]} />
                      <span className="text-sm font-semibold text-text-1">{p.paciente}</span>
                      <span className="text-[11px] text-text-muted tabular-nums">
                        {fechaCorta(p.cuando, locale as 'es' | 'en')} · {hora(p.cuando, locale as 'es' | 'en')}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-text-2">{textoMotivo(p)}</p>
                  </div>
                </div>
                <Link
                  href={destino(p)}
                  className="shrink-0 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  {esCita(p.tipo) ? t('openAppt') : t('openPatient')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-text-muted">
        {t('footer')}
        {d.ocultas > 0 && ` ${t('hiddenTests', { n: d.ocultas })}`}
      </p>
    </div>
  );
}

'use client';

/**
 * Incidencias del equipo — la vista del ADMINISTRADOR.
 *
 * Un resumen con una fila por persona (por corregir / ya corregido) y, al tocar
 * una fila, el detalle con las mismas dos pestañas que ve esa persona en "Mis
 * pendientes", en solo lectura. Datos de `/api/admin/pendientes-equipo`.
 *
 * Sin ranking: la tabla va por nombre, porque los números dependen de cuánto
 * trabajo tiene cada persona. Sirve para ver dónde capacitar y qué reglas faltan.
 *
 * El detalle vive en el estado y no en `?usuario=` a propósito: `useSearchParams`
 * obliga a una frontera de Suspense para que la página compile.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, RefreshCw, Search, Users } from 'lucide-react';
import { EmptyState, FilterPill, KpiCard, PageHeader, Skeleton } from '@/components/ui-phoenix';
import type { PendienteTipo, ResultadoPendientes } from '@/lib/pendientes';
import type { Corregido } from '@/lib/pendientes/corregidos';
import type { ResumenEquipo } from '@/lib/pendientes/equipo';
import { ListaCorregidos, ListaPendientes } from './lista';

type Detalle = ResultadoPendientes & {
  usuario: { id: string; nombre: string; rol: string };
  corregidos: Corregido[];
};

type Estado<T> = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'listo'; data: T };

const CLAVE_NOMBRES = 'pm-incidencias-nombres';

function leerNombres(): boolean {
  try { return localStorage.getItem(CLAVE_NOMBRES) !== '0'; } catch { return true; }
}

function horasATexto(h: number | null, t: ReturnType<typeof useTranslations<'phoenix.incidencias'>>): string {
  if (h === null) return '—';
  if (h < 1) return t('menosHora');
  if (h < 48) return t('horas', { n: Math.round(h) });
  return t('dias', { n: Math.round(h / 24) });
}

export function IncidenciasEquipoClient(): React.ReactElement {
  const t = useTranslations('phoenix.incidencias');
  const tp = useTranslations('phoenix.pendientes');

  const [resumen, setResumen] = useState<Estado<ResumenEquipo>>({ tipo: 'cargando' });
  const [detalle, setDetalle] = useState<Estado<Detalle> | null>(null);
  const [pestana, setPestana] = useState<'abiertos' | 'corregidos'>('abiertos');
  const [conNombres, setConNombres] = useState(true);
  const [q, setQ] = useState('');
  /** El número de orden con el que se nombra a cada persona en la vista anónima. */
  const [orden, setOrden] = useState<Record<string, number>>({});

  useEffect(() => { setConNombres(leerNombres()); }, []);

  const cargar = useCallback(async () => {
    setResumen({ tipo: 'cargando' });
    try {
      const res = await fetch('/api/admin/pendientes-equipo', { cache: 'no-store' });
      if (!res.ok) { setResumen({ tipo: 'error' }); return; }
      const data = (await res.json()) as ResumenEquipo;
      setResumen({ tipo: 'listo', data });
      setOrden(Object.fromEntries(data.filas.map((f, i) => [f.userId, i + 1])));
    } catch {
      setResumen({ tipo: 'error' });
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = async (userId: string) => {
    setPestana('abiertos');
    setDetalle({ tipo: 'cargando' });
    try {
      const res = await fetch(`/api/admin/pendientes-equipo?usuario=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      if (!res.ok) { setDetalle({ tipo: 'error' }); return; }
      setDetalle({ tipo: 'listo', data: (await res.json()) as Detalle });
    } catch {
      setDetalle({ tipo: 'error' });
    }
  };

  const alternarNombres = () => {
    const nuevo = !conNombres;
    setConNombres(nuevo);
    try { localStorage.setItem(CLAVE_NOMBRES, nuevo ? '1' : '0'); } catch { /* sin almacenamiento: queda en memoria */ }
  };

  const nombreDe = (userId: string, nombre: string): string =>
    conNombres ? nombre : t('persona', { n: orden[userId] ?? 0 });

  const botonNombres = (
    <button
      type="button" onClick={alternarNombres}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] text-text-2 hover:text-text-1 hover:bg-bg-2"
      aria-pressed={conNombres}
    >
      {conNombres ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {conNombres ? t('namesOn') : t('namesOff')}
    </button>
  );

  // ── Detalle de una persona ────────────────────────────────────────────────
  if (detalle) {
    const volver = (
      <button
        type="button" onClick={() => setDetalle(null)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted hover:text-text-1 hover:bg-bg-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t('back')}
      </button>
    );

    if (detalle.tipo === 'cargando') {
      return (
        <div className="flex flex-col gap-5">
          {volver}
          <Skeleton className="h-10 w-64" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      );
    }
    if (detalle.tipo === 'error') {
      return (
        <div className="flex flex-col gap-5">
          {volver}
          <EmptyState.Rich icon={RefreshCw} title={t('errorTitle')} subtitle={t('errorSub')} />
        </div>
      );
    }

    const d = detalle.data;
    return (
      <div className="flex flex-col gap-5">
        {volver}
        <PageHeader
          title={nombreDe(d.usuario.id, d.usuario.nombre)}
          subtitle={t('detailSubtitle', { rol: t(`rol.${d.usuario.rol}`) })}
          action={botonNombres}
        />
        <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">{t('readOnly')}</div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label={tp('tabOpen')} value={d.counts.total} color={d.counts.total === 0 ? 'text-emerald' : 'text-text-1'} />
          <KpiCard label={tp('tabDone')} value={d.corregidos.length} color="text-emerald" />
          <KpiCard label={tp('kpiDup')} value={d.counts.CITA_DUPLICADA} />
          <KpiCard label={tp('kpiCierre')} value={d.counts.CITA_SIN_CERRAR + d.counts.CITA_SIN_PROVIDER} />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2" role="tablist">
          <FilterPill active={pestana === 'abiertos'} onClick={() => setPestana('abiertos')} label={tp('tabOpen')} count={d.counts.total} />
          <FilterPill active={pestana === 'corregidos'} onClick={() => setPestana('corregidos')} label={tp('tabDone')} count={d.corregidos.length} />
        </div>

        {pestana === 'abiertos'
          ? (d.items.length === 0
            ? <EmptyState.Rich icon={CheckCircle2} title={t('noOpen')} />
            : <ListaPendientes items={d.items} base="" />)
          : (d.corregidos.length === 0
            ? <EmptyState.Rich icon={CheckCircle2} title={tp('doneEmptyTitle')} />
            : <ListaCorregidos items={d.corregidos} base="" vista="admin" />)}

        {d.ocultas > 0 && <p className="text-[11px] text-text-muted">{tp('hiddenTests', { n: d.ocultas })}</p>}
      </div>
    );
  }

  // ── Resumen del equipo ────────────────────────────────────────────────────
  const cabecera = <PageHeader title={t('title')} subtitle={t('subtitle')} action={botonNombres} />;

  if (resumen.tipo === 'cargando') {
    return (
      <div className="flex flex-col gap-5">
        {cabecera}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }
  if (resumen.tipo === 'error') {
    return (
      <div className="flex flex-col gap-5">
        {cabecera}
        <EmptyState.Rich
          icon={RefreshCw} title={t('errorTitle')} subtitle={t('errorSub')}
          action={
            <button type="button" onClick={() => void cargar()} className="rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-medium text-white">
              {tp('retry')}
            </button>
          }
        />
      </div>
    );
  }

  const r = resumen.data;
  const filtro = q.trim().toLowerCase();
  const filas = r.filas.filter((f) => !filtro || (conNombres && f.nombre.toLowerCase().includes(filtro)));

  return (
    <div className="flex flex-col gap-5">
      {cabecera}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={t('kpiActivos')} value={r.totales.activos} icon={Users} />
        <KpiCard
          label={t('kpiResueltos', { dias: r.dias })} value={r.totales.resueltos}
          color="text-emerald" icon={CheckCircle2} iconBg="bg-emerald/10" iconColor="text-emerald"
        />
        <KpiCard label={t('kpiConPendientes')} value={`${r.totales.conPendientes} / ${r.totales.personas}`} />
        <KpiCard label={t('kpiTipico')} value={horasATexto(r.totales.horasTipico, t)} />
      </div>

      {conNombres && (
        <label className="relative max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')}
            className="w-full rounded-md border border-border bg-bg-1 py-1.5 pl-8 pr-3 text-sm text-text-1 placeholder:text-text-muted"
          />
        </label>
      )}

      {filas.length === 0 ? (
        <EmptyState.Rich icon={CheckCircle2} title={t('empty')} />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-bg-1">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                <th className="px-4 py-3">{t('colPersona')}</th>
                <th className="px-3 py-3 text-right">{t('colActivos')}</th>
                <th className="px-3 py-3 text-right">{t('colResueltos', { dias: r.dias })}</th>
                <th className="px-3 py-3">{t('colAvance')}</th>
                <th className="px-3 py-3">{t('colTiempo')}</th>
                <th className="px-4 py-3">{t('colFrecuente')}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const total = f.activos.total + f.resueltos;
                const pct = total === 0 ? 100 : Math.round((f.resueltos / total) * 100);
                return (
                  <tr
                    key={f.userId} onClick={() => void abrir(f.userId)}
                    className="border-b border-row-sep last:border-0 cursor-pointer hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); void abrir(f.userId); }}>
                        <span className="block font-semibold text-text-1">{nombreDe(f.userId, f.nombre)}</span>
                        <span className="block text-[10px] uppercase tracking-wider text-text-muted">{t(`rol.${f.rol}`)}</span>
                      </button>
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${f.activos.total === 0 ? 'text-emerald' : 'text-text-1'}`}>
                      {f.activos.total}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-text-2">{f.resueltos}</td>
                    <td className="px-3 py-3">
                      <div className="h-1.5 w-24 rounded-full bg-bg-2 overflow-hidden" aria-label={`${pct}%`}>
                        <div className="h-full rounded-full bg-emerald" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text-2 tabular-nums">{horasATexto(f.horasTipico, t)}</td>
                    <td className="px-4 py-3 text-text-2">{f.masFrecuente ? tp(`tipo.${f.masFrecuente satisfies PendienteTipo}`) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-text-muted">{t('footer')}</p>
    </div>
  );
}

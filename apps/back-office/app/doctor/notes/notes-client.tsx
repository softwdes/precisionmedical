'use client';

/**
 * Supervisión de notas · pantalla.
 *
 * UNA sola lista: los providers. El detalle de cada uno vive en un modal
 * (`ProviderNotesDialog`), y adentro se abre la nota. No hay segunda tabla —
 * ver la nota de `notes-data.tsx`.
 *
 * Reparto de filtros: la clínica y el rango de fechas viajan en la URL porque
 * cambian los AGREGADOS y los recalcula el server; el estado y la búsqueda
 * filtran en el cliente, sobre once filas que ya están en memoria.
 */

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Clock3, Search } from 'lucide-react';
import {
  PageHeader, DataTable, EmptyState, PersonAvatar, FilterPill, KpiCard,
} from '@/components/ui-phoenix';
import { useTransitionProgress } from '@/components/layout/navigation-progress';
import type { NotesSummary, ProviderNotesRow } from '@/lib/notes-summary';
import type { EstadoNota } from '@/lib/notes-audit';
import { ProviderNotesDialog } from './provider-notes-dialog';

/** Las tres categorías que Erick nombra: hechas · sin cerrar · sin iniciar. */
const CATEGORIAS = ['none', 'draft', 'signed'] as const;
type Categoria = typeof CATEGORIAS[number];

/**
 * El color dice la GRAVEDAD, no el tipo: rose para la visita sin ninguna nota
 * —el peor caso—, amber para la abierta, emerald para la cerrada.
 */
const COLOR: Record<Categoria, string> = {
  none: 'text-rose', draft: 'text-amber', signed: 'text-text-2',
};

/** Cuánto debe un provider en una categoría. */
const CUANTAS = (p: ProviderNotesRow, c: Categoria): number =>
  c === 'none' ? p.sinNota : c === 'draft' ? p.borradores : p.firmadas;

/**
 * El umbral del "% en 24 h", uno solo para el KPI y la tabla. Sin nada firmado
 * no hay porcentaje: va neutro, porque un 0% diría que las cerró todas tarde.
 */
function pctColor(pct: number | null): string {
  if (pct === null) return 'text-text-muted';
  if (pct >= 80) return 'text-emerald';
  if (pct >= 60) return 'text-amber';
  return 'text-rose';
}

export function NotesClient({
  resumen, clinics,
}: {
  resumen: NotesSummary;
  clinics: Array<{ id: string; name: string }>;
}): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startNav] = React.useTransition();
  useTransitionProgress(pendiente); // Regla #1

  const setParam = React.useCallback((k: string, v: string | null): void => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    const qs = next.toString();
    startNav(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }, [sp, pathname, router]);

  /** Categorías activas — filtran QUÉ PROVIDERS se listan. */
  const [cats, setCats] = React.useState<Set<Categoria>>(new Set(CATEGORIAS));
  const [q, setQ] = React.useState('');

  /**
   * El provider abierto, y con qué categoría entró.
   *
   * Tocar la FILA abre las tres; tocar un NÚMERO abre solo esa — es el camino
   * corto entre "debe 18" y "cuáles son esas 18".
   */
  const [abierto, setAbierto] = React.useState<{ p: ProviderNotesRow; cat: Categoria | null } | null>(null);

  const visibles = React.useMemo(() => {
    const texto = q.trim().toLowerCase();
    return resumen.providers.filter((p) => {
      // Se muestra si tiene algo en alguna de las categorías pedidas. Con las
      // tres activas (el default) esto no descarta a nadie.
      const enCategoria = [...cats].some((c) => CUANTAS(p, c) > 0);
      const enTexto = !texto || p.providerName.toLowerCase().includes(texto);
      return enCategoria && enTexto;
    });
  }, [resumen.providers, cats, q]);

  const toggle = (c: Categoria): void => {
    const next = new Set(cats);
    if (next.has(c)) next.delete(c); else next.add(c);
    // Sin ninguna la lista quedaría vacía y parecería rota: se vuelve al default.
    setCats(next.size ? next : new Set(CATEGORIAS));
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title={t('title')} subtitle={t('subtitleProviders')} />

      {/* Los cuatro KPIs, sobre el alcance elegido (clínica + rango). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard compact label={t('kpiPending')} value={resumen.totales.pendientes}
          color="text-amber" icon={Clock3} iconBg="bg-amber/10" iconColor="text-amber" />
        <KpiCard compact label={t('kpiNoNote')} value={resumen.totales.sinNota}
          color="text-rose" icon={AlertTriangle} iconBg="bg-rose/10" iconColor="text-rose" />
        <KpiCard compact label={t('kpiOldest')} value={t('days', { count: resumen.totales.masVieja })}
          color={resumen.totales.masVieja > 30 ? 'text-rose' : 'text-text-1'}
          icon={CalendarDays} iconBg="bg-violet/10" iconColor="text-violet-text" />
        <KpiCard compact label={t('kpiWithin24')}
          value={resumen.totales.pctDentro24h === null ? '—' : `${resumen.totales.pctDentro24h}%`}
          color={pctColor(resumen.totales.pctDentro24h)}
          icon={CheckCircle2} iconBg="bg-cyan/10" iconColor="text-cyan" />
      </div>

      <DataTable.Card>
        {/* Los filtros van ADENTRO de la tarjeta de la lista y arriba de ella:
            sueltos entre dos tablas se leían como del bloque de arriba. */}
        <div className="px-4 py-3 border-b border-border flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-1 font-semibold text-[12.5px] uppercase tracking-wider">
              {t('providersTitle')}
            </span>
            <span className="text-[11px] text-text-muted">{t('providersHint')}</span>
          </div>
          {/* `flex-wrap` obligatorio: son seis controles (Regla #4). */}
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIAS.map((c) => (
              <FilterPill key={c} label={t(`estado_${c as EstadoNota}`)}
                active={cats.has(c)} onClick={() => toggle(c)} />
            ))}
            <span className="w-px h-6 bg-border mx-1 hidden sm:block" />
            <select
              value={sp.get('clinica') ?? ''}
              onChange={(e) => setParam('clinica', e.target.value || null)}
              aria-label={t('filterClinic')}
              className="h-9 rounded-md border border-border bg-bg-2 px-2.5 text-xs font-medium text-text-1"
            >
              <option value="">{t('allClinics')}</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={sp.get('desde') ?? ''} aria-label={t('from')}
              onChange={(e) => setParam('desde', e.target.value || null)}
              className="h-9 rounded-md border border-border bg-bg-2 px-2.5 text-xs font-medium text-text-1" />
            <input type="date" value={sp.get('hasta') ?? ''} aria-label={t('to')}
              onChange={(e) => setParam('hasta', e.target.value || null)}
              className="h-9 rounded-md border border-border bg-bg-2 px-2.5 text-xs font-medium text-text-1" />
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t('searchProvider')} aria-label={t('searchProvider')}
                className="h-9 w-[180px] rounded-md border border-border bg-bg-2 pl-8 pr-2.5 text-xs font-medium text-text-1 placeholder:text-text-muted" />
            </div>
          </div>
        </div>

        <DataTable.Scroll>
          <DataTable.Table className="min-w-[760px]">
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('colProvider')}</DataTable.Th>
              <DataTable.Th align="right">{t('estado_none')}</DataTable.Th>
              <DataTable.Th align="right">{t('estado_draft')}</DataTable.Th>
              <DataTable.Th align="right">{t('estado_signed')}</DataTable.Th>
              <DataTable.Th align="right">{t('colWithin24')}</DataTable.Th>
              <DataTable.Th align="right">{t('colOldest')}</DataTable.Th>
              <DataTable.Th align="right" sticky="right"> </DataTable.Th>
            </DataTable.Head>
            <tbody>
              {visibles.length === 0 ? (
                <tr><td colSpan={7}><EmptyState.Inline message={t('emptyProviders')} /></td></tr>
              ) : visibles.map((p) => (
                <DataTable.Row key={p.providerId} onClick={() => setAbierto({ p, cat: null })}>
                  <DataTable.Td sticky="left">
                    <div className="flex items-center gap-2 min-w-0">
                      <PersonAvatar firstName={p.providerName} lastName="" size={6} />
                      <span className="font-semibold truncate">{p.providerName}</span>
                    </div>
                  </DataTable.Td>
                  {CATEGORIAS.map((c) => (
                    <DataTable.Td key={c} align="right">
                      <Cifra
                        n={CUANTAS(p, c)}
                        color={COLOR[c]}
                        titulo={t('openCategory', { name: p.providerName, cat: t(`estado_${c as EstadoNota}`) })}
                        onClick={() => setAbierto({ p, cat: c })}
                      />
                    </DataTable.Td>
                  ))}
                  <DataTable.Td align="right">
                    <span className={`tabular-nums font-semibold ${pctColor(pct(p))}`}>
                      {pct(p) === null ? '—' : `${pct(p)}%`}
                    </span>
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <span className={`tabular-nums ${p.masVieja > 30 ? 'text-rose font-semibold' : 'text-text-2'}`}>
                      {p.masVieja > 0 ? t('days', { count: p.masVieja }) : '—'}
                    </span>
                  </DataTable.Td>
                  <DataTable.Td align="right" sticky="right">
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted inline-block" />
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
      </DataTable.Card>

      <p className="text-[11px] text-text-muted max-w-2xl">{t('phiNote')}</p>

      {abierto && (
        <ProviderNotesDialog
          provider={abierto.p}
          categoriaInicial={abierto.cat}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}

const pct = (p: ProviderNotesRow): number | null =>
  p.firmadas > 0 ? Math.round((p.dentro24h / p.firmadas) * 100) : null;

/**
 * Un número que además es el filtro: abre el modal del provider viendo SOLO esa
 * categoría. Lleva borde en hover porque un número que se puede tocar tiene que
 * verse tocable — si no, nadie lo descubre.
 *
 * En cero no es un botón: no hay nada que mirar y ofrecerlo sería un clic que
 * lleva a una lista vacía.
 */
function Cifra({ n, color, titulo, onClick }: {
  n: number; color: string; titulo: string; onClick: () => void;
}): React.ReactElement {
  if (n === 0) return <span className="tabular-nums text-text-muted px-[7px]">0</span>;
  return (
    <button
      type="button"
      title={titulo}
      onClick={(ev) => { ev.stopPropagation(); onClick(); }}
      className={`tabular-nums font-bold px-[7px] py-0.5 rounded-md border border-transparent hover:border-current hover:bg-white/5 transition-colors ${color}`}
    >
      {n}
    </button>
  );
}

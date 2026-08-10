'use client';

/**
 * CaseSelect — elegir a qué CASO del paciente pertenece el mensaje (M1 F5).
 *
 * Todo mensaje con paciente va anclado a un caso: es lo que se está
 * consultando. Por defecto el caso VIVO (ver `pickDefaultCase`), pero a veces
 * la consulta es sobre uno anterior — por eso los terminados siguen siendo
 * elegibles, agrupados abajo y atenuados, para que elegirlos sea deliberado.
 *
 * Mismas mecánicas de portal que UserSelect: dropdown en document.body con
 * pointerEvents:'auto' y rueda por listener nativo (trampas de Radix Dialog).
 * El buscador aparece solo con más de 6 casos — la mayoría tiene 1 o 2 y un
 * campo de texto ahí sería ruido.
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search as SearchIcon, Car, Stethoscope } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';
import { usePortalWheelScroll } from './use-portal-wheel';

export interface MessagingCase {
  id: string;
  caseCode: string;
  caseType: string | null;
  status: string;
  accidentDate: string | null;
  /** Última cita del caso — desempata entre varios casos vivos */
  lastAppointmentAt?: string | null;
}

/**
 * Estados de un caso VIVO según la definición de Erick (2026-08-08): todavía
 * no se cerró, sigue recibiendo citas hasta que se paguen los servicios
 * (directo o vía aseguradora/abogado). Los demás — CLOSED, SETTLED, ARCHIVED,
 * CANCELLED — ya terminaron y nunca se preseleccionan.
 *
 * El orden del array ES la prioridad para el default: primero el que está más
 * adentro del tratamiento. MMI va último entre los vivos porque ahí el
 * tratamiento prácticamente terminó, aunque el caso siga abierto.
 */
export const OPEN_CASE_STATUSES = [
  'ACTIVE',
  'CONFIRMED',
  'INTAKE_COMPLETED',
  'INTAKE_PENDING',
  'NEW_REFERRAL',
  'MMI',
] as const;

export function isOpenCase(status: string): boolean {
  return (OPEN_CASE_STATUSES as readonly string[]).includes(status);
}

/**
 * Caso preseleccionado al abrir el compose: el vivo más avanzado; entre dos
 * igual de avanzados (dos accidentes), el que tuvo la última cita más reciente
 * — es el caso en el que están trabajando hoy. Sin citas, gana el más nuevo
 * (la lista ya viene ordenada por createdAt desc).
 *
 * Devuelve null si TODOS los casos están terminados: preseleccionar uno ya
 * cobrado sería peor que no elegir nada.
 */
export function pickDefaultCase(cases: MessagingCase[]): MessagingCase | null {
  const open = cases.filter((c) => isOpenCase(c.status));
  if (open.length === 0) return null;

  const rank = (c: MessagingCase) => OPEN_CASE_STATUSES.indexOf(c.status as (typeof OPEN_CASE_STATUSES)[number]);
  return open.reduce((best, c) => {
    const dr = rank(c) - rank(best);
    if (dr !== 0) return dr < 0 ? c : best;
    const ca = c.lastAppointmentAt ? new Date(c.lastAppointmentAt).getTime() : 0;
    const ba = best.lastAppointmentAt ? new Date(best.lastAppointmentAt).getTime() : 0;
    return ca > ba ? c : best;
  });
}

function statusClass(status: string): string {
  if (status === 'CANCELLED') return 'bg-rose/10 text-rose border-rose/20';
  if (status === 'ACTIVE') return 'bg-emerald/10 text-emerald border-emerald/20';
  return 'bg-brand/10 text-brand border-brand/20';
}

interface Props {
  cases: MessagingCase[];
  value: string | null;
  onChange: (caseId: string) => void;
  disabled?: boolean;
  loading?: boolean;
  labels: {
    placeholder: string;
    searchPlaceholder: string;
    pastCases: string;
    accidentPrefix: string;
    loading: string;
  };
  /** Formatea la fecha de accidente en el locale del usuario */
  formatDate: (iso: string) => string;
}

export function CaseSelect({ cases, value, onChange, disabled = false, loading = false, labels, formatDate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({ visibility: 'hidden', pointerEvents: 'none' });
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);
  usePortalWheelScroll(listRef, open);

  const selected = cases.find((c) => c.id === value) ?? null;
  const showSearch = cases.length > 6;

  const q = query.trim().toLowerCase();
  const match = (c: MessagingCase) =>
    q === '' || c.caseCode.toLowerCase().includes(q) ||
    (c.accidentDate ? formatDate(c.accidentDate).includes(q) : false);

  const openCases = cases.filter((c) => isOpenCase(c.status) && match(c));
  const pastCases = cases.filter((c) => !isOpenCase(c.status) && match(c));

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setDropStyle({ visibility: 'hidden', pointerEvents: 'none' });
      return;
    }
    const compute = () => {
      const rect = wrapRef.current!.getBoundingClientRect();
      setDropStyle({
        position: 'fixed', top: rect.bottom + 4, left: rect.left,
        width: Math.max(rect.width, 280), visibility: 'visible', pointerEvents: 'auto',
      });
    };
    compute();
    let scrollable: HTMLElement | null = wrapRef.current.parentElement;
    while (scrollable) {
      const oy = window.getComputedStyle(scrollable).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      scrollable = scrollable.parentElement;
    }
    scrollable?.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute, { passive: true });
    return () => {
      scrollable?.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [open, openCases.length, pastCases.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !dropRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open && showSearch) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open, showSearch]);

  const pick = (id: string): void => { onChange(id); setOpen(false); };

  const TypeIcon = ({ caseType }: { caseType: string | null }) =>
    caseType === 'MVA'
      ? <Car className="w-3 h-3 text-text-muted shrink-0" />
      : <Stethoscope className="w-3 h-3 text-text-muted shrink-0" />;

  const row = (c: MessagingCase, past: boolean) => (
    <button
      key={c.id} type="button" role="option" aria-selected={c.id === value}
      onMouseDown={(e) => { e.preventDefault(); pick(c.id); }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5 ${
        c.id === value ? 'bg-brand/[0.08]' : ''
      } ${past ? 'opacity-60' : ''}`}
    >
      <TypeIcon caseType={c.caseType} />
      <span className="text-[12.5px] font-mono text-text-1 shrink-0">{c.caseCode}</span>
      <span className="flex-1 min-w-0 text-[11px] text-text-muted truncate">
        {c.accidentDate ? `${labels.accidentPrefix} ${formatDate(c.accidentDate)}` : '—'}
      </span>
      <TagPill label={c.status} colorClass={statusClass(c.status)} />
    </button>
  );

  return (
    <div ref={wrapRef}>
      <button
        type="button" disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
        className={`w-full inline-flex items-center justify-between gap-2 bg-bg-2 border rounded-md px-3 py-2 text-sm outline-none transition-colors disabled:opacity-50 ${
          selected ? 'border-border text-text-1 focus:border-brand' : 'border-amber/40 text-text-muted'
        }`}
        aria-haspopup="listbox" aria-expanded={open}
      >
        {loading ? (
          <span className="text-text-muted">{labels.loading}</span>
        ) : selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <TypeIcon caseType={selected.caseType} />
            <span className="font-mono truncate">{selected.caseCode}</span>
            {selected.accidentDate && (
              <span className="text-[11px] text-text-muted truncate">
                {labels.accidentPrefix} {formatDate(selected.accidentDate)}
              </span>
            )}
            <TagPill label={selected.status} colorClass={statusClass(selected.status)} />
          </span>
        ) : (
          <span>{labels.placeholder}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
      </button>

      {mounted && open && createPortal(
        <div ref={dropRef} style={dropStyle}
          className="z-[9999] bg-bg-1 border border-border-strong rounded-md shadow-xl overflow-hidden">
          {showSearch && (
            <div className="relative border-b border-border/60">
              <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                ref={inputRef} value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = openCases[0] ?? pastCases[0];
                    if (first) pick(first.id);
                  }
                }}
                placeholder={labels.searchPlaceholder}
                className="w-full bg-transparent outline-none text-sm text-text-1 placeholder:text-text-muted/50 pl-8 pr-3 py-2"
              />
            </div>
          )}
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto">
            {openCases.map((c) => row(c, false))}
            {pastCases.length > 0 && (
              <div className="px-3 py-1 bg-bg-2/60 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {labels.pastCases}
              </div>
            )}
            {pastCases.map((c) => row(c, true))}
            {openCases.length === 0 && pastCases.length === 0 && (
              <div className="px-3 py-3 text-text-muted text-xs text-center">—</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

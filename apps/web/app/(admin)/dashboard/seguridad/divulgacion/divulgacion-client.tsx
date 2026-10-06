'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@precision/ui';
import { Eye, FileWarning, RefreshCw, UserRound } from 'lucide-react';
import type { DatosDivulgacion, Divulgacion } from './modelo';

/**
 * El registro de divulgación — la pantalla.
 *
 * Deliberadamente sobria, al revés del Centro de Seguridad: nada de radares ni
 * medidores. Esto se lee cuando alguien pregunta "¿quién abrió la ficha de mi
 * paciente el martes?", y la respuesta tiene que ser una tabla, no un gráfico.
 */

const ZONA = 'America/Denver';

const VENTANAS = [1, 7, 30] as const;

export function DivulgacionClient({ datos, dias }: {
  datos: DatosDivulgacion; dias: number;
}): React.ReactElement {
  const tr = useTranslations('disclosure');
  const idioma = useLocale();
  const router = useRouter();
  const ruta = usePathname();
  const [pendiente, empezar] = React.useTransition();
  const [tipo, setTipo] = React.useState<string>('');

  const hora = (iso: string): string =>
    new Intl.DateTimeFormat(idioma, {
      timeZone: ZONA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));

  const eventos = tipo ? datos.eventos.filter((e) => e.accion === tipo) : datos.eventos;

  /** Los tipos presentes, para no ofrecer filtros que no filtran nada. */
  const tipos = React.useMemo(
    () => [...new Set(datos.eventos.map((e) => e.accion))].sort(),
    [datos.eventos],
  );

  const personas = new Set(eventos.map((e) => e.quien)).size;
  const pacientes = new Set(eventos.filter((e) => e.esPaciente).map((e) => e.sobre)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-1">{tr('title')}</h1>
          <p className="mt-1 max-w-2xl text-small leading-relaxed text-text-2">{tr('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-row-sep">
            {VENTANAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => empezar(() => router.push(`${ruta}?dias=${d}`))}
                className={cn(
                  'px-3 py-1 text-tiny transition-colors',
                  d === dias ? 'bg-brand text-white' : 'text-text-3 hover:bg-bg-1 hover:text-text-1',
                )}
              >
                {tr('win', { n: d })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => empezar(() => router.refresh())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-row-sep px-3 py-1 text-tiny text-text-3 transition-colors hover:bg-bg-1 hover:text-text-1"
          >
            <RefreshCw className={cn('h-3 w-3', pendiente && 'animate-spin')} />
            {tr('refresh')}
          </button>
        </div>
      </div>

      {/*
        * El aviso va arriba y no al pie: quien abre esta pantalla está
        * accediendo a PHI, y eso se dice antes de que mire, no después.
        */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        <p className="text-tiny leading-relaxed text-text-2">{tr('phiWarning')}</p>
      </div>

      {!datos.ok && (
        <div className="rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-small text-rose">
          {tr('errRead')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Cifra n={eventos.length} l={tr('statEvents')} />
        <Cifra n={personas} l={tr('statStaff')} />
        <Cifra n={pacientes} l={tr('statPatients')} tono={pacientes > 0 ? 'text-amber' : undefined} />
      </div>

      {tipos.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip activo={tipo === ''} onClick={() => setTipo('')}>{tr('all')}</Chip>
          {tipos.map((a) => (
            <Chip key={a} activo={tipo === a} onClick={() => setTipo(a)}>
              {tr(`act.${a}`)}
            </Chip>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg bg-bg-1">
        <table className="w-full min-w-[720px] text-small">
          <thead>
            <tr className="border-b border-row-sep">
              {['colWhen', 'colWho', 'colWhat', 'colAbout', 'colIp'].map((k) => (
                <th key={k} className="px-4 py-3 text-left text-tiny font-bold uppercase tracking-wider text-text-muted">
                  {tr(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-small text-text-3">{tr('empty')}</td></tr>
            )}
            {eventos.map((e, i) => <Fila key={i} e={e} hora={hora} />)}
          </tbody>
        </table>
      </div>

      {datos.eventos.length >= 500 && (
        <p className="text-tiny text-text-3">{tr('truncated')}</p>
      )}
    </div>
  );
}

function Fila({ e, hora }: { e: Divulgacion; hora: (s: string) => string }): React.ReactElement {
  const tr = useTranslations('disclosure');
  return (
    <tr className="border-b border-row-sep last:border-0">
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-tiny tabular-nums text-text-3">{hora(e.cuando)}</td>
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-text-1">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-text-3" />
          {e.quien}
        </span>
        {e.rol && <span className="text-tiny text-text-3">{e.rol}</span>}
      </td>
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-text-2">
          <Eye className="h-3.5 w-3.5 shrink-0 text-text-3" />
          {tr(`act.${e.accion}`)}
        </span>
      </td>
      <td className={cn('px-4 py-2.5', e.esPaciente ? 'text-amber' : 'text-text-2')}>
        {e.sobre}
        {/* Que se vea de un golpe cuál fila es PHI y cuál no. */}
        {e.esPaciente && <span className="ml-1.5 rounded bg-amber/15 px-1.5 text-tiny">{tr('patient')}</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-tiny text-text-3">{e.ip ?? '—'}</td>
    </tr>
  );
}

function Cifra({ n, l, tono }: { n: number; l: string; tono?: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-bg-1 p-4">
      <div className={cn('text-2xl font-bold tabular-nums leading-none', tono ?? 'text-text-1')}>{n}</div>
      <div className="mt-1.5 text-tiny text-text-3">{l}</div>
    </div>
  );
}

function Chip({ activo, onClick, children }: {
  activo: boolean; onClick: () => void; children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-tiny transition-colors',
        activo ? 'border-brand bg-brand/20 text-brand-text' : 'border-row-sep text-text-3 hover:text-text-1',
      )}
    >
      {children}
    </button>
  );
}

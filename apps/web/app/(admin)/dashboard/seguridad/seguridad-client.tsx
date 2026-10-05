'use client';

import * as React from 'react';
import { Badge, cn } from '@precision/ui';
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';
import {
  MODULOS, PROTECCIONES, MEDIDO_EL,
  type DatosSeguridad, type Evento, type PorIp,
} from './modelo';

/**
 * Security Center — la pantalla.
 *
 * Los textos van en inglés y en duro, no por `messages/`: es la decisión de
 * Erick del 2026-10-03 para las vistas de seguridad, y es lo que ya hace el
 * login del Admin. Meterlos en i18n para después poner el mismo texto en los
 * dos idiomas sería trabajo sin resultado.
 */

const ZONA = 'America/Denver';

const hora = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));

/** Cuántas protecciones cubren a este módulo, y cuántas lo dejan abierto. */
function puntaje(modulo: string): { activas: number; total: number; exposicion: number } {
  const total = PROTECCIONES.length;
  // "Parcial" cuenta como media: el paso existe pero nadie lo usa.
  const activas = PROTECCIONES.reduce((n, p) => {
    const e = p.estado[modulo];
    return n + (e === true ? 1 : e === 'parcial' ? 0.5 : 0);
  }, 0);
  return { activas, total, exposicion: Math.round(((total - activas) / total) * 100) };
}

const tono = (exp: number): string =>
  exp >= 50 ? 'text-rose' : exp >= 25 ? 'text-amber' : 'text-emerald';

function Marca({ estado }: { estado: boolean | 'parcial' | undefined }): React.ReactElement {
  if (estado === true)      return <span className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-emerald/15 text-emerald">✓</span>;
  if (estado === 'parcial') return <span className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-amber/15 text-amber" title="Built in, but nobody uses it">○</span>;
  return <span className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-rose/15 text-rose">✕</span>;
}

function Cifra({ n, l, tono: t }: { n: number | string; l: string; tono?: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-bg-1 p-4 min-w-0">
      <div className={cn('text-2xl font-bold tabular-nums leading-none', t ?? 'text-text-1')}>{n}</div>
      <div className="mt-1.5 text-tiny text-text-3">{l}</div>
    </div>
  );
}

const ETIQUETA: Record<string, string> = {
  LOGIN_SUCCESS: 'Signed in', LOGIN_FAILED: 'Wrong password',
  ACCOUNT_LOCKED: 'Account locked', ACCOUNT_UNLOCKED: 'Manual unlock',
};
const COLOR: Record<string, string> = {
  LOGIN_SUCCESS: 'text-emerald', LOGIN_FAILED: 'text-rose',
  ACCOUNT_LOCKED: 'text-rose', ACCOUNT_UNLOCKED: 'text-brand-text',
};

export function SeguridadClient({ datos }: { datos: DatosSeguridad }): React.ReactElement {
  const { eventos, porIp, cuentas, ok } = datos;
  const fallidos = eventos.filter((e) => e.accion === 'LOGIN_FAILED').length;
  const exitosos = eventos.filter((e) => e.accion === 'LOGIN_SUCCESS').length;
  const sospechosas = porIp.filter((x) => x.fallidos > 0 && x.exitosos === 0);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-text-1">Security Center</h1>
        <p className="mt-1 text-small text-text-2">
          All five modules — what protects them, and who is trying to get in.
        </p>
      </div>

      {!ok && (
        <div className="rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-small text-rose">
          Could not read the security log. The figures below are not zero — they are unknown.
        </div>
      )}

      {/* ── Las cifras ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">Last 48 hours</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Cifra n={eventos.length} l="sign-in attempts" />
          <Cifra n={exitosos} l="signed in" tono="text-emerald" />
          <Cifra n={fallidos} l="wrong password" tono={fallidos ? 'text-rose' : undefined} />
          <Cifra n={porIp.length} l="distinct IPs" />
          <Cifra n={sospechosas.length} l="IPs that only failed" tono={sospechosas.length ? 'text-rose' : 'text-emerald'} />
          <Cifra n={cuentas.trabadasAhora} l="accounts locked now" tono={cuentas.trabadasAhora ? 'text-amber' : 'text-emerald'} />
        </div>
      </section>

      {/* ── Por módulo ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">By module</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {MODULOS.map((m) => {
            const p = puntaje(m.id);
            const vistos = eventos.filter((e) => e.modulo === m.id).length;
            return (
              <div key={m.id} className="rounded-lg bg-bg-1 p-4 min-w-0">
                <div className="font-semibold text-text-1">{m.nombre}</div>
                <div className="mt-0.5 truncate font-mono text-tiny text-text-3">{m.host}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className={cn('text-xl font-bold tabular-nums', tono(p.exposicion))}>{p.activas}</span>
                  <span className="text-tiny text-text-3">of {p.total} · exposure {p.exposicion}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className={cn('h-full rounded-full', p.exposicion >= 50 ? 'bg-rose' : p.exposicion >= 25 ? 'bg-amber' : 'bg-emerald')}
                    style={{ width: `${(p.activas / p.total) * 100}%` }}
                  />
                </div>
                <div className="mt-2.5 text-tiny text-text-3">
                  {vistos > 0 ? `${vistos} attempts in 48 h` : 'no attempts in 48 h'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── La matriz ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
          What protects each module
          <span className="inline-flex items-center gap-1 normal-case tracking-normal font-medium text-text-3">
            <Clock className="h-3 w-3" /> code checked {MEDIDO_EL}
          </span>
        </h2>
        <div className="overflow-x-auto rounded-lg bg-bg-1">
          <table className="w-full min-w-[640px] text-small">
            <thead>
              <tr className="border-b border-row-sep">
                <th className="px-4 py-3 text-left text-tiny font-bold uppercase tracking-wider text-text-muted">Protection</th>
                {MODULOS.map((m) => (
                  <th key={m.id} className="px-3 py-3 text-tiny font-bold uppercase tracking-wider text-text-muted">{m.nombre}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROTECCIONES.map((p) => (
                <tr key={p.id} className="border-b border-row-sep last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-text-1">{p.nombre}</div>
                    <div className="mt-0.5 text-tiny text-text-3">{p.detalle}</div>
                  </td>
                  {MODULOS.map((m) => (
                    <td key={m.id} className="px-3 py-3 text-center"><Marca estado={p.estado[m.id]} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── IPs y eventos ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">Where they come from</h2>
          <div className="rounded-lg bg-bg-1 px-4 py-1">
            {porIp.length === 0 && <p className="py-4 text-small text-text-3">No sign-in attempts in this window.</p>}
            {porIp.map((x) => <FilaIp key={x.ip} x={x} />)}
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">What happened</h2>
          <div className="rounded-lg bg-bg-1 px-4 py-1">
            {eventos.length === 0 && <p className="py-4 text-small text-text-3">Nothing recorded in this window.</p>}
            {eventos.slice(0, 14).map((e, i) => <FilaEvento key={i} e={e} />)}
          </div>
        </section>
      </div>

      {/* ── Cuentas ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">
          Accounts · all {cuentas.total}, across the five modules
        </h2>
        <div className="rounded-lg bg-bg-1 px-4 py-1">
          <Riesgo
            t="No two-factor"
            d={cuentas.adminsSinMfa > 0 ? `Including ${cuentas.adminsSinMfa} administrator account${cuentas.adminsSinMfa > 1 ? 's' : ''}` : 'Every account has it'}
            v={`${cuentas.sinMfa} / ${cuentas.total}`} malo={cuentas.sinMfa > 0}
          />
          <Riesgo
            t="Pending verification, and can sign in anyway"
            d="Inactive and suspended accounts are blocked. Pending is not — it looks like a lock and holds nothing"
            v={cuentas.pendientesQueEntran} malo={cuentas.pendientesQueEntran > 0}
          />
          <Riesgo
            t="Never signed in"
            d="Created and unused. Each one is a live password nobody watches"
            v={cuentas.nuncaEntraron} aviso={cuentas.nuncaEntraron > 0}
          />
          <Riesgo
            t="Locked right now"
            d="They clear at midnight, or with the Unlock button on the account"
            v={cuentas.trabadasAhora} aviso={cuentas.trabadasAhora > 0}
          />
        </div>

        {cuentas.conIntentos.length > 0 && (
          <div className="mt-2.5 rounded-lg bg-bg-1 px-4 py-3">
            <div className="mb-2 text-tiny font-bold uppercase tracking-wider text-text-muted">Accounts with failed attempts</div>
            {cuentas.conIntentos.map((c) => (
              <div key={c.correo} className="flex flex-wrap items-center justify-between gap-2 border-b border-row-sep py-2 last:border-0">
                <span className="text-small text-text-1">{c.correo}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-small tabular-nums text-text-2">{c.intentos} of 3</span>
                  {c.hasta && new Date(c.hasta).getTime() > Date.now() && (
                    <Badge variant="destructive">locked until {hora(c.hasta)}</Badge>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilaIp({ x }: { x: PorIp }): React.ReactElement {
  const soloFallos = x.fallidos > 0 && x.exitosos === 0;
  const donde = [x.ciudad, x.pais].filter(Boolean).join(', ');
  return (
    <div className="border-b border-row-sep py-2.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 font-mono text-small tabular-nums text-text-1">
          {soloFallos
            ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose" />
            : <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald" />}
          {x.ip}
        </span>
        <span className="font-mono text-tiny tabular-nums text-text-3">
          {x.fallidos > 0 && <span className="text-rose">{x.fallidos} failed</span>}
          {x.fallidos > 0 && x.exitosos > 0 && ' · '}
          {x.exitosos > 0 && <span>{x.exitosos} ok</span>}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-tiny text-text-3">
        <span>{hora(x.ultimo)}{x.modulos.length > 0 && ` · ${x.modulos.join(', ')}`}</span>
        {/* Sin ubicación no se inventa nada: se dice que no se sabe. */}
        <span className="font-mono">{donde || 'location unknown'}</span>
      </div>
    </div>
  );
}

function FilaEvento({ e }: { e: Evento }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-row-sep py-2 text-small last:border-0">
      <time className="font-mono text-tiny tabular-nums text-text-3">{hora(e.cuando)}</time>
      <span className={cn('font-semibold', COLOR[e.accion] ?? 'text-text-2')}>{ETIQUETA[e.accion] ?? e.accion}</span>
      {e.intentos !== null && e.accion === 'LOGIN_FAILED' && (
        <span className="text-tiny text-text-3">{e.intentos} of 3</span>
      )}
      <span className="min-w-0 flex-1 truncate text-tiny text-text-3">{e.correo ?? '—'}</span>
      <span className="font-mono text-tiny text-text-3">{e.ip ?? '—'}</span>
    </div>
  );
}

function Riesgo({ t, d, v, malo, aviso }: {
  t: string; d: string; v: number | string; malo?: boolean; aviso?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-row-sep py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-small text-text-1">{t}</div>
        <div className="mt-0.5 text-tiny text-text-3">{d}</div>
      </div>
      <div className={cn('font-mono text-base font-bold tabular-nums', malo ? 'text-rose' : aviso ? 'text-amber' : 'text-emerald')}>{v}</div>
    </div>
  );
}

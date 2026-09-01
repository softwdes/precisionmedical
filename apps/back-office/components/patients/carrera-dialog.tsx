'use client';

/**
 * La Carrera, en modal desde la cabecera de Pacientes.
 *
 * Va acá y no en un ítem del menú por decisión de Erick (31-ago-2026): al lado
 * de Historial de llamadas, Historial de SMS y Precios, y con la misma mecánica
 * que esos tres — un botón que abre un diálogo, sin sacar a nadie de la lista.
 *
 * Es deliberadamente abierta a todo el equipo, con nombres completos ("es una
 * carrera entre todos"). Lo que la hace segura de compartir es lo que su API NO
 * devuelve: ni llamadas, ni SMS, ni desglose acción por acción, ni un dato de
 * paciente. Ver `lib/carrera.ts`.
 *
 * La pista en sí es `CarreraClient` de `@precision/ui`, el MISMO componente que
 * usa el tab Métricas de apps/web: si cambia la vara o el diseño de la barra,
 * cambia en los dos lados a la vez.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  CarreraClient, carreraLabels, type RacerRow,
} from '@precision/ui';
import { FilterPill } from '@/components/ui-phoenix';
import { claveDia } from '@/lib/fechas';

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes';
type Grupo = 'all' | 'CLINIC' | 'DEV' | 'COMMS';

/** Llaves de i18n, no textos: la pista se ve en el idioma del usuario. */
const PERIODOS: Array<[Periodo, string]> = [
  ['hoy', 'periodToday'], ['ayer', 'periodYesterday'],
  ['semana', 'periodWeek'], ['mes', 'periodMonth'],
];

const GRUPOS: Array<[Grupo, string]> = [
  ['all', 'crewAll'], ['CLINIC', 'crewClinic'], ['DEV', 'crewDev'], ['COMMS', 'crewComms'],
];

/** Días del período en la zona de la clínica — no en la del navegador. */
function rango(p: Periodo): { from: string; to: string } {
  const hoy = claveDia(new Date());
  const dia = (offset: number): string =>
    new Date(new Date(`${hoy}T12:00:00Z`).getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  switch (p) {
    case 'hoy':    return { from: hoy, to: hoy };
    case 'ayer':   return { from: dia(-1), to: dia(-1) };
    case 'semana': return { from: dia(-6), to: hoy };
    case 'mes':    return { from: `${hoy.slice(0, 7)}-01`, to: hoy };
  }
}

/** Refresco en vivo. Mismo pulso que el resto del back-office. */
const PULSO_MS = 30_000;

export function CarreraDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations('phoenix.carrera');
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [grupo, setGrupo] = useState<Grupo>('CLINIC');
  const [rows, setRows] = useState<RacerRow[] | null>(null);
  const [live, setLive] = useState(false);

  const { from, to } = useMemo(() => rango(periodo), [periodo]);

  /**
   * `redirect: 'manual'` y no el default: con la sesión vencida el middleware
   * responde 307 a `/login`, y siguiendo el redirect `res.ok` da true, llega
   * HTML y `res.json()` revienta con un rechazo sin dueño.
   */
  const traer = useCallback(async () => {
    try {
      const res = await fetch(`/api/metrics/carrera?from=${from}&to=${to}`, {
        cache: 'no-store',
        redirect: 'manual',
      });
      if (!res.ok || res.type === 'opaqueredirect') return;
      const body = (await res.json()) as { racers?: RacerRow[] };
      if (Array.isArray(body.racers)) setRows(body.racers);
    } catch {
      // Red caída o respuesta que no es JSON: se deja la última data buena.
      // Un reporte viejo es mejor que un modal en blanco.
    }
  }, [from, to]);

  // Solo consulta con el modal abierto: cerrado no gasta una request.
  useEffect(() => {
    if (open) void traer();
  }, [open, traer]);

  // En vivo solo tiene sentido con "Hoy" — el resto del período es una foto.
  const puedeEnVivo = periodo === 'hoy';
  useEffect(() => {
    if (!open || !live || !puedeEnVivo) return;
    const t = setInterval(() => void traer(), PULSO_MS);
    return () => clearInterval(t);
  }, [open, live, puedeEnVivo, traer]);

  const visibles = useMemo(
    () => (rows ?? []).filter((r) => grupo === 'all' || r.crew === grupo),
    [rows, grupo],
  );

  const cuenta = useCallback(
    (g: Grupo) => (g === 'all' ? (rows ?? []).length : (rows ?? []).filter((r) => r.crew === g).length),
    [rows],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle><span aria-hidden>🏇</span> {t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          {PERIODOS.map(([k, label]) => (
            <FilterPill key={k} active={periodo === k} onClick={() => setPeriodo(k)} label={t(label)} />
          ))}
          <span className="w-px h-5 bg-border mx-1 hidden sm:block" />
          {GRUPOS.map(([k, label]) => (
            <FilterPill key={k} active={grupo === k} onClick={() => setGrupo(k)} label={t(label)} count={cuenta(k)} />
          ))}
        </div>

        {rows === null ? (
          <div className="rounded-lg bg-bg-1 p-12 text-center text-sm text-text-muted">
            {t('loading')}
          </div>
        ) : (
          <CarreraClient
            rows={visibles}
            live={live && puedeEnVivo}
            canGoLive={puedeEnVivo}
            onToggleLive={() => setLive((v) => !v)}
            labels={carreraLabels(t)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

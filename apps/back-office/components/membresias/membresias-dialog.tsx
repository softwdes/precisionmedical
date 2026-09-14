'use client';

/**
 * Membresías — el padrón de socios, desde la lista de pacientes.
 *
 * Hermano de Precios y del historial de llamadas: misma barra, mismo diálogo,
 * misma mecánica —se abre sin sacar a nadie de la lista y los datos se piden la
 * primera vez que se abre, no con la pantalla—.
 *
 * Dos cosas que lo definen:
 *
 *  · **Las vencidas van primero.** El orden por fecha de próximo pago las deja
 *    arriba solas, sin filtro ni pestaña: son las que exigen hacer algo, y son
 *    pocas (2 de 22 en el primer corte).
 *
 *  · **Arriba dice de cuándo es el dato.** El origen manda un archivo por
 *    semana, así que esto tiene hasta siete días de atraso. Sin el cartel, un
 *    "al día" viejo se lee como si fuera de hoy.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@precision/ui';
import { BadgeCheck, Search as SearchIcon, Loader2, X as XIcon, Info } from 'lucide-react';
import { DataTable, EmptyState, StatusPill } from '@/components/ui-phoenix';
import { fechaCalendario, localeApp } from '@/lib/fechas';
import type { EstadoMembresia } from '@/lib/membresias';

interface Socio {
  id: string;
  estado: EstadoMembresia;
  dias: number | null;
  plan: string;
  tipo: string;
  montoMensual: string;
  empresa: string | null;
  grupoFamiliar: string | null;
  desde: string | null;
  hasta: string | null;
  fueraDelCorte: boolean;
  paciente: {
    id: string; patientCode: string; firstName: string; lastName: string; phone: string | null;
  };
}

interface Respuesta {
  corteAl: string | null;
  socios: Socio[];
  resumen: { total: number; activas: number; vencidas: number };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const plata = (v: string): string => {
  const n = Number(v);
  return isNaN(n) ? v : `$${n.toLocaleString(localeApp(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function MembresiasDialog({ open, onOpenChange }: Props): React.ReactElement {
  const t = useTranslations('phoenix.memberships');

  const [data, setData] = React.useState<Respuesta | null>(null);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [q, setQ] = React.useState('');

  React.useEffect(() => {
    if (!open || data || cargando) return;
    setCargando(true);
    setError(false);
    fetch('/api/admin/memberships', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<Respuesta>; })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [open, data, cargando]);

  React.useEffect(() => { if (open) setQ(''); }, [open]);

  // Un solo campo que cruza persona, código, empresa y familia: quien busca no
  // sabe si "Utah Avenue" es la empresa o el apellido de alguien.
  const socios = React.useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.socios;
    return data.socios.filter((s) =>
      `${s.paciente.firstName} ${s.paciente.lastName} ${s.paciente.patientCode} ${s.empresa ?? ''} ${s.grupoFamiliar ?? ''} ${s.tipo}`
        .toLowerCase().includes(needle));
  }, [data, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-brand-text" />
            {t('titulo')}
          </DialogTitle>
          <DialogDescription>{t('subtitulo')}</DialogDescription>
        </DialogHeader>

        {data && (
          <div className="px-4 sm:px-6 pb-3 shrink-0 flex items-center gap-2 flex-wrap">
            <StatusPill state="neutral" label={t('total', { n: data.resumen.total })} />
            <StatusPill state="active" label={t('activas', { n: data.resumen.activas })} />
            {data.resumen.vencidas > 0 && (
              <StatusPill state="danger" label={t('vencidas', { n: data.resumen.vencidas })} />
            )}
          </div>
        )}

        {/* De cuándo es la foto. Va arriba de la tabla, no en una nota al pie:
            es la condición para leer bien todo lo de abajo. */}
        {data?.corteAl && (
          <div className="mx-4 sm:mx-6 mb-3 shrink-0 flex items-start gap-2 rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{t('desactualizado', { fecha: fechaCalendario(data.corteAl) })}</span>
          </div>
        )}

        <div className="px-4 sm:px-6 pb-3 shrink-0">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('buscar')}
              className="w-full bg-bg-2 border border-border rounded-md pl-9 pr-9 py-2 text-sm text-text-1 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-1"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
          {cargando && (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!cargando && (error || !data) && (
            <EmptyState.Rich icon={BadgeCheck} title={t('vacio')} />
          )}

          {!cargando && data && socios.length === 0 && (
            <EmptyState.Rich icon={SearchIcon} title={q ? t('sinResultados') : t('vacio')} />
          )}

          {!cargando && data && socios.length > 0 && (
            <DataTable.Card>
              <DataTable.Scroll>
                <DataTable.Table>
                  <DataTable.Head>
                    <DataTable.Th sticky="left">{t('colPaciente')}</DataTable.Th>
                    <DataTable.Th>{t('colTipo')}</DataTable.Th>
                    <DataTable.Th>{t('colGrupo')}</DataTable.Th>
                    <DataTable.Th align="right">{t('colMonto')}</DataTable.Th>
                    <DataTable.Th>{t('colDesde')}</DataTable.Th>
                    <DataTable.Th>{t('colHasta')}</DataTable.Th>
                    <DataTable.Th>{t('colEstado')}</DataTable.Th>
                  </DataTable.Head>
                  <tbody>
                    {socios.map((s) => (
                      <DataTable.Row key={s.id} muted={s.fueraDelCorte}>
                        <DataTable.Td sticky="left">
                          <span className="text-text-1">{s.paciente.firstName} {s.paciente.lastName}</span>
                          <span className="ml-1.5 text-[10px] font-mono text-text-muted">{s.paciente.patientCode}</span>
                        </DataTable.Td>
                        <DataTable.Td>{s.tipo}</DataTable.Td>
                        <DataTable.Td className="text-[12.5px]">{s.empresa ?? s.grupoFamiliar ?? '—'}</DataTable.Td>
                        <DataTable.Td align="right" className="tabular-nums">{plata(s.montoMensual)}</DataTable.Td>
                        <DataTable.Td>{s.desde ? fechaCalendario(s.desde) : '—'}</DataTable.Td>
                        <DataTable.Td>{s.hasta ? fechaCalendario(s.hasta) : '—'}</DataTable.Td>
                        <DataTable.Td>
                          <StatusPill
                            state={s.estado === 'ACTIVA' ? 'active' : 'danger'}
                            label={t(s.estado === 'ACTIVA' ? 'estadoActiva' : 'estadoVencida')}
                          />
                        </DataTable.Td>
                      </DataTable.Row>
                    ))}
                  </tbody>
                </DataTable.Table>
              </DataTable.Scroll>
            </DataTable.Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

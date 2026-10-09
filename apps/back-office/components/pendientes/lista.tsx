'use client';

/**
 * Las dos listas de "Mis pendientes": lo que hay por corregir y lo que ya se corrigió.
 *
 * Las usan dos pantallas —la bandeja de cada persona y el detalle que ve el
 * administrador— y por eso viven acá: quien administra y quien se equivocó tienen
 * que leer exactamente lo mismo, no dos versiones que se desalinean.
 */

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, CheckCircle2, CopyX, MailWarning, MessageSquareWarning, UserX } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';
import { fechaCorta, hora } from '@/lib/fechas';
import type { Pendiente, PendienteTipo } from '@/lib/pendientes';
import type { Corregido, CorregidoTipo } from '@/lib/pendientes/corregidos';

export const COLOR_TIPO: Record<PendienteTipo, string> = {
  CITA_DUPLICADA: 'bg-amber/15 text-amber border-amber/30',
  SMS_FALLIDO: 'bg-rose/15 text-rose border-rose/30',
  CORREO_FALLIDO: 'bg-rose/15 text-rose border-rose/30',
  CITA_SIN_CERRAR: 'bg-cyan/15 text-cyan border-cyan/30',
  CITA_SIN_PROVIDER: 'bg-cyan/15 text-cyan border-cyan/30',
  MENSAJE_DUPLICADO: 'bg-amber/15 text-amber border-amber/30',
};

const ICONO_TIPO: Record<PendienteTipo, React.ElementType> = {
  CITA_DUPLICADA: CopyX,
  SMS_FALLIDO: MessageSquareWarning,
  CORREO_FALLIDO: MailWarning,
  CITA_SIN_CERRAR: CalendarClock,
  CITA_SIN_PROVIDER: UserX,
  MENSAJE_DUPLICADO: CopyX,
};

const COLOR_CORREGIDO: Record<CorregidoTipo, string> = {
  CITA_DUPLICADA_ELIMINADA: 'bg-emerald/15 text-emerald border-emerald/30',
  PACIENTE_EQUIVOCADO: 'bg-emerald/15 text-emerald border-emerald/30',
  CITA_ERRONEA: 'bg-emerald/15 text-emerald border-emerald/30',
  CHECK_IN_REVERTIDO: 'bg-emerald/15 text-emerald border-emerald/30',
};

const esCita = (tipo: PendienteTipo) =>
  tipo === 'CITA_DUPLICADA' || tipo === 'CITA_SIN_CERRAR' || tipo === 'CITA_SIN_PROVIDER';

/** A dónde lleva "corregir". El calendario abre el caso con la cita filtrada. */
export function destinoDe(
  p: { tipo: PendienteTipo; caseId: string | null; appointmentId: string | null; patientId: string | null },
  base: string,
): string {
  if (esCita(p.tipo) && base === '' && p.caseId) {
    const q = new URLSearchParams({ case: p.caseId });
    if (p.appointmentId) q.set('visit', p.appointmentId);
    return `/calendar?${q.toString()}`;
  }
  return p.patientId ? `${base}/patients/${p.patientId}` : `${base || ''}/`;
}

export function ListaPendientes({ items, base }: { items: Pendiente[]; base: string }): React.ReactElement {
  const t = useTranslations('phoenix.pendientes');
  const locale = useLocale() as 'es' | 'en';

  const textoMotivo = (p: Pendiente): string => {
    if (p.motivo === 'MISMA_HORA') {
      return p.otraCreadaPor ? t('motivo.MISMA_HORA_POR', { otra: p.otraCreadaPor }) : t('motivo.MISMA_HORA');
    }
    if (p.motivo === 'PASADA_SIN_ESTADO') {
      return t('motivo.PASADA_SIN_ESTADO', { estado: p.estado ? t(`estadoCita.${p.estado}`) : '—' });
    }
    return t(`motivo.${p.motivo}`);
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map((p) => {
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
                    {fechaCorta(p.cuando, locale)} · {hora(p.cuando, locale)}
                  </span>
                </div>
                <p className="text-[12.5px] text-text-2">{textoMotivo(p)}</p>
              </div>
            </div>
            <Link
              href={destinoDe(p, base)}
              className="shrink-0 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              {esCita(p.tipo) ? t('openAppt') : t('openPatient')}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Horas → "menos de una hora", "5 h", "3 días". */
function duracion(horas: number, t: ReturnType<typeof useTranslations<'phoenix.pendientes'>>): string {
  if (horas < 1) return t('duracion.menosHora');
  if (horas < 48) return t('duracion.horas', { n: Math.round(horas) });
  return t('duracion.dias', { n: Math.round(horas / 24) });
}

/**
 * Lo ya corregido. `vista` decide cómo se nombra a quien lo arregló: la propia
 * persona lee "vos", el administrador lee "la misma persona".
 */
export function ListaCorregidos({
  items, base, vista,
}: { items: Corregido[]; base: string; vista: 'propia' | 'admin' }): React.ReactElement {
  const t = useTranslations('phoenix.pendientes');
  const locale = useLocale() as 'es' | 'en';

  const quien = (c: Corregido): string => {
    if (c.porAdministracion) return t('quien.admin');
    if (c.porElMismo) return vista === 'propia' ? t('quien.vos') : t('quien.lamisma');
    return c.corregidoPor ?? t('quien.nose');
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map((c) => (
        <li key={c.id} className="rounded-lg bg-bg-1 p-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1 basis-72">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald" aria-hidden />
            <div className="min-w-0 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <TagPill compact label={t(`corregidoTipo.${c.tipo}`)} colorClass={COLOR_CORREGIDO[c.tipo]} />
                <span className="text-sm font-semibold text-text-1">{c.paciente}</span>
              </div>
              <p className="text-[12.5px] text-text-2">{t(`corregidoDesc.${c.tipo}`)}</p>
              {c.motivo && <p className="text-[11.5px] text-text-muted">{t('corregidoMotivo', { motivo: c.motivo })}</p>}
              <p className="text-[11px] text-text-muted tabular-nums">
                {t('corregidoLinea', {
                  fecha: `${fechaCorta(c.corregidoEn, locale)} ${hora(c.corregidoEn, locale)}`,
                  quien: quien(c),
                  tiempo: duracion(c.horas, t),
                })}
              </p>
            </div>
          </div>
          {c.patientId && (
            <Link
              href={`${base}/patients/${c.patientId}`}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-2 hover:text-text-1 hover:bg-bg-2"
            >
              {t('openPatient')}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

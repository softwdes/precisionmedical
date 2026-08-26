'use client';

import Link from 'next/link';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, ChevronRight, MessageSquarePlus } from 'lucide-react';
import { Section, EmptyState, TagPill, IconAction } from '@/components/ui-phoenix';
import type { MotivoAtencion } from '@/lib/vigia/queue';
import { RequestDialog } from './request-dialog';

/**
 * Portal Legal · Vigía · la cola de "necesita atención".
 *
 * Componente de CLIENTE por `Section`, que lo es (recuerda el plegado): un
 * Server Component no puede pasarle el `icon`, así que el ícono se importa de
 * este lado y la página manda solo datos planos.
 *
 * Las filas llegan ya ordenadas por urgencia desde `colaDeAtencion()`. Acá no
 * se decide nada: solo se pinta.
 */

export interface FilaVista {
  caseId: string;
  caseCode: string;
  paciente: string | null;
  motivo: MotivoAtencion;
  diasSinCita: number | null;
  diasAbierto: number;
  /** El lien sin firmar no crea la fila, pero se marca cuando además falta. */
  sinFirma: boolean;
}

/** Motivo → cómo se lee y de qué color. El verbo es lo que hay que hacer, no lo que pasó. */
const VERBO: Record<MotivoAtencion, { key: string; why: string; tone: string }> = {
  SIN_NINGUNA_CITA: {
    key: 'vigiaVerbSchedule', why: 'vigiaWhyNoAppts',
    tone: 'bg-cyan/15 text-cyan border-cyan/30',
  },
  TRATAMIENTO_SIN_MOVIMIENTO: {
    key: 'vigiaVerbPush', why: 'vigiaWhyStalled',
    tone: 'bg-amber/15 text-amber border-amber/30',
  },
};

export function QueuePanel({ filas, total, abandonados }: {
  filas: FilaVista[];
  total: number;
  abandonados: number;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  // El caso sobre el que se está pidiendo algo. Null = diálogo cerrado.
  const [pidiendo, setPidiendo] = React.useState<FilaVista | null>(null);

  return (
    <Section icon={AlertCircle} title={t('vigiaQueueTitle')} count={total} tone="amber">
      {filas.length === 0 ? (
        <EmptyState.Rich
          icon={AlertCircle}
          title={t('vigiaQueueClearTitle')}
          subtitle={t('vigiaQueueClearSub')}
        />
      ) : (
        <div className="-mx-5 -my-2">
          {filas.map((f) => {
            const v = VERBO[f.motivo];
            return (
              // La fila entera es el link al caso; el ícono de mensaje va
              // ENCIMA, con `stopPropagation`, para que pedirle algo a la
              // clínica no te lleve al expediente sin querer.
              <div
                key={f.caseId}
                className="flex items-center gap-3 border-b border-row-sep last:border-0 hover:bg-white/[0.02] transition-colors group"
              >
                <Link href={`/attorney/vigia?case=${f.caseId}`} className="flex items-center gap-3 flex-1 min-w-0 px-5 py-2.5">
                  <span className="shrink-0 min-w-[92px]">
                    <span className="block text-sm font-semibold text-text-1">{f.caseCode}</span>
                    {f.paciente && (
                      <span className="block text-[11.5px] text-text-muted truncate">{f.paciente}</span>
                    )}
                  </span>
                  <span className="text-[12.5px] text-text-muted flex-1 min-w-0 truncate">
                    {t(v.why, { dias: f.diasSinCita ?? f.diasAbierto })}
                    {f.sinFirma && <span className="text-amber"> · {t('vigiaAlsoUnsigned')}</span>}
                  </span>
                </Link>
                <TagPill label={t(v.key)} colorClass={v.tone} compact />
                <span className="pr-4 flex items-center gap-1">
                  <IconAction
                    icon={MessageSquarePlus}
                    label={t('vigiaReqCta')}
                    stopPropagation
                    onClick={() => setPidiendo(f)}
                  />
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </div>
            );
          })}

          {/* Lo que la ventana dejó afuera se DICE. Un recorte silencioso hace
              creer que la cola es todo lo que hay. */}
          {abandonados > 0 && (
            <Link
              href="/attorney/cases?status=active"
              className="flex items-center gap-2 px-5 py-2.5 text-[12px] text-text-muted hover:text-text-2 transition-colors"
            >
              {t('vigiaQueueAbandoned', { n: abandonados })}
              <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      )}
      <RequestDialog
        caso={pidiendo?.caseCode ?? null}
        asunto={pidiendo ? t(`vigiaReqSubject_${pidiendo.motivo}`, { caso: pidiendo.caseCode }) : ''}
        cuerpo={pidiendo
          ? t(`vigiaReqBody_${pidiendo.motivo}`, {
              caso: pidiendo.caseCode,
              dias: pidiendo.diasSinCita ?? pidiendo.diasAbierto,
            })
          : ''}
        onClose={() => setPidiendo(null)}
      />
    </Section>
  );
}

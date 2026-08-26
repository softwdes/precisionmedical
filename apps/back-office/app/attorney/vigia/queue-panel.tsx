'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { Section, EmptyState, TagPill } from '@/components/ui-phoenix';
import type { MotivoAtencion } from '@/lib/vigia/queue';

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
              <Link
                key={f.caseId}
                href={`/attorney/vigia?case=${f.caseId}`}
                className="flex items-center gap-3 px-5 py-2.5 border-b border-row-sep last:border-0 hover:bg-white/[0.02] transition-colors group"
              >
                <span className="text-sm font-semibold text-text-1 shrink-0 min-w-[92px]">
                  {f.caseCode}
                </span>
                <span className="text-[12.5px] text-text-muted flex-1 min-w-0 truncate">
                  {t(v.why, { dias: f.diasSinCita ?? f.diasAbierto })}
                  {f.sinFirma && <span className="text-amber"> · {t('vigiaAlsoUnsigned')}</span>}
                </span>
                <TagPill label={t(v.key)} colorClass={v.tone} compact />
                <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
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
    </Section>
  );
}

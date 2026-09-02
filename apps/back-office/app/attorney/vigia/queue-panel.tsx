'use client';

import Link from 'next/link';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, ChevronRight, MessageSquarePlus, Clock } from 'lucide-react';
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
  /** Días desde el cierre. Solo viene con `LIEN_SIN_FIRMA_CASO_CERRADO`. */
  diasCerrado: number | null;
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
  // El único en rojo: acá no hay nada que empujar, lo que falta es la firma de
  // quien está mirando la pantalla.
  LIEN_SIN_FIRMA_CASO_CERRADO: {
    key: 'vigiaVerbSign', why: 'vigiaWhyLienClosed',
    tone: 'bg-rose/15 text-rose border-rose/30',
  },
};

/**
 * Una fila. Vive aparte porque la usan las DOS secciones —lo que necesita
 * atención hoy y la cartera parada— y tienen que verse idénticas: si divergen,
 * la segunda parece otra cosa y deja de leerse como la continuación de la
 * primera.
 */
function Fila({ f, onPedir }: { f: FilaVista; onPedir: (f: FilaVista) => void }): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const v = VERBO[f.motivo];
  // Misma cadena que `diasDeLaFila()` del servidor — cada motivo tiene su reloj.
  const dias = f.diasCerrado ?? f.diasSinCita ?? f.diasAbierto;
  // Más allá de la ventana el verbo cambia: a un caso de 600 días no se lo
  // "empuja", se lo revisa para ver si sigue vivo. La firma es la excepción:
  // sigue faltando igual, y firmar no se vuelve "revisar" con el tiempo.
  const verbo = dias > 90 && f.motivo !== 'LIEN_SIN_FIRMA_CASO_CERRADO'
    ? { key: 'vigiaVerbReview', tone: 'bg-bg-2/60 text-text-muted border-transparent' }
    : v;

  return (
    <div className="flex items-center gap-3 border-b border-row-sep last:border-0 hover:bg-white/[0.02] transition-colors group">
      <Link href={`/attorney/vigia?case=${f.caseId}`} className="flex items-center gap-3 flex-1 min-w-0 px-5 py-2.5">
        {/* Anchos FIJOS en las dos primeras columnas: con `min-w` la columna
            crecía según el largo del nombre y cada descripción arrancaba en una
            x distinta — el borde izquierdo quedaba dentado. */}
        <span className="shrink-0 w-[104px]">
          <span className="block text-sm font-semibold text-text-1">{f.caseCode}</span>
          {f.paciente && (
            <span className="block sm:hidden text-[11.5px] text-text-muted truncate">{f.paciente}</span>
          )}
        </span>
        {f.paciente && (
          <span className="hidden sm:block shrink-0 w-[172px] text-[12.5px] text-text-2 truncate">
            {f.paciente}
          </span>
        )}
        <span className="text-[12.5px] text-text-muted flex-1 min-w-0 truncate">
          {t(v.why, { dias })}
          {f.sinFirma && <span className="text-amber"> · {t('vigiaAlsoUnsigned')}</span>}
        </span>
      </Link>
      <TagPill label={t(verbo.key)} colorClass={verbo.tone} compact />
      <span className="pr-4 flex items-center gap-1">
        <IconAction icon={MessageSquarePlus} label={t('vigiaReqCta')} stopPropagation onClick={() => onPedir(f)} />
        <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    </div>
  );
}

/**
 * La cartera parada: lo que quedó fuera de la ventana de 90 días.
 *
 * Sección propia y PLEGADA. Es un problema distinto —limpieza, no trabajo de
 * hoy— y mezclarlo con la cola fue justamente el error que arreglamos con la
 * ventana. Cerrada no estorba; `storageKey` recuerda si la dejaste abierta, así
 * que a quien le interese la limpieza le aparece así siempre.
 */
export function StalledPanel({ filas, total }: { filas: FilaVista[]; total: number }): React.ReactElement | null {
  const t = useTranslations('phoenix.attorney');
  const [pidiendo, setPidiendo] = React.useState<FilaVista | null>(null);

  if (total === 0) return null;

  return (
    <Section
      icon={Clock}
      title={t('vigiaStalledTitle')}
      count={total}
      collapsible
      defaultOpen={false}
      storageKey="vigia-cartera-parada"
    >
      <p className="text-[12.5px] text-text-muted px-5 pb-2">{t('vigiaStalledHint')}</p>
      <div className="-mx-5">
        {filas.map((f) => (
          <Fila key={f.caseId} f={f} onPedir={setPidiendo} />
        ))}
      </div>

      <RequestDialog
        caso={pidiendo?.caseCode ?? null}
        asunto={pidiendo ? t(`vigiaReqSubject_${pidiendo.motivo}`, { caso: pidiendo.caseCode }) : ''}
        cuerpo={pidiendo
          ? t(`vigiaReqBody_${pidiendo.motivo}`, {
              caso: pidiendo.caseCode,
              dias: pidiendo.diasCerrado ?? pidiendo.diasSinCita ?? pidiendo.diasAbierto,
            })
          : ''}
        onClose={() => setPidiendo(null)}
      />
    </Section>
  );
}

export function QueuePanel({ filas, total }: {
  filas: FilaVista[];
  total: number;
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
          {filas.map((f) => (
            <Fila key={f.caseId} f={f} onPedir={setPidiendo} />
          ))}

        </div>
      )}
      <RequestDialog
        caso={pidiendo?.caseCode ?? null}
        asunto={pidiendo ? t(`vigiaReqSubject_${pidiendo.motivo}`, { caso: pidiendo.caseCode }) : ''}
        cuerpo={pidiendo
          ? t(`vigiaReqBody_${pidiendo.motivo}`, {
              caso: pidiendo.caseCode,
              dias: pidiendo.diasCerrado ?? pidiendo.diasSinCita ?? pidiendo.diasAbierto,
            })
          : ''}
        onClose={() => setPidiendo(null)}
      />
    </Section>
  );
}

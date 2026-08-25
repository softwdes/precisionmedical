'use client';

/**
 * Cita ONLINE — la marca y el enlace de la videollamada.
 *
 * Dos piezas, porque son dos momentos distintos: una para ESCANEAR (la fila de
 * una lista) y otra para ACTUAR (copiar el enlace y entrar). Vive en un solo
 * lugar porque aparece en cuatro vistas —My Day, la consulta, Day Admission y el
 * panel del calendario— y escrito inline en cada una terminaría siendo cuatro
 * diseños distintos de lo mismo (Regla #0).
 *
 * **Por qué cyan en todas y no el color del módulo**: My Day es violeta y
 * Admisión esmeralda, pero "esta visita es por video" significa lo mismo en
 * todas partes. La consistencia del significado gana sobre la identidad del
 * módulo — y ya estaba en cyan en las tres vistas que lo mostraban.
 *
 * **Por qué la palabra y no solo el ícono**: antes de esto era una cámara
 * suelta. Un ícono sin texto no le dice "cita online" a quien no lo vio antes.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Video, ExternalLink } from 'lucide-react';
import { Button } from '@precision/ui';
import { TagPill, CopyButton } from '@/components/ui-phoenix';

const CYAN = 'bg-cyan/15 text-cyan border-cyan/30';

/** Marca compacta, para filas y encabezados. */
export function OnlineBadge({ compact = false }: { compact?: boolean }): React.ReactElement {
  const t = useTranslations('phoenix.online');
  return (
    <TagPill
      label={compact ? t('badgeShort') : t('badge')}
      colorClass={CYAN}
      icon={<Video className="w-3 h-3" />}
    />
  );
}

/**
 * El bloque donde se copia el enlace. Para vistas de detalle.
 *
 * `Copiar` es la acción principal y no `Abrir`: quien mira esto casi siempre
 * está por pasarle el enlace al paciente (por WhatsApp, mail o teléfono), no por
 * entrar él mismo.
 */
export function OnlineMeetingBox({ meetingUrl }: { meetingUrl: string | null }): React.ReactElement {
  const t = useTranslations('phoenix.online');

  /**
   * Sin enlace cargado NO es un caso raro: el `meetingUrl` se escribe a mano al
   * crear la cita, así que falta seguido. Se dice en ámbar y con la salida
   * ("editá la cita"), porque una caja vacía es la que genera la llamada a
   * soporte.
   */
  if (!meetingUrl) {
    return (
      <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 flex items-start gap-2">
        <Video className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-amber">{t('title')}</div>
          <p className="text-[11.5px] text-text-2 mt-0.5">{t('noLink')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-cyan/25 bg-cyan/[0.07] px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Video className="w-3.5 h-3.5 text-cyan shrink-0" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-cyan">{t('title')}</span>
      </div>
      {/* En mobile la URL y los botones se apilan: en una sola fila, una URL
          larga empuja los botones fuera de la pantalla. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Seleccionable a mano además del botón: hay gente que copia así, y con
            `select-all` un clic ya la toma entera. */}
        <span
          className="font-mono text-[11.5px] text-text-1 truncate min-w-0 flex-1 select-all"
          title={meetingUrl}
        >
          {meetingUrl.replace(/^https?:\/\//, '')}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <CopyButton value={meetingUrl} label={t('copy')} copiedLabel={t('copied')} className="flex-1 sm:flex-none" />
          <Button variant="ghost" asChild className="shrink-0 gap-1.5 min-h-11 sm:min-h-0 sm:h-8">
            <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> {t('open')}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

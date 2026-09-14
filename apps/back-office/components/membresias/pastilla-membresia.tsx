'use client';

/**
 * La pastilla de membresía — una sola, para las cuatro pantallas.
 *
 * Recepción necesita saber en el momento de agendar si la persona tiene
 * membresía y hasta cuándo. Eso aparece en el diálogo de nueva cita (al lado
 * del paciente elegido), en la ficha del paciente y en el detalle del caso.
 *
 * **Es un solo componente a propósito.** Escrita cuatro veces, en tres meses
 * cada pantalla dice una cosa distinta sobre el mismo socio — que es
 * exactamente lo que pasó con las fotos de identidad.
 *
 * Tres estados y nada más (Erick, 13-sep-2026):
 *   · tiene membresía  → verde, con hasta cuándo
 *   · vencida          → ROJA
 *   · no tiene         → apagada
 *
 * El rojo se reserva para la vencida porque es lo único que exige actuar: hay
 * alguien parado en el mostrador creyendo que está cubierto.
 */

import { useTranslations } from 'next-intl';
import { StatusPill } from '@/components/ui-phoenix';
import { fechaCalendario } from '@/lib/fechas';
import type { Membresia } from '@/lib/membresias';

export interface PastillaMembresiaProps {
  membresia: Membresia;
  /**
   * En `compacta` no se dibuja nada cuando la persona NO tiene membresía.
   *
   * Reservado para listas largas, donde cincuenta "Sin membresía" apagados son
   * ruido. **Las tres pantallas de hoy NO lo usan**, a propósito: el trabajo de
   * la pastilla es contestar una pregunta que hoy obliga a abrir otro sistema,
   * y si no se dibuja nada, quien mira no puede distinguir "no es socio" de "el
   * sistema todavía no lo sabe". Esa ambigüedad es exactamente la que hizo que
   * las fotos del v2 se leyeran como faltantes durante semanas.
   */
  compacta?: boolean;
}

export function PastillaMembresia({ membresia, compacta }: PastillaMembresiaProps) {
  const t = useTranslations('phoenix.memberships');

  if (membresia.estado === 'SIN') {
    if (compacta) return null;
    return <StatusPill state="inactive" label={t('sin')} />;
  }

  const vencida = membresia.estado === 'VENCIDA';
  const cuando = membresia.hasta ? fechaCalendario(membresia.hasta) : t('sinFecha');

  /**
   * El resto del dato va al tooltip y no a la pastilla: el tipo, el grupo
   * familiar, la empresa y —sobre todo— **de cuándo es la foto**. El corte
   * tiene hasta siete días de atraso y quien decide algo mirando esto tiene
   * derecho a saberlo sin salir de la pantalla.
   */
  const detalle = [
    `${membresia.plan} · ${membresia.tipo}`,
    membresia.empresa ? t('empresa', { nombre: membresia.empresa }) : null,
    membresia.grupoFamiliar ? t('familia', { nombre: membresia.grupoFamiliar }) : null,
    t('corte', { fecha: fechaCalendario(membresia.corteAl) }),
    membresia.fueraDelCorte ? t('fueraDelCorte') : null,
  ].filter(Boolean).join(' · ');

  return (
    <span title={detalle}>
      <StatusPill
        state={vencida ? 'danger' : 'active'}
        label={vencida ? t('vencidaEl', { fecha: cuando }) : t('hasta', { fecha: cuando })}
      />
    </span>
  );
}

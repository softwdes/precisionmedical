'use client';

/**
 * "Este es el correo del esposo" — el cartel debajo del contacto compartido.
 *
 * Es la mitad VISIBLE del vínculo familiar, y la idea es de Erick (2026-09-02).
 * Sin esto, cualquiera que abra la ficha en tres meses ve un correo que no es
 * del paciente y saca una de dos conclusiones equivocadas: que está mal cargado
 * —y lo "corrige"— o que ese paciente lee ese buzón. El cartel hace que el dato
 * se explique solo, y eso es lo que hace que la gente le crea a la ficha.
 *
 * Se renderiza del VÍNCULO, no de una copia: `Patient.email` sigue siendo el
 * correo propio del paciente (muchas veces null) y lo que se muestra acá sale de
 * `contactOwner`. Ver el comentario de esos campos en el schema.
 *
 * ⚠️ Un vínculo SIN autorización se marca distinto. No es un detalle legal
 * abstracto: significa que nadie confirmó que el dueño del canal acepte recibir
 * la información de este paciente, y quien esté por mandarle un mensaje tiene
 * que verlo antes de apretar enviar.
 */

import { useTranslations } from 'next-intl';
import { Users, ShieldAlert } from 'lucide-react';

export interface ContactoCompartido {
  contactRelation: string | null;
  sharesEmail: boolean;
  sharesPhone: boolean;
  contactAuthorizedAt: Date | string | null;
  contactOwner: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
}

/** Qué canal está mostrando la fila donde se cuelga el cartel. */
type Canal = 'EMAIL' | 'PHONE';

interface Props {
  patient: ContactoCompartido | null | undefined;
  canal: Canal;
}

export function ContactoCompartidoNota({ patient, canal }: Props) {
  const t = useTranslations('phoenix.patients');

  if (!patient?.contactOwner) return null;
  // Solo se avisa en el canal que de verdad se comparte.
  if (canal === 'EMAIL' && !patient.sharesEmail) return null;
  if (canal === 'PHONE' && !patient.sharesPhone) return null;

  const dueño = `${patient.contactOwner.firstName} ${patient.contactOwner.lastName}`.trim();
  const parentesco = patient.contactRelation
    ? t(`relation.${patient.contactRelation}`)
    : t('relation.OTHER');
  const sinAutorizar = !patient.contactAuthorizedAt;

  return (
    <div className="mt-1 flex items-start gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
        <Users className="w-2.5 h-2.5 shrink-0" />
        {canal === 'EMAIL'
          ? t('sharedFromEmail', { dueño, parentesco })
          : t('sharedFromPhone', { dueño, parentesco })}
      </span>
      {sinAutorizar && (
        <span
          className="inline-flex items-center gap-1 rounded border border-amber/30 bg-amber/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber"
          title={t('sharedNotAuthorizedHint')}
        >
          <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
          {t('sharedNotAuthorized')}
        </span>
      )}
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { CalendarCheck, UserPlus, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';

/**
 * El referido llegó: ¿cómo lo damos de alta?
 *
 * Erick, 2026-09-14: al apretar "Crear" en el mensaje del bufete, antes de
 * cualquier formulario hay que elegir el camino. Los dos existían por separado
 * en la pantalla de Pacientes; acá se ofrecen juntos y **precargados con lo que
 * mandó el bufete** — cliente, accidente, y el bufete y el abogado que refirieron.
 *
 *  · **Caso y cita** — el alta de tres pasos, que termina agendando. Es el
 *    camino cuando se va a atender a la persona y ya se sabe cuándo.
 *  · **Registro rápido** — lo mínimo para que el paciente exista, sin cita. Es
 *    el camino cuando hay que guardar el referido ahora y agendar después.
 *
 * Los dos terminan en el MISMO alta (`POST /api/admin/cases`) y los dos marcan
 * el referido como creado: lo que cambia es cuánto se llena en el momento, no
 * qué queda en la base.
 *
 * El diálogo no decide nada por su cuenta — solo elige. Quien lo abre resuelve
 * el referido y arma la precarga.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nombre del cliente referido, para que se vea a quién se está dando de alta. */
  clientName: string;
  /** Bufete que refirió — el dato que hace que este alta no sea una cualquiera. */
  firmName: string | null;
  onCasoYCita: () => void;
  onRegistroRapido: () => void;
}

export function ReferralChoiceDialog({
  open, onOpenChange, clientName, firmName, onCasoYCita, onRegistroRapido,
}: Props) {
  const t = useTranslations('phoenix.messaging');

  const opciones = [
    {
      key: 'full',
      icon: CalendarCheck,
      tone: 'text-brand-text',
      bg: 'bg-brand/10',
      title: t('refChoiceFullTitle'),
      desc: t('refChoiceFullDesc'),
      onClick: onCasoYCita,
    },
    {
      key: 'quick',
      icon: UserPlus,
      tone: 'text-emerald',
      bg: 'bg-emerald/10',
      title: t('refChoiceQuickTitle'),
      desc: t('refChoiceQuickDesc'),
      onClick: onRegistroRapido,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border">
          <DialogTitle className="text-text-1 text-base font-semibold">
            {t('refChoiceTitle', { name: clientName })}
          </DialogTitle>
          <p className="text-[12px] text-text-muted pt-1">
            {firmName ? t('refChoiceFrom', { firm: firmName }) : t('refChoiceSubtitle')}
          </p>
        </DialogHeader>

        {/* Una columna siempre: son dos opciones largas de leer, y en el teléfono
            dos tarjetas lado a lado no entran sin cortar el texto. */}
        <div className="px-4 sm:px-6 py-4 flex flex-col gap-2">
          {opciones.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => { onOpenChange(false); o.onClick(); }}
                className="group flex items-center gap-3 rounded-md bg-bg-2/40 hover:bg-white/5 px-3 py-3 text-left transition-colors"
              >
                <span className={`shrink-0 w-9 h-9 rounded-md ${o.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${o.tone}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-1">{o.title}</span>
                  <span className="block text-[12px] text-text-muted">{o.desc}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-1 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Lo que cargó el bufete no se pierde por elegir el camino corto: es la
            duda que tiene todo el que ve dos botones y no sabe qué deja afuera. */}
        <div className="px-4 sm:px-6 pb-4">
          <p className="rounded-md bg-bg-2/40 px-3 py-2 text-[11px] text-text-muted">
            {t('refChoiceNote')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

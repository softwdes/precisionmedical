'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserPlus, ArrowRight } from 'lucide-react';
import { ReferralDialog } from './referral-dialog';

/**
 * Portal Legal · Vigía · la tarjeta "¿Tenés un referido?".
 *
 * Va debajo de la caja de preguntar y antes del aviso del día: es el lugar que
 * el ojo del abogado ya cruzó, y no compite con lo urgente de más abajo. Es la
 * única mancha con degradado de la pantalla a propósito — es la acción que le
 * pedimos, no un dato que le mostramos.
 *
 * Los dos números (enviados · con caso) son el estado de lo que mandó: si un
 * referido lleva días pendiente, acá se ve sin abrir la bandeja.
 */
export function ReferralCta({ firmName, attorneyName, pendientes, creados }: {
  firmName: string;
  attorneyName: string | null;
  pendientes: number;
  creados: number;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  return (
    <>
      <div className="rounded-lg bg-gradient-brand p-[1px] shadow-glow">
        <div className="rounded-lg bg-bg-1 px-5 py-4 flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-brand-text" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-text-1 font-semibold">{t('refCtaTitle')}</p>
            <p className="text-[12.5px] text-text-2">{t('refCtaSub')}</p>
            {(pendientes > 0 || creados > 0) && (
              <button
                type="button"
                onClick={() => router.push('/attorney/messages')}
                className="mt-1 text-[11px] text-text-muted hover:text-text-1 transition-colors"
              >
                {t('refCtaStatus', { pendientes, creados })}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-gradient-brand text-white font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
          >
            {t('refCtaButton')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ReferralDialog
        open={abierto}
        onClose={() => setAbierto(false)}
        firmName={firmName}
        attorneyName={attorneyName}
        onSent={() => router.refresh()}
      />
    </>
  );
}

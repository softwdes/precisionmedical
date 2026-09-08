'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';
import { ReferralDialog } from './vigia/referral-dialog';

/**
 * Portal Legal · botón flotante "Referir un cliente", solo en el teléfono.
 *
 * La barra inferior tiene cuatro lugares y el menú; el referido no entra ahí
 * sin sacar algo que el abogado usa. El flotante vive encima de la barra, en
 * todas las pantallas del portal, y abre el formulario directo — la LISTA de
 * referidos queda en el menú lateral. En escritorio no se dibuja: ahí el ítem
 * del menú, con relleno, ya es la puerta.
 */
export function ReferralFab({ firmName, attorneyName }: {
  firmName: string;
  attorneyName: string | null;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [abierto, setAbierto] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={t('refCtaButton')}
        title={t('refCtaButton')}
        className="md:hidden fixed right-4 bottom-20 z-40 w-14 h-14 rounded-full bg-gradient-brand shadow-glow text-white flex items-center justify-center active:scale-95 transition-transform"
      >
        <UserPlus className="w-6 h-6" />
      </button>
      <ReferralDialog open={abierto} onClose={() => setAbierto(false)} firmName={firmName} attorneyName={attorneyName} />
    </>
  );
}

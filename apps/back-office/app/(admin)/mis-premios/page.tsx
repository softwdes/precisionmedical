/**
 * Mis premios — el avance de cada participante en los Premios del Staff.
 *
 * La pantalla pide sus datos a `/api/premios/mio`. Acá no se filtra por
 * participación: quien no juega este mes ve el aviso de la propia pantalla, no
 * un redirect, para que un link guardado explique por qué no hay nada.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MisPremiosClient } from '@/components/premios/mis-premios-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('rewards') };
}

export default function MisPremiosPage(): React.ReactElement {
  return <MisPremiosClient />;
}

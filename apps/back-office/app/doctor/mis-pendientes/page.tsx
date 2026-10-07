/**
 * Mis pendientes dentro del portal médico.
 *
 * Es la misma pantalla que `/mis-pendientes` del back-office: el middleware manda
 * a los doctores a `/doctor/*` y nunca llegarían a la otra. Los datos salen de la
 * misma API, que devuelve solo lo de quien pregunta.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MisPendientesClient } from '@/components/pendientes/mis-pendientes-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('pendientes') };
}

export default function DoctorMisPendientesPage(): React.ReactElement {
  return <MisPendientesClient />;
}

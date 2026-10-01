/**
 * Mis premios dentro del portal médico.
 *
 * Es la misma pantalla que `/mis-premios` del back-office: un provider también
 * puede participar de los Premios del Staff (Erick, 2026-09-30: Devin), pero el
 * middleware manda a los doctores a `/doctor/*` y nunca llegarían a la otra.
 * Los datos salen de la misma API (`/api/premios/mio`), que devuelve solo lo de
 * quien pregunta.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MisPremiosClient } from '@/components/premios/mis-premios-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('rewards') };
}

export default function DoctorMisPremiosPage(): React.ReactElement {
  return <MisPremiosClient />;
}

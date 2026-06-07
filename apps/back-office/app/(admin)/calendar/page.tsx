/**
 * B.10-B.11 — Calendario compartido
 *
 * Server component: carga datos iniciales (clínicas + providers) para los
 * filtros del calendario. Las citas se cargan client-side via API para
 * permitir navegación semana/mes sin full page reload.
 */

import { db } from '@precision-medical/database';
import { CalendarClient } from './calendar-client';

export const metadata = { title: 'Calendario · LienMaster' };

export default async function CalendarPage() {
  const [clinics, providers] = await Promise.all([
    db.clinic.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.provider.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);

  return <CalendarClient clinics={clinics} providers={providers} />;
}

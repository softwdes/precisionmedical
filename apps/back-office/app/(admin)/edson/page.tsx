/**
 * B.12 — Vista de tracking de Edson
 *
 * Réplica del Excel "New MVA Tracking - 1st Appointment ONLY!": una fila por
 * caso MVA, mostrando SOLO su primera cita. Reemplaza la bandeja anterior de
 * dos tabs (pre-visita / cobranzas), que era de solo lectura.
 *
 * Las filas se piden por API (`/api/admin/edson/tracking`) porque el filtrado,
 * el orden y la paginación son server-side. Acá solo se cargan los catálogos
 * para los selectores, que son chicos y no cambian entre páginas.
 *
 * Ver docs/plan-vista-edson.md
 */

import { EdsonClient } from './edson-client';
import { db } from '@precision-medical/database';

export const metadata = { title: 'Tracking MVA · Precision Medical' };

export default async function EdsonPage() {
  const [clinics, providers, carriers] = await Promise.all([
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    db.provider.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    // Solo las aseguradoras que de verdad aparecen en algún caso: el catálogo
    // tiene 269 y un selector con todas es inservible.
    db.insuranceCarrier.findMany({
      where: {
        deletedAt: null,
        OR: [
          { casesAsPrimary: { some: { deletedAt: null, caseType: 'MVA' } } },
          { caseAutoInsurances: { some: {} } },
        ],
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortCode: true, color: true },
    }),
  ]);

  return (
    <EdsonClient
      clinics={clinics}
      providers={providers.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
      }))}
      carriers={carriers}
    />
  );
}

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

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EdsonClient } from './edson-client';
import { db } from '@precision-medical/database';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('trackingMva') };
}

export default async function EdsonPage() {
  const [clinics, providers, carriers, lawyers, chiros] = await Promise.all([
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
    // Personas, no bufetes: la columna Attorney muestra al abogado a cargo.
    // Los bufetes son filas de `lawyers` con `firmName` y sin nombre propio.
    db.lawyer.findMany({
      where: { deletedAt: null, firstName: { not: null } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    /*
     * Sugerencias del quiropractico. No hay catalogo —el dato viene escrito en
     * el formulario de admision— asi que la lista se arma con lo YA usado,
     * ordenado por frecuencia. Se acota a 40: es un autocompletado para no
     * escribir "Cascade Chiropractic" de cero cada vez, no un catalogo.
     */
    db.$queryRaw<{ name: string }[]>`
      SELECT name, COUNT(*) AS n FROM (
        SELECT NULLIF(TRIM(ct."chiroReferral"), '') AS name
          FROM case_tracking ct WHERE ct."chiroReferral" IS NOT NULL
        UNION ALL
        SELECT NULLIF(TRIM(c."consentsData" ->> 'chiropractor'), '') AS name
          FROM cases c WHERE c."consentsData" ->> 'chiropractor' IS NOT NULL
      ) t
      WHERE name IS NOT NULL
      GROUP BY name ORDER BY COUNT(*) DESC, name ASC LIMIT 40
    `,
  ]);

  return (
    <EdsonClient
      clinics={clinics}
      providers={providers.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
      }))}
      carriers={carriers}
      lawyers={lawyers.map((l) => ({
        id: l.id,
        name: `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim(),
      }))}
      chiroOptions={chiros.map((c) => c.name)}
    />
  );
}

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

/**
 * Providers que ALGUNA VEZ atendieron una primera visita MVA.
 *
 * El selector de providers listaba los 9 activos y tres de ellos no pueden
 * producir ni una fila acá: esta vista muestra la PRIMERA cita de cada caso
 * MVA, y elegirlos devolvía siempre "sin resultados". Edson los tachó sobre
 * una captura el 2026-10-02.
 *
 * No es una lista de nombres: es la misma idea que ya se le aplica a las
 * aseguradoras unas líneas más abajo —"solo las que de verdad aparecen en
 * algún caso"— y por eso se mantiene sola. El día que Scott Rigdon tome una
 * primera visita MVA, aparece; si se suma un provider nuevo, aparece con su
 * primer caso. Nadie tiene que acordarse de editar nada.
 *
 * Medido el 2026-10-02, y la separación es limpia, sin umbral que elegir:
 *   Loder 394 · Barry Clanton 315 · Gay 142 · Miller 79 · Nielsen 75 · Broadhead 61
 *   Rigdon 0 · Devin Clanton 0 · Stouffer 0
 * Rigdon es el interesante: tiene 33 citas MVA y 8 en los últimos 90 días,
 * pero NINGUNA es una primera visita — solo hace controles. Por eso un filtro
 * por "tiene citas MVA" no alcanzaba y hay que mirar la primera de cada caso.
 *
 * Sin ventana de tiempo a propósito: con una, la lista cambiaría según el
 * rango de fechas que Edson tenga puesto, y un provider desaparecería del
 * selector justo cuando abre el rango para ir a buscarlo.
 */
async function providersConPrimeraVisitaMva(): Promise<Set<string>> {
  /*
   * `LATERAL ... LIMIT 1` y no `DISTINCT ON (cs.id)`, que es la otra forma de
   * escribir "la primera cita de cada caso". Medido contra la base el
   * 2026-10-02, cuatro corridas en caliente cada uno:
   *   DISTINCT ON  302, 227, 214, 208 ms  →  1072 filas (una por caso)
   *   LATERAL      237, 155, 153, 155 ms  →  7 filas
   * Más rápido y, sobre todo, trae 7 filas en vez de 1072 para contestar algo
   * que son 7 ids. Es el mismo `JOIN LATERAL` que ya usa la ruta de tracking
   * para resolver la primera cita.
   */
  const filas = await db.$queryRaw<{ providerId: string | null }[]>`
    SELECT DISTINCT pr."providerId"
    FROM cases cs
    CROSS JOIN LATERAL (
      SELECT a."providerId"
      FROM appointments a
      WHERE a."caseId" = cs.id AND a."deletedAt" IS NULL
      ORDER BY a."scheduledFor" ASC
      LIMIT 1
    ) pr
    WHERE cs."deletedAt" IS NULL AND cs."caseType" = 'MVA'
  `;
  return new Set(filas.map(f => f.providerId).filter((id): id is string => !!id));
}

export default async function EdsonPage() {
  const [clinics, providers, carriers, lawyers, firms, chiros, conFilas] = await Promise.all([
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
     * Los BUFETES, que son la otra mitad de la columna Attorney: la celda
     * muestra `attorneyName ?? firmName`, así que en la mayoría de las filas lo
     * que se lee es el bufete.
     *
     * Hacen falta acá porque un caso SIN bufete no tiene dónde colgar al
     * abogado —`quick-create-member` exige uno existente— y eran 86 casos en la
     * cola el 2026-10-01. Con esto la celda primero resuelve el bufete y recién
     * después ofrece la persona.
     *
     * Son 26 y entran enteros en el selector; no hace falta el recorte que sí
     * se le hace a las aseguradoras.
     */
    db.lawyer.findMany({
      where: { deletedAt: null, entityType: 'FIRM' },
      orderBy: { firmName: 'asc' },
      select: { id: true, firmName: true },
    }),
    /*
     * Sugerencias del quiropractico. Desde el 2026-09-20 SI hay catalogo
     * (`referral_partners`), y la lista sale de ahi.
     *
     * Antes se armaba con lo ya escrito, ordenado por frecuencia: servia para
     * no teclear "Cascade Chiropractic" de cero, pero cada variante nueva
     * entraba a la lista y se ofrecia como si fuera un lugar mas — por eso
     * "Axcess", "Axcess Referral" y "Axcess AF Referral" convivian. El catalogo
     * arranco cargado con esos mismos nombres, asi que no se pierde ninguno; lo
     * que cambia es que ahora se pueden fusionar.
     */
    db.referralPartner.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { name: true },
    }),
    providersConPrimeraVisitaMva(),
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
      firms={firms.map((f) => ({ id: f.id, name: f.firmName ?? '—' }))}
      /* Solo para el SELECTOR. La celda sigue ofreciendo los 9: asignar una
         primera visita a quien todavía no tuvo ninguna es justo como deja de
         tener cero. */
      providersFiltro={providers.filter((p) => conFilas.has(p.id)).map((p) => p.id)}
      chiroOptions={chiros.map((c) => c.name)}
    />
  );
}

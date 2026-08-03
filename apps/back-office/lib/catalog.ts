/**
 * Lectura del catálogo de precios (labs · inyectables · servicios · férulas).
 *
 * Se usa $queryRaw porque el cliente de Prisma todavía no conoce CatalogItem
 * (mismo patrón que VisitServiceCode). Al regenerar el cliente se puede migrar
 * a db.catalogItem sin tocar los consumidores.
 */

import { db, Prisma } from '@precision-medical/database';

export type CatalogKind = 'LAB' | 'INJECTION' | 'SERVICE' | 'DME';
export type PriceStatus = 'VERIFIED' | 'UNVERIFIED' | 'UPDATE_REQUESTED';

export interface CatalogRow {
  id: number;
  kind: CatalogKind;
  code: string;
  name: string;
  category: string | null;
  section: string | null;
  vendor: string;
  costPrice: number | null;
  publicPrice: number | null;
  memberPrice: number | null;
  priceNote: string | null;
  unitLabel: string | null;
  hasReflex: boolean;
  reflexCost: number | null;
  reflexPrice: number | null;
  reflexPolicy: string | null;
  tubeColors: string[];
  containerType: string | null;
  specialHandling: string | null;
  sizeLabel: string | null;
  alwaysFullPayment: boolean;
  cptCode: string | null;
  hcpcsCode: string | null;
  ndcCode: string | null;
  priceStatus: PriceStatus;
  priceVerifiedAt: Date | null;
  priceVerifiedBy: string | null;
  isActive: boolean;
  isOrderable: boolean;
  replacedByCode: string | null;
  notes: string | null;
}

/** Numeric → float8 para que salga como number y no como Prisma.Decimal. */
export const CATALOG_COLS = Prisma.sql`
  id, kind, code, name, category, section, vendor,
  "costPrice"::float8   AS "costPrice",
  "publicPrice"::float8 AS "publicPrice",
  "memberPrice"::float8 AS "memberPrice",
  "priceNote", "unitLabel",
  "hasReflex",
  "reflexCost"::float8  AS "reflexCost",
  "reflexPrice"::float8 AS "reflexPrice",
  "reflexPolicy",
  "tubeColors", "containerType", "specialHandling",
  "sizeLabel", "alwaysFullPayment",
  "cptCode", "hcpcsCode", "ndcCode",
  "priceStatus", "priceVerifiedAt", "priceVerifiedBy",
  "isActive", "isOrderable", "replacedByCode", notes
`;

/**
 * Quién puede mantener el catálogo de precios.
 *
 * Decisión de Erick (2026-08-03): los doctores también editan, no solo admin —
 * la clínica necesita controlar esta información desde el portal médico, que es
 * el punto de sacarlos del Excel. El resto del staff solo consulta.
 */
export function canEditCatalog(role: string | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'DOCTOR' || role === 'PROVIDER';
}

export async function listCatalog(): Promise<CatalogRow[]> {
  return db.$queryRaw<CatalogRow[]>`
    SELECT ${CATALOG_COLS}
    FROM "catalog_items"
    WHERE "deletedAt" IS NULL
    ORDER BY kind, name
  `;
}

export async function findCatalogItem(id: number): Promise<CatalogRow | null> {
  const [row] = await db.$queryRaw<CatalogRow[]>`
    SELECT ${CATALOG_COLS} FROM "catalog_items" WHERE id = ${id} AND "deletedAt" IS NULL
  `;
  return row ?? null;
}

/** Serializa fechas para pasar del server component al client component. */
export function serializeCatalog(rows: CatalogRow[]): Array<Omit<CatalogRow, 'priceVerifiedAt'> & { priceVerifiedAt: string | null }> {
  return rows.map((r) => ({ ...r, priceVerifiedAt: r.priceVerifiedAt?.toISOString() ?? null }));
}

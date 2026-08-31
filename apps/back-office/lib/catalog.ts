/**
 * Lectura del catálogo de precios (labs · inyectables · servicios · férulas).
 *
 * Se usa $queryRaw porque el cliente de Prisma todavía no conoce CatalogItem
 * (mismo patrón que VisitServiceCode). Al regenerar el cliente se puede migrar
 * a db.catalogItem sin tocar los consumidores.
 */

import { db } from '@precision-medical/database';
import { canViewAsDoctor } from './get-session-provider';

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

/**
 * String plano, NO `Prisma.sql`.
 *
 * Interpolar un fragmento `Prisma.sql` dentro de un tagged template de
 * `$queryRaw` depende de un `instanceof Prisma.Sql`, y en `next dev` eso falla:
 * Next carga `@prisma/client` en capas de módulo separadas (RSC y route
 * handler), así que el fragmento creado en una capa no es "un Sql" para la
 * otra. Y cuando falla no tira error — pasa el fragmento como PARÁMETRO, la
 * consulta queda en `SELECT $1 FROM catalog_items` y devuelve una sola columna
 * `?column?` con el texto del SQL adentro. En Vercel no pasa (un solo bundle),
 * así que es un bug que aparece solo en local y de forma intermitente.
 *
 * Con un string y `$queryRawUnsafe` no hay instanceof de por medio y se
 * comporta igual en dev y en prod. Sin riesgo de inyección: esto es una
 * constante del código y el único valor variable viaja como parámetro ($1).
 *
 * Numeric → float8 para que salga como number y no como Prisma.Decimal.
 */
const CATALOG_SELECT = `
  SELECT
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
  FROM "catalog_items"
  WHERE "deletedAt" IS NULL
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

/**
 * La versión que hay que usar: contempla además la capacidad "ver como doctor".
 *
 * `canEditCatalog` mira solo el rol de la fila del usuario, y eso dejaba afuera
 * a quien opera el portal médico con la capacidad concedida por persona
 * (`clinicModules.doctor`): entraba al portal, veía el catálogo y le salía de
 * solo lectura. Si alguien está haciendo el trabajo de un doctor ahí adentro,
 * mantener el catálogo es parte de ese trabajo — es justamente el punto de
 * sacarlo del Excel.
 *
 * Vive acá y no en cada pantalla porque la regla la aplican DOS lugares —la
 * página y el endpoint que guarda— y separarlos daría un botón que falla al
 * apretarlo. `canViewAsDoctor` ya incluye a SUPER_ADMIN/ADMIN y está memorizada
 * por request, así que no agrega consultas.
 */
export async function canEditCatalogFor(
  email: string | null | undefined,
  role: string | null | undefined,
): Promise<boolean> {
  if (canEditCatalog(role)) return true;
  if (!email) return false;
  return canViewAsDoctor(email);
}

export async function listCatalog(): Promise<CatalogRow[]> {
  return db.$queryRawUnsafe<CatalogRow[]>(`${CATALOG_SELECT} ORDER BY kind, name`);
}

export async function findCatalogItem(id: number): Promise<CatalogRow | null> {
  const [row] = await db.$queryRawUnsafe<CatalogRow[]>(`${CATALOG_SELECT} AND id = $1`, id);
  return row ?? null;
}

// ─── Servicios con código de seguro (service_codes) ─────────────────────────
//
// Regla de negocio (Erick, 2026-08-03): los servicios CON código son para
// pacientes CON seguro; el catálogo cash (catalog_items) es para los que no
// tienen. Son dos precios del mismo servicio, no dos catálogos rivales.
//
// Se LEE en vivo de service_codes, no se copia: hay 349 asignaciones en
// visit_service_codes y el HCFA de Brunella depende de esa tabla. Duplicarla
// crearía dos verdades divergentes.

export interface InsuranceServiceRow {
  id: string;
  code: string;
  type: string; // 'CPT' | 'HCPCS' | 'CUSTOM_PM'
  category: string;
  shortDescription: string;
  longDescription: string | null;
  /** Lo que se le factura a la aseguradora. No hay costo real en esta tabla. */
  currentFee: number;
  fiscalYear: number;
  modifiersAllowed: string[];
  isActive: boolean;
  notes: string | null;
}

export async function listInsuranceServices(): Promise<InsuranceServiceRow[]> {
  const rows = await db.serviceCode.findMany({
    where: { deletedAt: null },
    select: {
      id: true, code: true, type: true, category: true,
      shortDescription: true, longDescription: true,
      currentFee: true, fiscalYear: true, modifiersAllowed: true,
      isActive: true, notes: true,
    },
    orderBy: [{ category: 'asc' }, { code: 'asc' }],
  });

  return rows.map((r) => ({
    ...r,
    currentFee: Number(r.currentFee), // Decimal → number para cruzar al cliente
  }));
}

// ─── Lista de precios para mostrador (solo lectura) ─────────────────────────
//
// Payload deliberadamente flaco. Este modal se abre en recepción CON EL
// PACIENTE MIRANDO LA PANTALLA, así que el costo real no viaja al cliente —
// no está oculto por CSS, directamente no se consulta. Tampoco viajan tubo,
// reflex ni notas internas: nada de eso sirve para cotizar.
//
// Solo ítems cotizables: activos, disponibles y con precio cargado. Los 96
// labs arrastrados del v2 sin precio quedan afuera (decisión de Erick) — una
// fila con guión es ruido en una herramienta de cotización.

/** Los cuatro tabs del modal. Coincide con TabKey del catálogo. */
export type PriceListTab = 'LAB' | 'INJECTION_SERVICE' | 'INSURANCE' | 'DME';

export interface PriceListEntry {
  key: string;
  tab: PriceListTab;
  code: string;
  name: string;
  price: number;
  /** "por vista", "por set de labs STAT" */
  unitLabel: string | null;
  /** Talla, solo en férulas. */
  sizeLabel: string | null;
}

/**
 * Ítems cuya "descripción" es el código mismo ("82570" → "82570"). Son 18 en
 * service_codes, basura de la migración del v2. No se pueden cotizar: nadie
 * sabe qué son. Se mandan al final de su tab en vez de ocultarlos, para que
 * quede a la vista que existen y alguien les ponga el nombre real.
 */
function isCodeOnlyName(name: string, code: string): boolean {
  const norm = (s: string): string => s.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return norm(name) === norm(code);
}

/** Nombre real primero (alfabético); los que solo tienen código, al fondo. */
function byNameCodeOnlyLast(a: PriceListEntry, b: PriceListEntry): number {
  const ca = isCodeOnlyName(a.name, a.code) ? 1 : 0;
  const cb = isCodeOnlyName(b.name, b.code) ? 1 : 0;
  if (ca !== cb) return ca - cb;
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
}

export async function listPriceList(): Promise<PriceListEntry[]> {
  const [cash, insurance] = await Promise.all([
    db.$queryRaw<Array<{
      id: number; kind: CatalogKind; code: string; name: string;
      price: number; unitLabel: string | null; sizeLabel: string | null;
    }>>`
      SELECT id, kind, code, name,
             "publicPrice"::float8 AS price,
             "unitLabel", "sizeLabel"
      FROM "catalog_items"
      WHERE "deletedAt" IS NULL
        AND "isActive" AND "isOrderable"
        AND "publicPrice" IS NOT NULL AND "publicPrice" > 0
      ORDER BY name
    `,
    db.serviceCode.findMany({
      where: { deletedAt: null, isActive: true, currentFee: { gt: 0 } },
      select: { id: true, code: true, shortDescription: true, currentFee: true },
      orderBy: { shortDescription: 'asc' },
    }),
  ]);

  const cashEntries: PriceListEntry[] = cash.map((r) => ({
    key: `c${r.id}`,
    tab: (r.kind === 'INJECTION' || r.kind === 'SERVICE'
      ? 'INJECTION_SERVICE'
      : r.kind) as PriceListTab,
    code: r.code,
    name: r.name,
    price: r.price,
    unitLabel: r.unitLabel,
    sizeLabel: r.sizeLabel,
  }));

  const insEntries: PriceListEntry[] = insurance.map((r) => ({
    key: `s${r.id}`,
    tab: 'INSURANCE' as PriceListTab,
    code: r.code,
    name: r.shortDescription,
    price: Number(r.currentFee),
    unitLabel: null,
    sizeLabel: null,
  }));

  // El cliente filtra por tab respetando este orden, así que se ordena acá.
  return [...cashEntries, ...insEntries.sort(byNameCodeOnlyLast)];
}

/** Serializa fechas para pasar del server component al client component. */
export function serializeCatalog(rows: CatalogRow[]): Array<Omit<CatalogRow, 'priceVerifiedAt'> & { priceVerifiedAt: string | null }> {
  return rows.map((r) => ({ ...r, priceVerifiedAt: r.priceVerifiedAt?.toISOString() ?? null }));
}

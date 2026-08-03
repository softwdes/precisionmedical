/**
 * Tipos y helpers compartidos del catálogo de precios.
 * Lo usan la tabla (catalog-client) y el diálogo de edición.
 */

export type CatalogKind = 'LAB' | 'INJECTION' | 'SERVICE' | 'DME';
export type PriceStatus = 'VERIFIED' | 'UNVERIFIED' | 'UPDATE_REQUESTED';

export interface CatalogItem {
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
  priceVerifiedAt: string | null;
  priceVerifiedBy: string | null;
  isActive: boolean;
  isOrderable: boolean;
  replacedByCode: string | null;
  notes: string | null;
}

/**
 * Tabs de la pantalla. Los tres primeros salen del Excel (precio cash, para
 * pacientes SIN seguro); INSURANCE lee service_codes en vivo (pacientes CON
 * seguro). Va entre inyectables y férulas por pedido de Erick.
 */
export type TabKey = 'LAB' | 'INJECTION_SERVICE' | 'INSURANCE' | 'DME';

/** Qué kinds de catalog_items alimentan cada tab. INSURANCE no usa ninguno. */
export const TAB_KINDS: Record<TabKey, CatalogKind[]> = {
  LAB: ['LAB'],
  INJECTION_SERVICE: ['INJECTION', 'SERVICE'],
  INSURANCE: [],
  DME: ['DME'],
};

// ─── Servicios con código de seguro ─────────────────────────────────────────

export interface InsuranceService {
  id: string;
  code: string;
  type: string;
  category: string;
  shortDescription: string;
  longDescription: string | null;
  /** Lo que se factura a la aseguradora. Esta tabla no tiene costo real. */
  currentFee: number;
  fiscalYear: number;
  modifiersAllowed: string[];
  isActive: boolean;
  notes: string | null;
}

/**
 * Descripciones que la migración del v2 dejó rotas por OCR. Dos artefactos:
 * el par "CH" interpolado dentro de las palabras (SPECICMHEN, INSECRHTION) y
 * los dígitos del fee metidos dentro de una palabra (A80N7I.P0U0LATION).
 *
 * No sirve "contiene un dígito": "B9 LES" y "2ND LEVEL" son CPT legítimo. El
 * artefacto real es un token con letras y 3+ dígitos.
 *
 * Aproximada a propósito: erra hacia marcar de más, porque un falso positivo
 * solo cuesta una mirada y un falso negativo deja basura a la vista. Marca 130
 * de 338. La limpieza real necesita un catálogo CPT oficial de referencia.
 */
export function looksMangled(description: string): boolean {
  if (/C[A-Z]H/.test(description)) return true;
  return description
    .split(/\s+/)
    .some((tok) => /[A-Za-z]/.test(tok) && (tok.match(/\d/g) ?? []).length >= 3);
}

/** Umbral bajo el cual el margen se marca en ámbar. */
export const LOW_MARGIN = 1.5;

/** Multiplicador precio público / costo real. Null si falta alguno de los dos. */
export function markup(item: CatalogItem): number | null {
  if (!item.costPrice || item.publicPrice == null) return null;
  return item.publicPrice / item.costPrice;
}

export function marginAmount(item: CatalogItem): number | null {
  if (item.costPrice == null || item.publicPrice == null) return null;
  return item.publicPrice - item.costPrice;
}

export const money = (n: number | null | undefined): string =>
  n == null ? '—' : `$${n.toFixed(2)}`;

/** Antigüedad de la verificación en meses. Null si nunca se verificó. */
export function monthsSinceVerified(item: CatalogItem, now = new Date()): number | null {
  if (!item.priceVerifiedAt) return null;
  const then = new Date(item.priceVerifiedAt);
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

/** Se considera vencido a los 12 meses — LabCorp actualiza su fee schedule al año. */
export const STALE_MONTHS = 12;

export function isStale(item: CatalogItem, now = new Date()): boolean {
  const m = monthsSinceVerified(item, now);
  return m != null && m >= STALE_MONTHS;
}

export const TUBE_COLORS = ['YELLOW', 'LAVENDER', 'LIGHT_BLUE', 'GREEN', 'RED', 'PALE'] as const;

export const TUBE_SWATCH: Record<string, string> = {
  YELLOW: 'bg-amber',
  LAVENDER: 'bg-violet',
  LIGHT_BLUE: 'bg-cyan',
  GREEN: 'bg-emerald',
  RED: 'bg-rose',
  PALE: 'bg-text-muted',
};

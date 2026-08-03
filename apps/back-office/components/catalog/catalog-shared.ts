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

/** Los tres tabs de la pantalla. El Excel agrupa inyectables y servicios juntos. */
export type TabKey = 'LAB' | 'INJECTION_SERVICE' | 'DME';

export const TAB_KINDS: Record<TabKey, CatalogKind[]> = {
  LAB: ['LAB'],
  INJECTION_SERVICE: ['INJECTION', 'SERVICE'],
  DME: ['DME'],
};

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

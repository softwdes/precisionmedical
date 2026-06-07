/**
 * @precision-medical/back-office/ui-phoenix
 *
 * Primitivos UI compartidos para todas las pantallas del back-office.
 * Fuente de verdad — NO redefinir estos componentes localmente en pantallas.
 *
 * Origen del estilo: B.36 Specialties · alineado con apps/web (admin) prod.
 *
 * Cuando agregues una pantalla nueva, importá desde acá:
 *   import { PageHeader, KpiCard, FilterPill, DataTable, IconAction } from '@/components/ui-phoenix';
 *
 * Si necesitás un átomo nuevo que pueda ser reutilizado por más de una pantalla,
 * AGREGALO AQUÍ — no inline en la pantalla.
 *
 * Ver README.md para convenciones de tokens (tamaños, paddings, colores).
 */

export { PageHeader } from './page-header';
export type { PageHeaderProps } from './page-header';

export { KpiCard } from './kpi-card';
export type { KpiCardProps } from './kpi-card';

export { FilterPill } from './filter-pill';
export type { FilterPillProps } from './filter-pill';

export { IconAction } from './icon-action';
export type { IconActionProps } from './icon-action';

export { StatusPill, TagPill } from './status-pill';
export type { StatusPillProps, TagPillProps, StatusState } from './status-pill';

export { DataTable } from './data-table';

export { TableFooter } from './table-footer';
export type { TableFooterProps } from './table-footer';

export { EmptyState } from './empty-state';

export { EntityAvatar } from './entity-avatar';
export type { EntityAvatarProps } from './entity-avatar';

export { PersonAvatar } from './person-avatar';
export type { PersonAvatarProps } from './person-avatar';

export { Skeleton } from './skeleton';

export { FormField } from './form-field';

export { InfoCard, InfoRow } from './info-card';
export type { InfoCardProps } from './info-card';

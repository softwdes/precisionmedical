/**
 * Admin · Catálogo de precios (labs · inyectables y servicios · férulas)
 *
 * Punto de mantenimiento canónico. Reemplaza el Excel "LabCorp Lab Pricing".
 */

import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from '@/lib/session';
import { listCatalog, serializeCatalog, canEditCatalog } from '@/lib/catalog';
import { CatalogClient } from '@/components/catalog/catalog-client';

export const metadata = { title: 'Catálogo de precios' };

export default async function AdminCatalogPage(): Promise<React.ReactElement> {
  const [rows, user] = await Promise.all([listCatalog(), getSessionUser()]);
  const role = user?.email ? await fetchDbRole(user.email) : null;

  return <CatalogClient items={serializeCatalog(rows)} canEdit={canEditCatalog(role)} />;
}

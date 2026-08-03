/**
 * Portal Médico · Catálogo de precios (labs · inyectables y servicios · férulas)
 *
 * El doctor consulta precios y datos de muestra al ordenar. El mantenimiento
 * es de admin — mismo componente, `canEdit` lo decide el rol.
 */

import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from '@/lib/session';
import { listCatalog, serializeCatalog } from '@/lib/catalog';
import { CatalogClient } from '@/components/catalog/catalog-client';

export const metadata = { title: 'Laboratorios y precios · Portal Médico' };

export default async function DoctorCatalogPage(): Promise<React.ReactElement> {
  const [rows, user] = await Promise.all([listCatalog(), getSessionUser()]);
  const role = user?.email ? await fetchDbRole(user.email) : 'DOCTOR';
  const canEdit = role === 'SUPER_ADMIN' || role === 'ADMIN';

  return <CatalogClient items={serializeCatalog(rows)} canEdit={canEdit} />;
}

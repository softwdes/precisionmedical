/**
 * Portal Médico · Catálogo de precios (labs · inyectables y servicios · férulas)
 *
 * El doctor consulta precios y datos de muestra al ordenar, y también los
 * mantiene — mismo componente que /admin/catalog, `canEdit` lo decide el rol.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from '@/lib/session';
import {
  listCatalog, listInsuranceServices, serializeCatalog, canEditCatalogFor,
} from '@/lib/catalog';
import { CatalogClient } from '@/components/catalog/catalog-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('labsAndPrices') };
}

export default async function DoctorCatalogPage(): Promise<React.ReactElement> {
  const [rows, services, user] = await Promise.all([
    listCatalog(),
    listInsuranceServices(),
    getSessionUser(),
  ]);
  const role = user?.email ? await fetchDbRole(user.email) : 'DOCTOR';
  // Contempla la capacidad por persona, no solo el rol — ver `canEditCatalogFor`.
  const puedeEditar = await canEditCatalogFor(user?.email, role);

  return (
    <CatalogClient
      items={serializeCatalog(rows)}
      services={services}
      canEdit={puedeEditar}
    />
  );
}

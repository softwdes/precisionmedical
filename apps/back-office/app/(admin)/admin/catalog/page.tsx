/**
 * Admin · Catálogo de precios (labs · inyectables y servicios · férulas)
 *
 * Punto de mantenimiento canónico. Reemplaza el Excel "LabCorp Lab Pricing".
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
  return { title: t('catalogPrices') };
}

export default async function AdminCatalogPage(): Promise<React.ReactElement> {
  const [rows, services, user] = await Promise.all([
    listCatalog(),
    listInsuranceServices(),
    getSessionUser(),
  ]);
  const role = user?.email ? await fetchDbRole(user.email) : null;
  // Misma regla que el portal y que el endpoint: dividirla por pantalla daria
  // una vista de solo lectura sobre un permiso que el API si concede.
  const puedeEditar = await canEditCatalogFor(user?.email, role);

  return (
    <CatalogClient
      items={serializeCatalog(rows)}
      services={services}
      canEdit={puedeEditar}
    />
  );
}

/**
 * Admin · Catálogo de precios (labs · inyectables y servicios · férulas)
 *
 * Reemplaza el Excel "LabCorp Lab Pricing".
 *
 * ─── Esta ruta NO es la puerta de entrada, y aun así se queda ───────────────
 *
 * Hasta el 2026-09-09 no estaba enlazada desde ningún lado —ni menú, ni
 * Configuración, ni un link— así que solo llegaba quien se sabía la URL: el
 * staff del back-office terminaba mirando los precios desde el portal del
 * provider. Ahora la puerta visible es Configuración → "Labs y precios".
 *
 * Se deja viva a propósito: los tabs de Configuración son estado interno y no
 * tienen dirección propia, así que ésta es la ÚNICA URL enlazable del catálogo
 * — la que se pega en un mensaje o se guarda en favoritos.
 *
 * El tab hace lo mismo que esta página pero contra `GET /api/admin/catalog`,
 * porque allá se carga bajo demanda. Ver el comentario largo en
 * `app/doctor/settings/labs/page.tsx`, que lista los tres puntos de montaje.
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

/**
 * Portal Médico · Configuración · Laboratorios (catálogo de precios: labs · inyectables y servicios · férulas)
 *
 * Vive bajo `/doctor/settings/labs` desde 2026-09-05. Antes era `/doctor/catalog`,
 * que **se borró sin dejar redirect**: ese link hoy da 404. Este comentario decía
 * "que redirige" y era falso — no hay redirect ni en `next.config` ni en el
 * middleware (verificado el 2026-09-09).
 *
 * El doctor consulta precios y datos de muestra al ordenar, y también los
 * mantiene. `canEdit` lo decide el rol, no la pantalla.
 *
 * ─── Los TRES lugares que montan este mismo `CatalogClient` ─────────────────
 *
 *   · `/doctor/settings/labs`  — acá, el portal médico (server component).
 *   · `/admin/catalog`         — back-office (server component). Es la única URL
 *                                enlazable del catálogo, porque los tabs de
 *                                Configuración son estado interno y no tienen
 *                                dirección propia. Por eso se deja viva.
 *   · Configuración → "Labs y precios" — el tab del back-office, que carga bajo
 *                                demanda contra `GET /api/admin/catalog`.
 *
 * Si cambia el contrato de `CatalogClient`, son tres. Los dos server components
 * arman los props con `listCatalog` + `listInsuranceServices` + `serializeCatalog`;
 * el tab los recibe ya armados desde esa ruta, que hace exactamente lo mismo.
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

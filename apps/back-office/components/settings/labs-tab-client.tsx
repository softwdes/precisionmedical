'use client';

/**
 * LabsTabClient — el catálogo de precios dentro de Configuración.
 *
 * ─── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El catálogo ya vivía en dos lados: `/admin/catalog` (back-office) y
 * `/doctor/settings/labs` (portal médico), los dos montando el MISMO
 * `CatalogClient`. Pero el del back-office **no estaba enlazado desde ningún
 * lado**: existía la ruta y solo se llegaba escribiendo la URL a mano. Quien
 * administra la clínica veía los precios únicamente si se metía al portal del
 * provider (Erick, 2026-09-09).
 *
 * ─── Por qué carga bajo demanda y no desde el server de /settings ───────────
 *
 * Son ~670 ítems más ~390 servicios con código de seguro. La página de
 * Configuración ya trae clínicas, especialidades, providers, bufetes,
 * aseguradoras, ajustadores y servicios de una sola vez; sumarle mil filas más
 * se lo cobraría a TODA persona que entra a mirar Clínicas, que es el tab por
 * defecto. Acá se pide al abrir el tab, con el mismo patrón que Escritorios y
 * Novedades, que ya se cargan solos en esta misma pantalla.
 *
 * ─── Los dos permisos, que no son el mismo ──────────────────────────────────
 *
 * VER el tab lo gobierna el módulo `settings` (si estás en esta pantalla, ya
 * pasaste). EDITAR lo decide `canEdit`, que llega del server con el MISMO
 * criterio que aplica `requireEditor()` en las rutas de escritura — así el
 * botón que se ofrece es exactamente el que el server va a aceptar.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Loader2 } from 'lucide-react';
import { CatalogClient } from '@/components/catalog/catalog-client';

/** Lo que devuelve `GET /api/admin/catalog`. */
type Respuesta = React.ComponentProps<typeof CatalogClient>;

export function LabsTabClient(): React.ReactElement {
  const t = useTranslations('phoenix.settings');
  const [datos, setDatos] = React.useState<Respuesta | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    fetch('/api/admin/catalog')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Respuesta) => { if (vivo) setDatos(d); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, []);

  if (error) {
    return (
      <div className="px-4 sm:px-6 pb-6">
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2.5 text-[12px] text-rose flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {t('labsLoadError')}
        </div>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-text-muted text-[12px]">
        <Loader2 className="w-4 h-4 animate-spin text-brand-text" /> {t('labsLoading')}
      </div>
    );
  }

  return <CatalogClient items={datos.items} services={datos.services} canEdit={datos.canEdit} />;
}

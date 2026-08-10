/**
 * CaseUrlModal — el detalle de caso como modal, abierto desde el parámetro
 * `?case=<id>` de la pantalla que lo contiene.
 *
 * Reemplaza a las rutas interceptadas (`@modal/(..)front-office/[id]`). Esas
 * funcionaban solo con navegación por clic: al recargar, el navegador pedía la
 * URL del caso de verdad y Next servía la página completa, así que se perdían
 * la lista, la búsqueda y el modal.
 *
 * Con el estado en la URL de la LISTA, un refresh reproduce la vista exacta —
 * `/patients?q=lopez&page=2&case=xxx&tab=labs` vuelve con la búsqueda, la
 * página y el caso abierto en su tab. La carga sigue siendo del server (misma
 * `getCaseDetailData`), así que no se pierde el render en servidor.
 *
 * Un `?case=` inválido o de un caso ajeno NO rompe la pantalla: devuelve null y
 * la lista queda como si no hubiera parámetro. Un 404 acá se llevaría puesta
 * toda la lista por un id viejo pegado en un favorito.
 */

import { getCaseDetailData, providerHasCase } from '@/lib/case-detail-data';
import { parseCaseTab } from '@/lib/case-tabs';
import { CaseDetailModal } from '@/components/cases/case-detail-modal';

export async function CaseUrlModal({ caseId, tab, variant = 'admin', providerId }: {
  /** `?case=` — sin valor no se monta nada */
  caseId?: string;
  /** `?tab=` — el tab con el que abre */
  tab?: string;
  variant?: 'admin' | 'doctor';
  /**
   * Portal médico: el doctor solo abre casos con una cita suya. Se valida acá,
   * en el server, igual que lo hacía la página completa del doctor.
   */
  providerId?: string;
}): Promise<React.ReactElement | null> {
  if (!caseId) return null;

  if (variant === 'doctor') {
    if (!providerId) return null;
    if (!(await providerHasCase(providerId, caseId))) return null;
  }

  const data = await getCaseDetailData(caseId);
  if (!data) return null;

  return (
    <CaseDetailModal
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      variant={variant}
      initialTab={parseCaseTab(tab)}
    />
  );
}

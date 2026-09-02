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

import { db } from '@precision-medical/database';
import { getCaseDetailData, providerHasCase, casesOfPatientByCase } from '@/lib/case-detail-data';
import { canAuditNotes } from '@/lib/notes-audit-access';
import { parseCaseTab, TABS_ATTORNEY } from '@/lib/case-tabs';
import { CaseDetailModal } from '@/components/cases/case-detail-modal';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter, canSignLien } from '@/lib/attorney-portal';

export async function CaseUrlModal({ caseId, tab, variant = 'admin', providerId }: {
  /** `?case=` — sin valor no se monta nada */
  caseId?: string;
  /** `?tab=` — el tab con el que abre */
  tab?: string;
  variant?: 'admin' | 'doctor' | 'attorney';
  /**
   * Portal médico: el doctor solo abre casos con una cita suya. Se valida acá,
   * en el server, igual que lo hacía la página completa del doctor.
   */
  providerId?: string;
}): Promise<React.ReactElement | null> {
  if (!caseId) return null;

  if (variant === 'doctor') {
    /**
     * El supervisor de notas (`/doctor/notes`) abre el caso de CUALQUIER
     * paciente, y no es una excepción cómoda: su pantalla lista las visitas de
     * todos los providers, así que exigirle `providerHasCase` —"¿atendió a este
     * paciente?"— lo dejaría con una lista donde ninguna fila abre. Es el mismo
     * callejón que ya tuvimos con la vista de impresión.
     *
     * Para el médico tratante no cambia nada: sigue el guard de siempre.
     */
    if (!(await canAuditNotes())) {
      if (!providerId) return null;
      if (!(await providerHasCase(providerId, caseId))) return null;
    }
  }

  // Portal legal: el bufete solo abre casos DENTRO de su alcance, y con el mismo
  // filtro que usa su lista. Se valida acá, en el server — igual que el doctor.
  let signature: { hasSigned: boolean; exempt: boolean; canSign: boolean; defaultName: string } | null = null;

  if (variant === 'attorney') {
    const lawyer = await getSessionLawyer();
    if (!lawyer) return null;

    const allowed = await db.case.findFirst({
      where: { AND: [lawyerCaseFilter(lawyer), { id: caseId }] },
      select: {
        signatureExempt: true,
        lienSignatures: { where: { signerType: 'ATTORNEY' }, select: { id: true }, take: 1 },
      },
    });
    if (!allowed) return null;

    signature = {
      hasSigned: allowed.lienSignatures.length > 0,
      exempt: allowed.signatureExempt,
      canSign: canSignLien(lawyer),
      // Se pre-carga el nombre de QUIEN ESTÁ FIRMANDO, no el del abogado del
      // caso. Ahora que también firman gestores y asistentes, poner el nombre
      // del abogado dejaría un documento que dice "Sergio Garcia" firmado desde
      // la cuenta de otra persona. El campo sigue siendo editable para firmar en
      // representación, pero el default no puede inducir a eso.
      defaultName: `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim() || (lawyer.firmName ?? ''),
    };
  }

  const data = await getCaseDetailData(caseId);
  if (!data) return null;

  // Un `?tab=` que el bufete no puede ver cae al tab por defecto, en vez de
  // abrir en una pestaña que para él no existe.
  const parsed = parseCaseTab(tab);
  const initialTab = variant === 'attorney' && parsed && !TABS_ATTORNEY.has(parsed) ? undefined : parsed;

  // Los otros casos del paciente, solo para el doctor: es el único que necesita
  // saltar entre el de hoy y los anteriores sin volver a la lista. En admin la
  // lista ya queda montada debajo del modal, y en el portal legal el alcance es
  // del bufete, no del paciente.
  const patientCases = variant === 'doctor' ? await casesOfPatientByCase(caseId) : [];

  return (
    <CaseDetailModal
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      currentUserId={data.currentUserId}
      variant={variant}
      initialTab={initialTab}
      signature={signature}
      patientCases={patientCases}
    />
  );
}

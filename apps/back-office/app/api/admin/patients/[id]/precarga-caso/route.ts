/**
 * GET /api/admin/patients/[id]/precarga-caso
 *
 * Lo que ya sabemos de un paciente, para abrirle un caso NUEVO sin volver a
 * preguntárselo todo.
 *
 * Nace del calendario: la mitad del padrón —2.862 de 5.729, medido 2026-09-14—
 * no tiene ningún caso, así que al agendarles el diálogo los dejaba elegir y
 * después los frenaba con "el paciente no tiene casos". La salida era cerrar,
 * ir a Pacientes, crear el caso y volver. Ahora el caso se abre ahí mismo, y
 * para eso hace falta traer lo que ya está cargado.
 *
 * ── De dónde sale cada cosa, que no es de un solo lado ──────────────────────
 * El referido vive en `Patient` (es de la persona: quién la mandó). Pero el
 * BUFETE, el ABOGADO y el SEGURO viven en `Case`, porque son del caso: un
 * segundo accidente puede llevar otro bufete y otra póliza. Así que se copian
 * del caso MÁS RECIENTE del paciente, que es la mejor apuesta disponible —y
 * una apuesta, no un hecho: por eso todo llega editable y nada se guarda solo.
 *
 * `Patient.insuranceCarrier` es texto libre heredado del v2 y NO sirve para
 * precargar el selector, que necesita el id de `InsuranceCarrier`. Se manda
 * igual como `seguroTexto` para poder mostrarlo como pista cuando no hay caso
 * previo del cual copiar el id.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, type CaseStatus } from '@precision-medical/database';
import { checkPatientAccess } from '@/lib/patient-access';

/**
 * Cómo se llama un `Lawyer` en pantalla.
 *
 * La tabla guarda bufetes y personas en el mismo modelo: el bufete trae
 * `firmName` y la persona `firstName`/`lastName`. No hay campo `name`, y pedirlo
 * es el error fácil — devuelve la fila entera sin que nada avise. Mismo criterio
 * que `lawyers/autocomplete`, para que el autocompletar no muestre una etiqueta
 * distinta de la que dejó esta precarga.
 */
function etiquetaLegal(
  l: { firmName: string | null; firstName: string | null; lastName: string | null } | null,
): string {
  if (!l) return '';
  return l.firmName ?? `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim();
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  // El guard ACOTADO al paciente, no el genérico de staff: esto devuelve PHI de
  // una persona concreta, y un provider del portal solo puede ver la suya.
  const acceso = await checkPatientAccess(id);
  if (acceso.deny) return acceso.deny;

  const paciente = await db.patient.findUnique({
    where: { id },
    select: {
      id: true, patientCode: true, firstName: true, lastName: true,
      phone: true, email: true, dateOfBirth: true, preferredLanguage: true,
      insuranceCarrier: true,
      referralSource: true, referralSourceOther: true,
      lawyerReferrerId: true,
      lawyerReferrer: { select: { id: true, firmName: true, firstName: true, lastName: true } },
      providerReferrerId: true,
    },
  });

  if (!paciente) return NextResponse.json({ error: 'PATIENT_NOT_FOUND' }, { status: 404 });

  /**
   * El caso más reciente, sólo para copiar de él.
   *
   * `deletedAt: null` a propósito: copiar el bufete de un caso borrado sería
   * arrastrar una decisión que alguien ya deshizo.
   */
  const ultimoCaso = await db.case.findFirst({
    where:   { patientId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, caseCode: true, caseType: true, createdAt: true,
      lawFirmId: true,   lawFirm:  { select: { id: true, firmName: true, firstName: true, lastName: true } },
      attorneyId: true,  attorney: { select: { id: true, firmName: true, firstName: true, lastName: true } },
      primaryInsuranceId: true,
      primaryInsurance:   { select: { id: true, name: true } },
      primaryPolicyNumber: true,
    },
  });

  /**
   * Los tipos de caso que el paciente YA tiene abiertos.
   *
   * Lo usa la pantalla para no ofrecer lo que el servidor va a rechazar: en GM
   * hay **un caso por paciente**, así que si ya tiene uno, el camino no es
   * abrir otro sino agendarle más citas al que existe. En MVA no aplica —cada
   * accidente es su propio caso— y por eso el botón tiene que seguir estando
   * aunque el paciente ya tenga un GM abierto.
   *
   * Se miran solo los VIVOS: un GM cerrado no bloquea abrir uno nuevo.
   */
  const VIVOS: CaseStatus[] = ['NEW_REFERRAL', 'CONFIRMED', 'ACTIVE', 'INTAKE_PENDING', 'INTAKE_COMPLETED'];
  const abiertos = await db.case.findMany({
    where:  { patientId: id, deletedAt: null, status: { in: VIVOS } },
    select: { id: true, caseCode: true, caseType: true, status: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    ok: true,
    paciente: {
      id:                paciente.id,
      patientCode:       paciente.patientCode,
      firstName:         paciente.firstName,
      lastName:          paciente.lastName,
      phone:             paciente.phone ?? '',
      email:             paciente.email ?? '',
      // `YYYY-MM-DD`: el wizard lo pide así, y sin fecha el paso 1 queda
      // trabado en un campo requerido que con el paciente bloqueado nadie
      // puede llenar.
      dateOfBirth:       paciente.dateOfBirth ? paciente.dateOfBirth.toISOString().slice(0, 10) : '',
      preferredLanguage: paciente.preferredLanguage,
      referralSource:      paciente.referralSource,
      referralSourceOther: paciente.referralSourceOther,
      providerReferrerId:  paciente.providerReferrerId,
      referrerFirm: paciente.lawyerReferrer
        ? { id: paciente.lawyerReferrer.id, label: etiquetaLegal(paciente.lawyerReferrer) }
        : null,
      seguroTexto: paciente.insuranceCarrier,
    },
    /** `null` cuando es el primer caso del paciente: no hay de dónde copiar. */
    ultimoCaso: ultimoCaso ? {
      id:          ultimoCaso.id,
      caseCode:    ultimoCaso.caseCode,
      caseType:    ultimoCaso.caseType,
      lawFirm:     ultimoCaso.lawFirm  ? { id: ultimoCaso.lawFirm.id,  label: etiquetaLegal(ultimoCaso.lawFirm) }  : null,
      attorney:    ultimoCaso.attorney ? { id: ultimoCaso.attorney.id, label: etiquetaLegal(ultimoCaso.attorney) } : null,
      insurance:   ultimoCaso.primaryInsurance
        ? { id: ultimoCaso.primaryInsurance.id, label: ultimoCaso.primaryInsurance.name }
        : null,
      /**
       * El número de póliza NO se copia acá a propósito, aunque lo tengamos.
       * Bufete y aseguradora se repiten entre casos del mismo paciente; la
       * póliza es del siniestro, y arrastrar la vieja a un accidente nuevo
       * hace que se facture contra la cobertura equivocada sin que nadie lo
       * haya decidido. Viaja solo para mostrarse como referencia.
       */
      policyNumberAnterior: ultimoCaso.primaryPolicyNumber,
    } : null,
    /** Casos vivos, para saber si ofrecer GM o mandar a agendar en el que ya existe. */
    casosAbiertos: abiertos,
  });
}

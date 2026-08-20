/**
 * GET /api/admin/admission/[id]
 *
 * B.15 — Detalle de admisión de una cita específica.
 * Devuelve toda la info necesaria para la pantalla de Pagos y Cobros.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { resolveCoverage, serializeCoverage } from '@/lib/coverage';
import { buildPatientContext, PATIENT_CONTEXT_SELECT } from '@/lib/patient-context';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const appt = await db.appointment.findUnique({
      where: { id },
      include: {
        // El fragmento compartido primero: trae lo que necesita el panel de
        // contexto clínico (el mismo que ve el doctor en su consulta). Los cuatro
        // campos que ya se usaban están adentro.
        patient: { select: PATIENT_CONTEXT_SELECT },
        provider: {
          select: { id: true, firstName: true, lastName: true, specialty: true },
        },
        clinic: {
          select: { id: true, name: true },
        },
        triageRecord: true,
        case: {
          select: {
            id:                    true,
            caseCode:              true,
            caseType:              true,
            accidentDate:          true,
            accidentType:          true,
            pipVerifiedAt:         true,
            intakeFormCompletedAt: true,
            consentsData:          true,
            primaryPolicyNumber:   true,
            lawFirmId:             true,
            attorneyId:            true,
            // Cobertura (¿quién paga?). Explícitas y no con COVERAGE_LIST_SELECT
            // porque este select ya trae `primaryInsurance` con más campos.
            coverageType:           true,
            coverageVerifyMethod:   true,
            coverageVerifiedAt:     true,
            coverageVerifiedByName: true,
            coverageCarrierName:    true,
            coverageNote:           true,
            lawFirm: {
              select: { id: true, firmName: true, phone: true, email: true },
            },
            attorney: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            // `type` lo pide el panel de contexto (muestra el tipo de póliza);
            // el resto es de las vistas propias de Day Admission.
            primaryInsurance: {
              select: {
                id: true, name: true, type: true, shortCode: true, color: true,
                claimsPhone: true, claimsEmail: true,
              },
            },
            secondaryInsurance: {
              select: {
                id: true, name: true, shortCode: true, color: true,
                claimsPhone: true, claimsEmail: true,
              },
            },
            secondaryPolicyNumber: true,
          },
        },
      },
    });

    if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    // Ultima correccion de vitales despues de que el paciente paso a sala. Sale
    // del audit log (no hay columna en TriageRecord) y la pantalla la muestra
    // junto al titulo, para que el doctor sepa que los numeros cambiaron.
    const triageId = (appt as { triageRecord?: { id?: string } | null }).triageRecord?.id;
    const lastCorrection = triageId
      ? await db.auditLog.findFirst({
          where: { action: 'TRIAGE_VITALS_CORRECTED', entityType: 'TriageRecord', entityId: triageId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, metadata: true },
        })
      : null;
    const triageCorrection = lastCorrection
      ? {
          at: lastCorrection.createdAt.toISOString(),
          by: (lastCorrection.metadata as { correctedByName?: string } | null)?.correctedByName ?? null,
        }
      : null;

    const c = appt.case;
    const isMVA      = c?.caseType === 'MVA';
    const pipActive  = isMVA && !!c?.pipVerifiedAt;
    const hasSecondary = !!c?.secondaryInsurance;
    const cd = (c?.consentsData ?? {}) as Record<string, unknown>;
    const consentsCompleted = !!(cd.treatment && cd.financial && cd.financialSignatureSvg);

    // Cálculo financiero simplificado (Phase 1)
    // MVA + PIP activo + sin seguro secundario → $0 para el paciente
    // MVA + PIP agotado + seguro secundario (Med Pay) → cubierto por secondary
    // Otros → copago TBD
    const financial = {
      serviceEstimate: 500,
      pipCovers:       pipActive ? 500 : 0,
      medPayCovers:    !pipActive && hasSecondary ? 500 : 0,
      patientOwes:     pipActive || (!pipActive && hasSecondary) ? 0 : null,
      coverageSource:  pipActive ? 'PIP' : hasSecondary ? 'MED_PAY' : 'PATIENT',
      currency:        'USD',
    };

    return NextResponse.json({
      ok: true,
      appointment: {
        id:              appt.id,
        scheduledFor:    appt.scheduledFor.toISOString(),
        durationMinutes: appt.durationMinutes,
        type:            appt.type,
        status:          appt.status,
        notes:           appt.notes,
        checkedInAt:     (appt as { checkedInAt?: Date | null }).checkedInAt?.toISOString() ?? null,
        // El doctor marcó que terminó con el paciente (portal médico) — el
        // asistente lo usa para saber que puede cobrar y cerrar la cita.
        doctorDoneAt:    (appt as { doctorDoneAt?: Date | null }).doctorDoneAt?.toISOString() ?? null,
        // Hora de salida — cierra el reloj de "tiempo en clínica" del Resumen.
        checkedOutAt:    (appt as { checkedOutAt?: Date | null }).checkedOutAt?.toISOString() ?? null,
        triageCorrection,
        patient: {
          id:          appt.patient.id,
          firstName:   appt.patient.firstName,
          lastName:    appt.patient.lastName,
          phone:       appt.patient.phone,
          email:       appt.patient.email,
          dateOfBirth: appt.patient.dateOfBirth?.toISOString() ?? null,
        },
        // Panel de contexto clínico del paso 3 — el MISMO que ve el doctor en su
        // consulta, armado por el helper compartido (Erick, 2026-08-13: "el
        // asistente debe ver lo mismo que el doctor").
        patientContext: buildPatientContext(appt.patient, c ?? null),
        provider: appt.provider ? {
          id:        appt.provider.id,
          firstName: appt.provider.firstName,
          lastName:  appt.provider.lastName,
          specialty: appt.provider.specialty,
        } : null,
        clinic: { id: appt.clinic.id, name: appt.clinic.name },
        triageRecord: appt.triageRecord ?? null,
        case: c ? {
          id:                    c.id,
          caseCode:              c.caseCode,
          caseType:              c.caseType,
          accidentDate:          c.accidentDate?.toISOString() ?? null,
          accidentType:          (c as { accidentType?: string | null }).accidentType ?? null,
          pipVerifiedAt:         c.pipVerifiedAt?.toISOString() ?? null,
          intakeFormCompletedAt: c.intakeFormCompletedAt?.toISOString() ?? null,
          consentsData:          c.consentsData ?? null,
          primaryPolicyNumber:   c.primaryPolicyNumber,
          pipActive,
          consentsCompleted,
          isMVA,
          lawFirm: c.lawFirm ? {
            id: c.lawFirm.id, firmName: c.lawFirm.firmName,
            phone: c.lawFirm.phone, email: c.lawFirm.email,
          } : null,
          attorney: c.attorney ? {
            id: c.attorney.id,
            firstName: c.attorney.firstName,
            lastName:  c.attorney.lastName,
            email:     c.attorney.email,
          } : null,
          primaryInsurance:      c.primaryInsurance ?? null,
          secondaryInsurance:    c.secondaryInsurance ?? null,
          secondaryPolicyNumber: c.secondaryPolicyNumber ?? null,
        } : null,
        plannedServiceCodes: Array.isArray(appt.plannedServiceCodes) ? appt.plannedServiceCodes : [],
        // Vista de detalle: se pasa el caso completo (con `consentsData`) para que
        // el diálogo pueda sugerir lo que ya trae el formulario de admisión.
        coverage: serializeCoverage(resolveCoverage(c ?? {})),
        financial,
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/admission/[id]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

/**
 * GET /api/admin/admission/[id]
 *
 * B.15 — Detalle de admisión de una cita específica.
 * Devuelve toda la info necesaria para la pantalla de Pagos y Cobros.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const appt = await db.appointment.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true, firstName: true, lastName: true,
            phone: true, email: true, dateOfBirth: true,
          },
        },
        provider: {
          select: { id: true, firstName: true, lastName: true, specialty: true },
        },
        clinic: {
          select: { id: true, name: true },
        },
        case: {
          select: {
            id:                    true,
            caseCode:              true,
            caseType:              true,
            accidentDate:          true,
            accidentType:          true,
            pipVerifiedAt:         true,
            intakeFormCompletedAt: true,
            primaryPolicyNumber:   true,
            lawFirmId:             true,
            attorneyId:            true,
            lawFirm: {
              select: { id: true, firmName: true, phone: true, email: true },
            },
            attorney: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            primaryInsurance: {
              select: {
                id: true, name: true, shortCode: true, color: true,
                claimsPhone: true, claimsEmail: true,
              },
            },
          },
        },
      },
    });

    if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const c = appt.case;
    const isMVA      = c?.caseType === 'MVA';
    const pipActive  = isMVA && !!c?.pipVerifiedAt;
    const lienSigned = !!(c?.lawFirmId || c?.attorneyId);

    // Cálculo financiero simplificado (Phase 0 — mock)
    // MVA + PIP activo → $0 para el paciente
    // Otros → copago TBD
    const financial = {
      serviceEstimate: 500,         // USD — placeholder, CPT real viene de B.18
      pipCovers:       pipActive ? 500 : 0,
      patientOwes:     pipActive ? 0 : null,  // null = TBD
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
        patient: {
          id:          appt.patient.id,
          firstName:   appt.patient.firstName,
          lastName:    appt.patient.lastName,
          phone:       appt.patient.phone,
          email:       appt.patient.email,
          dateOfBirth: appt.patient.dateOfBirth?.toISOString() ?? null,
        },
        provider: appt.provider ? {
          id:        appt.provider.id,
          firstName: appt.provider.firstName,
          lastName:  appt.provider.lastName,
          specialty: appt.provider.specialty,
        } : null,
        clinic: { id: appt.clinic.id, name: appt.clinic.name },
        case: c ? {
          id:                    c.id,
          caseCode:              c.caseCode,
          caseType:              c.caseType,
          accidentDate:          c.accidentDate?.toISOString() ?? null,
          pipVerifiedAt:         c.pipVerifiedAt?.toISOString() ?? null,
          intakeFormCompletedAt: c.intakeFormCompletedAt?.toISOString() ?? null,
          primaryPolicyNumber:   c.primaryPolicyNumber,
          pipActive,
          lienSigned,
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
          primaryInsurance: c.primaryInsurance ?? null,
        } : null,
        financial,
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/admission/[id]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

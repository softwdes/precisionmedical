/**
 * GET /api/admin/intake/[id]
 *
 * Detalle completo de un caso para B.13 (Edson).
 * Incluye: patient, attorney, lawFirm, primaryInsurance, notas de comunicación,
 * citas agendadas.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const c = await db.case.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true, firstName: true, lastName: true,
            phone: true, email: true, dateOfBirth: true,
            status: true,
          },
        },
        lawFirm: {
          select: {
            id: true, firmName: true, phone: true, email: true, address: true,
          },
        },
        attorney: {
          select: {
            id: true, firstName: true, lastName: true,
            phone: true, email: true,
          },
        },
        primaryInsurance: {
          select: {
            id: true, name: true, claimsPhone: true,
            claimsEmail: true, shortCode: true, color: true,
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true, content: true, authorName: true,
            isPrivate: true, createdAt: true,
          },
        },
        appointments: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { scheduledFor: 'asc' },
          take: 5,
          select: {
            id: true, scheduledFor: true, status: true, type: true,
            clinic: { select: { name: true } },
          },
        },
      },
    });

    if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const awaitingLawFirm = !c.attorneyId && !c.lawFirmId;
    const awaitingPip     = !c.pipVerifiedAt;
    const isReady         = !awaitingLawFirm && !awaitingPip;

    return NextResponse.json({
      ok: true,
      case: {
        id:                    c.id,
        caseCode:              c.caseCode,
        caseType:              c.caseType,
        status:                c.status,
        accidentDate:          c.accidentDate?.toISOString() ?? null,
        accidentType:          c.accidentType,
        accidentLocation:      c.accidentLocation,
        createdAt:             c.createdAt.toISOString(),
        pipVerifiedAt:         c.pipVerifiedAt?.toISOString() ?? null,
        intakeFormCompletedAt: c.intakeFormCompletedAt?.toISOString() ?? null,
        primaryPolicyNumber:   c.primaryPolicyNumber,
        awaitingLawFirm,
        awaitingPip,
        isReady,
        patient: {
          id:          c.patient.id,
          firstName:   c.patient.firstName,
          lastName:    c.patient.lastName,
          phone:       c.patient.phone,
          email:       c.patient.email,
          dateOfBirth: c.patient.dateOfBirth?.toISOString() ?? null,
          status:      c.patient.status,
        },
        lawFirm: c.lawFirm ? {
          id:       c.lawFirm.id,
          firmName: c.lawFirm.firmName,
          phone:    c.lawFirm.phone,
          email:    c.lawFirm.email,
          address:  c.lawFirm.address,
        } : null,
        attorney: c.attorney ? {
          id:        c.attorney.id,
          firstName: c.attorney.firstName,
          lastName:  c.attorney.lastName,
          phone:     c.attorney.phone,
          email:     c.attorney.email,
        } : null,
        primaryInsurance: c.primaryInsurance ? {
          id:          c.primaryInsurance.id,
          name:        c.primaryInsurance.name,
          claimsPhone: c.primaryInsurance.claimsPhone,
          claimsEmail: c.primaryInsurance.claimsEmail,
          shortCode:   c.primaryInsurance.shortCode,
          color:       c.primaryInsurance.color,
        } : null,
        notes: c.notes.map(n => ({
          id:         n.id,
          content:    n.content,
          authorName: n.authorName,
          isPrivate:  n.isPrivate,
          createdAt:  n.createdAt.toISOString(),
          // Detectar tipo por prefijo de emoji en el contenido
          type: n.content.startsWith('📞') ? 'call' : n.content.startsWith('📧') ? 'email' : 'note',
        })),
        appointments: c.appointments.map(a => ({
          id:           a.id,
          scheduledFor: a.scheduledFor.toISOString(),
          status:       a.status,
          type:         a.type,
          clinicName:   a.clinic.name,
        })),
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/intake/[id]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

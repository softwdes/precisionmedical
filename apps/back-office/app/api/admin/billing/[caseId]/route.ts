/**
 * GET /api/admin/billing/[caseId]
 *
 * Detalle completo de un caso para la vista Brunella (B.25 Pantalla 2).
 * Incluye: patient, attorney, lawFirm, primaryInsurance, todas las notas
 * firmadas, todas las notas internas de Brunella.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const { caseId } = await ctx.params;

  try {
    const c = await db.case.findUnique({
      where: { id: caseId },
      include: {
        patient: {
          select: {
            id: true, firstName: true, lastName: true,
            phone: true, email: true, dateOfBirth: true,
          },
        },
        lawFirm:  { select: { id: true, firmName: true, phone: true, email: true } },
        attorney: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        primaryInsurance: {
          select: { id: true, name: true, shortCode: true, color: true, claimsPhone: true, claimsEmail: true },
        },
        // All signed notes (for visit timeline)
        appointments: {
          where: { status: 'COMPLETED' },
          orderBy: { scheduledFor: 'asc' },
          include: {
            visitNote: {
              select: {
                id: true, signedAt: true, signedByName: true,
                assessment: true, plan: true, status: true,
              },
            },
            provider: { select: { firstName: true, lastName: true } },
          },
        },
        // Internal notes (Brunella's timeline)
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true, content: true, authorName: true, createdAt: true,
          },
        },
      },
    });

    if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    // CPT codes for each signed note
    const signedNoteIds = c.appointments
      .map(a => a.visitNote?.id)
      .filter(Boolean) as string[];

    const cptRows = signedNoteIds.length > 0
      ? await db.$queryRaw<{ visit_note_id: string; cpt_code: string; description: string; fee: number }[]>`
          SELECT
            visit_note_id,
            cpt_code,
            description,
            COALESCE(fee_override, fee_catalog)::float AS fee
          FROM visit_service_codes
          WHERE visit_note_id = ANY(${signedNoteIds})
          ORDER BY visit_note_id, cpt_code
        `
      : [];

    const cptByNote = new Map<string, { cptCode: string; description: string; fee: number }[]>();
    for (const row of cptRows) {
      const arr = cptByNote.get(row.visit_note_id) ?? [];
      arr.push({ cptCode: row.cpt_code, description: row.description, fee: row.fee });
      cptByNote.set(row.visit_note_id, arr);
    }

    // Aggregate totals
    const visitedTotal    = c.appointments.filter(a => a.visitNote?.status === 'SIGNED').length;
    const billedTotal     = signedNoteIds.reduce((s, id) => s + (cptByNote.get(id)?.reduce((ss, r) => ss + r.fee, 0) ?? 0), 0);

    // Check if HCFA already generated (via system note marker)
    const hcfaNote = c.notes.find(n => n.content.startsWith('🤖 HCFA'));

    return NextResponse.json({
      ok: true,
      case: {
        id:              c.id,
        caseCode:        c.caseCode,
        caseType:        c.caseType,
        status:          c.status,
        accidentDate:    c.accidentDate?.toISOString() ?? null,
        primaryPolicyNumber: c.primaryPolicyNumber,
        visitsTotal:     visitedTotal,
        billedTotal,
        hcfaGeneratedAt: hcfaNote ? hcfaNote.createdAt.toISOString() : null,
        patient: {
          id:          c.patient.id,
          firstName:   c.patient.firstName,
          lastName:    c.patient.lastName,
          phone:       c.patient.phone,
          email:       c.patient.email,
          dateOfBirth: c.patient.dateOfBirth?.toISOString() ?? null,
        },
        lawFirm:  c.lawFirm  ? { id: c.lawFirm.id,  firmName: c.lawFirm.firmName,  phone: c.lawFirm.phone,  email: c.lawFirm.email }  : null,
        attorney: c.attorney ? { id: c.attorney.id, firstName: c.attorney.firstName, lastName: c.attorney.lastName, phone: c.attorney.phone, email: c.attorney.email } : null,
        primaryInsurance: c.primaryInsurance ? {
          id:          c.primaryInsurance.id,
          name:        c.primaryInsurance.name,
          shortCode:   c.primaryInsurance.shortCode,
          color:       c.primaryInsurance.color,
          claimsPhone: c.primaryInsurance.claimsPhone,
          claimsEmail: c.primaryInsurance.claimsEmail,
        } : null,
        // Visits with CPT details
        visits: c.appointments.map((a, idx) => ({
          appointmentId: a.id,
          visitNum:      idx + 1,
          scheduledFor:  a.scheduledFor.toISOString(),
          provider:      a.provider ? `Dr. ${a.provider.lastName}, ${a.provider.firstName}` : null,
          note: a.visitNote ? {
            id:          a.visitNote.id,
            signedAt:    a.visitNote.signedAt?.toISOString() ?? null,
            signedBy:    a.visitNote.signedByName,
            assessment:  a.visitNote.assessment,
            plan:        a.visitNote.plan,
            cpts:        cptByNote.get(a.visitNote.id) ?? [],
            total:       (cptByNote.get(a.visitNote.id) ?? []).reduce((s, r) => s + r.fee, 0),
          } : null,
        })).filter(v => v.note?.signedAt),
        // Internal notes
        notes: c.notes.map(n => ({
          id:         n.id,
          content:    n.content,
          authorName: n.authorName,
          createdAt:  n.createdAt.toISOString(),
          tag: detectNoteTag(n.content),
        })),
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/billing/[caseId]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

function detectNoteTag(content: string): string {
  if (content.startsWith('⚖️'))  return 'legal';
  if (content.startsWith('🏥'))  return 'insurer';
  if (content.startsWith('⏰'))  return 'reminder';
  if (content.startsWith('🤖'))  return 'system';
  return 'general';
}

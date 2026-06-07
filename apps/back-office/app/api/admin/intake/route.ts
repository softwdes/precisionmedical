/**
 * GET /api/admin/intake
 *
 * Bandeja de Edson (B.12) — lista de casos en flujo de verificación.
 * Devuelve KPIs + lista completa para alimentar la bandeja.
 *
 * Statuses relevantes para Edson:
 *   NEW_REFERRAL    → Recién creado
 *   INTAKE_PENDING  → Magic link enviado, esperando paciente
 *   INTAKE_COMPLETED → Paciente completó portal
 *
 * Query params:
 *   filter — 'all' | 'urgent' | 'lawFirm' | 'pip' (default: 'all')
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, Prisma } from '@precision-medical/database';

const CASE_INCLUDE = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
  // Bufete específico del caso
  lawFirm: {
    select: {
      id: true,
      firmName: true,
      phone: true,
      email: true,
    },
  },
  // Attorney específico asignado al caso
  attorney: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
  // Seguro PIP primario
  primaryInsurance: {
    select: {
      id: true,
      name: true,
      claimsPhone: true,
      claimsEmail: true,
    },
  },
} satisfies Prisma.CaseInclude;

type CaseRow = Prisma.CaseGetPayload<{ include: typeof CASE_INCLUDE }>;

function enrichCase(c: CaseRow, now: Date) {
  const createdAtDate = new Date(c.createdAt);
  const daysPending = Math.floor((now.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60 * 24));
  const awaitingLawFirm = !c.attorneyId && !c.lawFirmId;
  const awaitingPip     = !c.pipVerifiedAt;
  const isReady         = !awaitingLawFirm && !awaitingPip;
  const isUrgent        = daysPending >= 3 && !isReady;

  return {
    id:              c.id,
    caseCode:        c.caseCode,
    caseType:        c.caseType,
    status:          c.status,
    accidentDate:    c.accidentDate?.toISOString() ?? null,
    accidentType:    c.accidentType,
    createdAt:       c.createdAt.toISOString(),
    daysPending,
    isUrgent,
    awaitingLawFirm,
    awaitingPip,
    isReady,
    pipVerifiedAt:        c.pipVerifiedAt?.toISOString() ?? null,
    intakeFormCompletedAt: c.intakeFormCompletedAt?.toISOString() ?? null,
    primaryPolicyNumber:   c.primaryPolicyNumber,
    patient: {
      id:        c.patient.id,
      firstName: c.patient.firstName,
      lastName:  c.patient.lastName,
      phone:     c.patient.phone,
      email:     c.patient.email,
    },
    lawFirm: c.lawFirm ? {
      id:       c.lawFirm.id,
      firmName: c.lawFirm.firmName,
      phone:    c.lawFirm.phone,
      email:    c.lawFirm.email,
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
    } : null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') ?? 'all';

  const now   = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const urgentThreshold = new Date(now); urgentThreshold.setDate(urgentThreshold.getDate() - 3);

  try {
    // ─── Base where: solo casos en fase de verificación ────────────────────
    const baseWhere: Prisma.CaseWhereInput = {
      status: { in: ['NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED'] },
      deletedAt: null,
    };

    // ─── KPIs (sin filtro de tab) ─────────────────────────────────────────
    const allCases: CaseRow[] = await db.case.findMany({
      where: baseWhere,
      include: CASE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const enriched = allCases.map(c => enrichCase(c, now));

    const kpis = {
      newToday:       enriched.filter(c => new Date(c.createdAt) >= today).length,
      awaitingLawFirm: enriched.filter(c => c.awaitingLawFirm).length,
      awaitingPip:     enriched.filter(c => c.awaitingPip).length,
      readyForVisit:   enriched.filter(c => c.isReady).length,
    };

    // ─── Apply tab filter ─────────────────────────────────────────────────
    let filtered = enriched;
    if (filter === 'urgent')  filtered = enriched.filter(c => c.isUrgent);
    if (filter === 'lawFirm') filtered = enriched.filter(c => c.awaitingLawFirm);
    if (filter === 'pip')     filtered = enriched.filter(c => c.awaitingPip);

    return NextResponse.json({
      ok:    true,
      kpis,
      cases: filtered,
      total: filtered.length,
    });
  } catch (err) {
    console.error('[GET /api/admin/intake]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

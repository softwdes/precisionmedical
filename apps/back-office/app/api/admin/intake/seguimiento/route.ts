import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * B.23 — Bandeja de Edson · Post-visita (Seguimiento y Cobranzas)
 *
 * GET /api/admin/intake/seguimiento?tab=all|urgent|waiting|docs|partial
 *
 * Devuelve casos con al menos una nota SIGNED que todavía no están
 * cerrados/settled. Calcula:
 * - daysPending  : días desde la última cita completada
 * - totalBilled  : suma de CPT (fee_override ?? fee_catalog) × units
 * - visitCount   : número de citas completadas con nota firmada
 * - Badges       : sinRespuesta, faltaDocs, pagoParcial, bufeteContactado
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface CptRow {
  case_id: string;
  total:   number;
  count:   bigint;
}

interface CaseRow {
  id:              string;
  caseCode:        string;
  caseType:        string;
  accidentDate:    Date | null;
  pipVerifiedAt:   Date | null;
  patient: {
    firstName: string;
    lastName:  string;
  };
  lawFirm: {
    firmName: string | null;
    phone:    string | null;
  } | null;
  attorney: {
    firstName: string | null;
    lastName:  string | null;
  } | null;
  appointments: {
    id:          string;
    status:      string;
    scheduledFor: Date;
    visitNote: {
      id:       string;
      signedAt: Date | null;
      appointmentId: string;
    } | null;
  }[];
  notes: {
    id:        string;
    content:   string;
    createdAt: Date;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(date: Date): number {
  const now = Date.now();
  return Math.floor((now - date.getTime()) / 86_400_000);
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

// Detecta badges por las notas del caso
function deriveBadges(notes: { content: string; createdAt: Date }[]) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const recentNotes = notes.filter(n => n.createdAt >= sevenDaysAgo);

  const hasRecentCall  = recentNotes.some(n => n.content.startsWith('📞'));
  const hasRecentEmail = recentNotes.some(n => n.content.startsWith('📧'));
  const hasPartialPay  = notes.some(n => n.content.includes('💰 Pago parcial'));

  return {
    sinRespuesta:    !hasRecentCall && !hasRecentEmail,
    bufeteContactado: hasRecentCall || hasRecentEmail,
    pagoParcial:     hasPartialPay,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get('tab') ?? 'all';

  // Casos con al menos una cita COMPLETED que tiene VisitNote SIGNED
  const cases = await db.case.findMany({
    where: {
      status: { notIn: ['SETTLED', 'CLOSED', 'ARCHIVED'] as never[] },
      appointments: {
        some: {
          status:    'COMPLETED',
          visitNote: { status: 'SIGNED' },
        },
      },
    },
    select: {
      id:            true,
      caseCode:      true,
      caseType:      true,
      accidentDate:  true,
      pipVerifiedAt: true,
      patient: {
        select: { firstName: true, lastName: true },
      },
      lawFirm: {
        select: { firmName: true, phone: true },
      },
      attorney: {
        select: { firstName: true, lastName: true },
      },
      appointments: {
        where:   { status: 'COMPLETED', visitNote: { status: 'SIGNED' } },
        select:  {
          id:           true,
          status:       true,
          scheduledFor: true,
          visitNote: {
            select: { id: true, signedAt: true, appointmentId: true },
          },
        },
        orderBy: { scheduledFor: 'desc' },
      },
      notes: {
        select:  { id: true, content: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    20,   // últimas 20 para badge detection
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  }) as unknown as CaseRow[];

  if (cases.length === 0) {
    return NextResponse.json({
      ok: true, tab,
      kpis:  { totalPending: '$0', over30: 0, over60: 0, recoveredMonth: '$0' },
      items: [], total: 0,
    });
  }

  // CPT totals via $queryRaw (tabla snake_case, ver schema comment)
  const noteIds = cases.flatMap(c =>
    c.appointments.map(a => a.visitNote?.id).filter(Boolean),
  ) as string[];

  let cptTotals: Map<string, number> = new Map();

  if (noteIds.length > 0) {
    const rows = await db.$queryRaw<CptRow[]>`
      SELECT
        vn.case_id,
        SUM(COALESCE(vsc.fee_override, vsc.fee_catalog) * vsc.units)::float AS total,
        COUNT(*)::bigint AS count
      FROM visit_service_codes vsc
      JOIN visit_notes vn ON vn.id = vsc.visit_note_id
      WHERE vsc.visit_note_id = ANY(${noteIds}::text[])
      GROUP BY vn.case_id
    `;
    for (const r of rows) {
      cptTotals.set(r.case_id, Number(r.total ?? 0));
    }
  }

  // Build items
  const MDT_OFFSET_MS = 6 * 60 * 60 * 1000;
  const nowDenver = new Date(Date.now() - MDT_OFFSET_MS);
  const firstOfMonth = new Date(Date.UTC(
    nowDenver.getUTCFullYear(), nowDenver.getUTCMonth(), 1,
  ) + MDT_OFFSET_MS);

  const items = cases.map(c => {
    const lastAppt      = c.appointments[0]; // orderBy scheduledFor desc
    const lastVisitDate = lastAppt?.scheduledFor ?? null;
    const daysPending   = lastVisitDate ? daysSince(lastVisitDate) : 0;
    const totalBilled   = cptTotals.get(c.id) ?? 0;
    const visitCount    = c.appointments.length;
    const faltaDocs     = !c.pipVerifiedAt;
    const badges        = deriveBadges(c.notes);

    // Bucket urgency
    const urgency: 'urgent' | 'warning' | 'partial' | 'normal' =
      daysPending > 60 ? 'urgent'
      : badges.pagoParcial   ? 'partial'
      : daysPending > 30     ? 'warning'
      : 'normal';

    return {
      caseId:         c.id,
      caseCode:       c.caseCode,
      caseType:       c.caseType,
      patientName:    `${c.patient.firstName} ${c.patient.lastName}`,
      firmName:       c.lawFirm?.firmName ?? null,
      firmPhone:      c.lawFirm?.phone    ?? null,
      attorneyName:   c.attorney
        ? `${c.attorney.firstName ?? ''} ${c.attorney.lastName ?? ''}`.trim()
        : null,
      lastVisitDate:  lastVisitDate?.toISOString() ?? null,
      daysPending,
      totalBilled,
      totalBilledFmt: fmtMoney(totalBilled),
      visitCount,
      urgency,
      faltaDocs,
      sinRespuesta:    badges.sinRespuesta,
      bufeteContactado: badges.bufeteContactado,
      pagoParcial:     badges.pagoParcial,
    };
  });

  // KPIs
  const over30     = items.filter(i => i.daysPending > 30).length;
  const over60     = items.filter(i => i.daysPending > 60).length;
  const totalPending = items.reduce((s, i) => s + i.totalBilled, 0);
  // "Recuperado este mes" Phase 1A: CaseNotes con "💰 Pago parcial" desde inicio de mes
  const recoveredMonth = 0; // Phase 2: ledger real

  // Filter by tab
  const filtered = (() => {
    if (tab === 'urgent')  return items.filter(i => i.daysPending > 60);
    if (tab === 'waiting') return items.filter(i => i.sinRespuesta && !i.pagoParcial);
    if (tab === 'docs')    return items.filter(i => i.faltaDocs);
    if (tab === 'partial') return items.filter(i => i.pagoParcial);
    return items;
  })();

  // Sort: urgent first, then by daysPending desc
  filtered.sort((a, b) => b.daysPending - a.daysPending);

  return NextResponse.json({
    ok:   true,
    tab,
    kpis: {
      totalPending:   fmtMoney(totalPending),
      over30,
      over60,
      recoveredMonth: fmtMoney(recoveredMonth),
    },
    items:   filtered,
    total:   items.length,
    counts: {
      all:     items.length,
      urgent:  over60,
      waiting: items.filter(i => i.sinRespuesta && !i.pagoParcial).length,
      docs:    items.filter(i => i.faltaDocs).length,
      partial: items.filter(i => i.pagoParcial).length,
    },
  });
}

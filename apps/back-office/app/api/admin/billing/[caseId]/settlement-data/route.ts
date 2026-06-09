import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * B.28 — Settlement Workflow
 * GET /api/admin/billing/[caseId]/settlement-data
 *
 * Pre-carga datos para el formulario de procesamiento de settlement:
 * - Datos del caso (paciente, DOL, visitas, lien acumulado)
 * - Desglose del lien por categoría CPT (E&M, procedimientos, imaging, otros)
 * - Contacto del bufete (para emails de confirmación)
 * - Estado actual: ya settlado o pendiente
 *
 * Phase 1A: categorización de lien derivada de prefijos CPT (99X=E&M, 2X/6X=proc, 7X=imaging)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface CptRow {
  cpt_code:    string;
  description: string | null;
  units:       number;
  amount:      number;
}

interface CaseRow {
  id:                  string;
  caseCode:            string;
  caseType:            string;
  status:              string;
  accidentDate:        Date | null;
  closedAt:            Date | null;
  primaryPolicyNumber: string | null;
  patient: {
    firstName: string;
    lastName:  string;
    phone:     string | null;
    email:     string | null;
  };
  lawFirm: {
    firmName: string | null;
    phone:    string | null;
    email:    string | null;
  } | null;
  attorney: {
    firstName: string | null;
    lastName:  string | null;
    email:     string | null;
  } | null;
  primaryInsurance: {
    name: string;
  } | null;
  appointments: {
    id:           string;
    scheduledFor: Date;
    visitNote: {
      id:       string;
      status:   string;
      signedAt: Date | null;
    } | null;
  }[];
  notes: {
    id:        string;
    content:   string;
    createdAt: Date;
  }[];
}

// ─── CPT category ─────────────────────────────────────────────────────────────

function categorizeCpt(code: string): 'em' | 'procedure' | 'imaging' | 'other' {
  if (code.startsWith('99'))                         return 'em';
  if (/^2\d{4}$/.test(code) || /^6[0-9]\d{3}$/.test(code))  return 'procedure';
  if (/^7[0-9]\d{3}$/.test(code))                   return 'imaging';
  return 'other';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Denver' });
}

function parsePaymentAmount(content: string): number {
  const m = content.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
  return m ? parseFloat(m[1]!.replace(/,/g, '')) : 0;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await ctx.params;

  const raw = await db.case.findUnique({
    where:  { id: caseId },
    select: {
      id:                  true,
      caseCode:            true,
      caseType:            true,
      status:              true,
      accidentDate:        true,
      closedAt:            true,
      primaryPolicyNumber: true,
      patient: { select: { firstName: true, lastName: true, phone: true, email: true } },
      lawFirm: { select: { firmName: true, phone: true, email: true } },
      attorney: { select: { firstName: true, lastName: true, email: true } },
      primaryInsurance: { select: { name: true } },
      appointments: {
        where:   { status: 'COMPLETED' },
        select:  {
          id:           true,
          scheduledFor: true,
          visitNote:    { select: { id: true, status: true, signedAt: true } },
        },
        orderBy: { scheduledFor: 'asc' },
      },
      notes: {
        where:   { content: { startsWith: '💰' } },
        select:  { id: true, content: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!raw) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const c = raw as unknown as CaseRow;

  // ─── CPT breakdown ────────────────────────────────────────────────────────

  const noteIds = c.appointments
    .map(a => a.visitNote?.id)
    .filter(Boolean) as string[];

  let cptRows: CptRow[] = [];
  if (noteIds.length > 0) {
    cptRows = await db.$queryRaw<CptRow[]>`
      SELECT
        vsc.cpt_code,
        vsc.description,
        vsc.units::int AS units,
        COALESCE(vsc.fee_override, vsc.fee_catalog)::float AS amount
      FROM visit_service_codes vsc
      WHERE vsc.visit_note_id = ANY(${noteIds}::text[])
    `;
  }

  // Category totals
  const categories = { em: 0, procedure: 0, imaging: 0, other: 0 };
  for (const row of cptRows) {
    const cat = categorizeCpt(row.cpt_code);
    categories[cat] += (row.amount ?? 0) * (row.units ?? 1);
  }

  // Build lien breakdown rows matching mockup format
  const lienBreakdown: { label: string; amount: number; amountFmt: string }[] = [];

  if (categories.em > 0) {
    lienBreakdown.push({
      label:     `Servicios médicos (${c.appointments.length} visita${c.appointments.length !== 1 ? 's' : ''})`,
      amount:    categories.em,
      amountFmt: fmtMoney(categories.em),
    });
  }
  if (categories.procedure > 0) {
    lienBreakdown.push({
      label:     'Procedimientos',
      amount:    categories.procedure,
      amountFmt: fmtMoney(categories.procedure),
    });
  }
  if (categories.imaging > 0) {
    lienBreakdown.push({
      label:     'Imaging',
      amount:    categories.imaging,
      amountFmt: fmtMoney(categories.imaging),
    });
  }
  if (categories.other > 0) {
    lienBreakdown.push({
      label:     'Otros servicios',
      amount:    categories.other,
      amountFmt: fmtMoney(categories.other),
    });
  }
  // Narrativas legales — from ⚖ notes count (Phase 1A: derive cost estimate)
  const lienNotes = await db.caseNote.count({ where: { caseId, content: { startsWith: '⚖' } } });
  if (lienNotes > 0) {
    const lienDocCost = lienNotes * 150; // Phase 1A: $150 per lien document
    lienBreakdown.push({
      label:     `Narrativas legales (${lienNotes})`,
      amount:    lienDocCost,
      amountFmt: fmtMoney(lienDocCost),
    });
  }

  // Totals
  const totalCharged  = cptRows.reduce((s, r) => s + (r.amount ?? 0) * (r.units ?? 1), 0);
  const totalPaid     = c.notes.reduce((s, n) => s + parsePaymentAmount(n.content), 0);
  const lienTotal     = totalCharged - totalPaid;

  // Last visit date (MMI proxy)
  const lastAppt = c.appointments.at(-1);
  const lastVisitDate = lastAppt?.scheduledFor ?? null;

  // Already settled?
  const isSettled = c.status === 'SETTLED' || c.status === 'CLOSED';

  // Existing settlement note
  const settlementNote = await db.caseNote.findFirst({
    where:   { caseId, content: { startsWith: '🎯 Settlement' } },
    select:  { content: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    ok: true,
    settlement: {
      caseId:       c.id,
      caseCode:     c.caseCode,
      caseType:     c.caseType,
      status:       c.status,
      isSettled,
      accidentDate: fmtDate(c.accidentDate),
      lastVisitDate: fmtDate(lastVisitDate),
      visitCount:   c.appointments.length,
      patientName:  `${c.patient.firstName} ${c.patient.lastName}`,
      patientPhone: c.patient.phone,
      patientEmail: c.patient.email,
      firmName:     c.lawFirm?.firmName    ?? null,
      firmEmail:    c.lawFirm?.email       ?? null,
      firmPhone:    c.lawFirm?.phone       ?? null,
      trustAccount: c.lawFirm?.firmName ? `${c.lawFirm.firmName} Trust Account` : null,
      attorneyName: c.attorney
        ? `${c.attorney.firstName ?? ''} ${c.attorney.lastName ?? ''}`.trim()
        : null,
      insurerName:  c.primaryInsurance?.name ?? null,

      // Financial
      totalCharged,     totalChargedFmt:  fmtMoney(totalCharged),
      totalPaid,        totalPaidFmt:     fmtMoney(totalPaid),
      lienTotal,        lienTotalFmt:     fmtMoney(lienTotal),

      lienBreakdown,

      // Already processed?
      existingSettlement: settlementNote ? {
        content:   settlementNote.content,
        processedAt: settlementNote.createdAt.toISOString(),
      } : null,
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * B.27 — Ledger del caso
 * GET /api/admin/billing/[caseId]/ledger
 *
 * Devuelve:
 * - Encabezado del caso (paciente, bufete, DOL, PIP)
 * - Resumen financiero (facturado, cobrado, balance lien)
 * - Transacciones ordenadas cronológicamente con running balance
 *   · Cargos: CPT codes de visit_service_codes
 *   · Pagos: notas CaseNote con prefijo 💰
 *
 * Phase 1A: sin tabla ledger real — todo derivado de datos existentes.
 * Phase 2: agregar tabla ledger con ERA (Electronic Remittance Advice).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface CptRow {
  visit_note_id: string;
  cpt_code:      string;
  description:   string | null;
  units:         number;
  amount:        number;
}

interface CaseRow {
  id:                  string;
  caseCode:            string;
  caseType:            string;
  status:              string;
  accidentDate:        Date | null;
  primaryPolicyNumber: string | null;
  patient: {
    firstName: string;
    lastName:  string;
    phone:     string | null;
  };
  lawFirm: {
    firmName: string | null;
    phone:    string | null;
    email:    string | null;
  } | null;
  attorney: {
    firstName: string | null;
    lastName:  string | null;
  } | null;
  primaryInsurance: {
    name:   string;
    legalName: string | null;
  } | null;
  appointments: {
    id:           string;
    scheduledFor: Date;
    clinic:       { name: string; address: string | null } | null;
    provider:     { firstName: string; lastName: string } | null;
    visitNote: {
      id:       string;
      status:   string;
      signedAt: Date | null;
    } | null;
  }[];
  notes: {
    id:         string;
    content:    string;
    createdAt:  Date;
    authorName: string;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    timeZone: 'America/Denver',
  });
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
      primaryPolicyNumber: true,
      patient: { select: { firstName: true, lastName: true, phone: true } },
      lawFirm: { select: { firmName: true, phone: true, email: true } },
      attorney: { select: { firstName: true, lastName: true } },
      primaryInsurance: { select: { name: true, legalName: true } },
      appointments: {
        where:   { status: 'COMPLETED' },
        select:  {
          id:           true,
          scheduledFor: true,
          clinic:       { select: { name: true, address: true } },
          provider:     { select: { firstName: true, lastName: true } },
          visitNote:    { select: { id: true, status: true, signedAt: true } },
        },
        orderBy: { scheduledFor: 'asc' },
      },
      notes: {
        where:   { content: { startsWith: '💰' } },
        select:  { id: true, content: true, createdAt: true, authorName: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!raw) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const c = raw as unknown as CaseRow;

  // Gather signed note IDs
  const noteIds = c.appointments
    .map(a => a.visitNote?.id)
    .filter(Boolean) as string[];

  // CPT rows
  let cptRows: CptRow[] = [];
  if (noteIds.length > 0) {
    cptRows = await db.$queryRaw<CptRow[]>`
      SELECT
        vsc.visit_note_id,
        vsc.cpt_code,
        vsc.description,
        vsc.units::int AS units,
        COALESCE(vsc.fee_override, vsc.fee_catalog)::float AS amount
      FROM visit_service_codes vsc
      WHERE vsc.visit_note_id = ANY(${noteIds}::text[])
      ORDER BY vsc.visit_note_id, vsc.cpt_code
    `;
  }

  // Build note→appointment lookup
  const noteToAppt = new Map<string, typeof c.appointments[0]>();
  for (const a of c.appointments) {
    if (a.visitNote?.id) noteToAppt.set(a.visitNote.id, a);
  }

  // ─── Build transactions ───────────────────────────────────────────────────

  type TxType = 'charge' | 'payment';

  interface Tx {
    id:          string;
    date:        Date;
    type:        TxType;
    subtype:     'visit' | 'hcfa_payment' | 'partial_payment';
    description: string;
    charge:      number;
    payment:     number;
    // balance computed below
  }

  const txs: Tx[] = [];

  // CPT charges
  for (const row of cptRows) {
    const appt = noteToAppt.get(row.visit_note_id);
    if (!appt) continue;
    const providerName = appt.provider
      ? `${appt.provider.lastName.toUpperCase()}, ${appt.provider.firstName}`
      : 'Provider';
    const lineAmount = (row.amount ?? 0) * (row.units ?? 1);
    txs.push({
      id:          `cpt-${row.visit_note_id}-${row.cpt_code}`,
      date:        appt.scheduledFor,
      type:        'charge',
      subtype:     'visit',
      description: `${row.cpt_code}${row.description ? ' · ' + row.description : ''} · ${providerName}`,
      charge:      lineAmount,
      payment:     0,
    });
  }

  // Payment notes (💰)
  for (const n of c.notes) {
    const amt = parsePaymentAmount(n.content);
    if (amt <= 0) continue;
    const isHcfa = n.content.toLowerCase().includes('hcfa') || n.content.toLowerCase().includes('pip');
    txs.push({
      id:          `pay-${n.id}`,
      date:        n.createdAt,
      type:        'payment',
      subtype:     isHcfa ? 'hcfa_payment' : 'partial_payment',
      description: n.content.replace(/^💰\s*/, '').split(' — ').slice(-1)[0] ?? n.content,
      charge:      0,
      payment:     amt,
    });
  }

  // Sort chronologically
  txs.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute running balance
  let runningBalance = 0;
  const transactions = txs.map(tx => {
    runningBalance += tx.charge - tx.payment;
    return {
      id:           tx.id,
      date:         fmtDate(tx.date),
      type:         tx.type,
      subtype:      tx.subtype,
      description:  tx.description,
      charge:       tx.charge,
      chargeFmt:    tx.charge > 0 ? fmtMoney(tx.charge) : '—',
      payment:      tx.payment,
      paymentFmt:   tx.payment > 0 ? fmtMoney(tx.payment) : '—',
      balance:      runningBalance,
      balanceFmt:   fmtMoney(runningBalance),
    };
  });

  const totalCharge    = txs.reduce((s, t) => s + t.charge, 0);
  const totalPayment   = txs.reduce((s, t) => s + t.payment, 0);
  const totalBalance   = totalCharge - totalPayment;

  // Lien info
  const hasLien = c.notes && c.notes.length > 0; // notes filtered above to only 💰
  // check all notes for lien
  const allNotes = await db.caseNote.findMany({
    where:   { caseId, content: { startsWith: '⚖' } },
    select:  { createdAt: true },
    orderBy: { createdAt: 'asc' },
    take:    1,
  });
  const lienSignedAt = allNotes[0]?.createdAt ?? null;

  return NextResponse.json({
    ok: true,
    case: {
      id:           c.id,
      caseCode:     c.caseCode,
      caseType:     c.caseType,
      status:       c.status,
      accidentDate: c.accidentDate?.toISOString() ?? null,
      patientName:  `${c.patient.firstName} ${c.patient.lastName}`,
      patientNameFmt: `${c.patient.lastName.toUpperCase()}, ${c.patient.firstName.toUpperCase()}`,
      patientPhone: c.patient.phone,
      firmName:     c.lawFirm?.firmName ?? null,
      firmEmail:    c.lawFirm?.email    ?? null,
      firmPhone:    c.lawFirm?.phone    ?? null,
      attorneyName: c.attorney
        ? `${c.attorney.firstName ?? ''} ${c.attorney.lastName ?? ''}`.trim()
        : null,
      insurerName:  c.primaryInsurance?.name ?? null,
      pipNumber:    c.primaryPolicyNumber ?? null,
      visitCount:   c.appointments.length,
      clinicName:   c.appointments[0]?.clinic?.name ?? 'Precision Medical',
      clinicAddress: c.appointments[0]?.clinic?.address ?? null,
      lienSignedAt: lienSignedAt?.toISOString() ?? null,
    },
    financial: {
      totalCharge,    totalChargeFmt:  fmtMoney(totalCharge),
      totalPayment,   totalPaymentFmt: fmtMoney(totalPayment),
      totalBalance,   totalBalanceFmt: fmtMoney(totalBalance),
      cptCount: cptRows.length,
    },
    transactions,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * B.24 — Detalle de seguimiento del caso
 * GET /api/admin/intake/seguimiento/[caseId]
 *
 * Devuelve:
 * - Encabezado del caso (paciente, bufete, abogado, días pendiente)
 * - Resumen financiero (facturado, cobrado, pendiente)
 * - Timeline unificado (visitas + notas) ordenado por fecha desc
 * - Checklist de documentación
 *
 * NOTA: Prisma narrow-select no infiere bien las relaciones anidadas.
 * Se castea como unknown → CaseRow para evitar el problema.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface CptRow {
  case_id: string;
  total:   number;
}

interface CaseRow {
  id:            string;
  caseCode:      string;
  caseType:      string;
  status:        string;
  accidentDate:  Date | null;
  pipVerifiedAt: Date | null;
  createdAt:     Date;
  patient: {
    id: string; firstName: string; lastName: string;
    phone: string | null; email: string | null;
  };
  lawFirm: {
    id: string; firmName: string | null; phone: string | null; email: string | null;
  } | null;
  attorney: {
    id: string; firstName: string | null; lastName: string | null;
    phone: string | null; email: string | null;
  } | null;
  appointments: {
    id:           string;
    status:       string;
    scheduledFor: Date;
    provider: { firstName: string; lastName: string } | null;
    visitNote: {
      id:       string;
      status:   string;
      signedAt: Date | null;
    } | null;
  }[];
  notes: {
    id: string; content: string; authorName: string; createdAt: Date;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function noteTypeFromContent(content: string) {
  if (content.startsWith('📞'))   return 'call';
  if (content.startsWith('📧'))   return 'email';
  if (content.startsWith('💰'))   return 'payment';
  if (content.startsWith('🚨'))   return 'escalate';
  if (content.startsWith('⚖'))   return 'lien';
  if (content.startsWith('🤖'))   return content.includes('HCFA') ? 'hcfa' : 'system';
  return 'note';
}

function parsePaymentAmount(content: string): number {
  const match = content.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
  if (!match) return 0;
  return parseFloat(match[1]!.replace(/,/g, ''));
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(n);
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
      id:            true,
      caseCode:      true,
      caseType:      true,
      status:        true,
      accidentDate:  true,
      pipVerifiedAt: true,
      createdAt:     true,
      patient: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      },
      lawFirm: {
        select: { id: true, firmName: true, phone: true, email: true },
      },
      attorney: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      },
      appointments: {
        where:   { status: 'COMPLETED' },
        select:  {
          id:           true,
          status:       true,
          scheduledFor: true,
          // provider lives on Appointment, not VisitNote
          provider: { select: { firstName: true, lastName: true } },
          visitNote: {
            select: { id: true, status: true, signedAt: true },
          },
        },
        orderBy: { scheduledFor: 'desc' },
      },
      notes: {
        select:  { id: true, content: true, authorName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!raw) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  // Cast away Prisma's narrow-select type — select shape is correct
  const c = raw as unknown as CaseRow;

  // ─── CPT totals via $queryRaw ──────────────────────────────────────────

  const noteIds = c.appointments
    .map(a => a.visitNote?.id)
    .filter(Boolean) as string[];

  let totalBilled = 0;
  if (noteIds.length > 0) {
    const rows = await db.$queryRaw<CptRow[]>`
      SELECT
        vn.case_id,
        SUM(COALESCE(vsc.fee_override, vsc.fee_catalog) * vsc.units)::float AS total
      FROM visit_service_codes vsc
      JOIN visit_notes vn ON vn.id = vsc.visit_note_id
      WHERE vsc.visit_note_id = ANY(${noteIds}::text[])
      GROUP BY vn.case_id
    `;
    totalBilled = rows[0] ? Number(rows[0].total ?? 0) : 0;
  }

  // totalCollected: sum of registered partial payments from notes
  const totalCollected = c.notes
    .filter(n => n.content.startsWith('💰'))
    .reduce((sum: number, n) => sum + parsePaymentAmount(n.content), 0);

  const totalPending = Math.max(0, totalBilled - totalCollected);

  // Days pending
  const lastAppt    = c.appointments[0];
  const daysPending = lastAppt ? daysSince(lastAppt.scheduledFor) : 0;

  // ─── Timeline ─────────────────────────────────────────────────────────────

  type TimelineEntry = {
    id: string; type: string; date: string;
    title: string; subtitle: string; authorName: string | null;
  };

  const timeline: TimelineEntry[] = [];

  // From notes
  for (const n of c.notes) {
    const type  = noteTypeFromContent(n.content);
    const lines = n.content.split('\n');
    const first = lines[0] ?? n.content;
    timeline.push({
      id:         n.id,
      type,
      date:       n.createdAt.toISOString(),
      title:      first.length > 120 ? first.slice(0, 120) + '…' : first,
      subtitle:   lines.slice(1).join(' ').slice(0, 200) || '',
      authorName: n.authorName,
    });
  }

  // From completed appointments
  for (const a of c.appointments) {
    const note = a.visitNote;
    if (!note) continue;
    const providerName = a.provider
      ? `Dr. ${a.provider.firstName} ${a.provider.lastName}`
      : 'Proveedor';
    const isSigned = note.status === 'SIGNED';
    timeline.push({
      id:         a.id,
      type:       'visit',
      date:       (note.signedAt ?? a.scheduledFor).toISOString(),
      title:      `Visita clínica · ${isSigned ? 'nota firmada' : 'nota sin firmar'} · ${providerName}`,
      subtitle:   isSigned ? 'CPT codes registrados.' : 'Nota pendiente de firma del doctor.',
      authorName: null,
    });
  }

  // Auto-urgent marker if >60d
  if (daysPending > 60) {
    const urgentDate = new Date(Date.now() - (daysPending - 60) * 86_400_000);
    timeline.push({
      id:         `urgent-${caseId}`,
      type:       'urgent',
      date:       urgentDate.toISOString(),
      title:      'Caso escaló a urgente automáticamente',
      subtitle:   'Superó 60 días sin cobrar. Pendiente acción inmediata.',
      authorName: 'Sistema',
    });
  }

  // Sort newest first
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ─── Documentation checklist ───────────────────────────────────────────────

  const hasPip        = !!c.pipVerifiedAt;
  const hasSignedNote = c.appointments.some(a => a.visitNote?.status === 'SIGNED');
  const hasHcfa       = c.notes.some(n => n.content.startsWith('🤖') && n.content.includes('HCFA'));
  const hasLienNote   = c.notes.some(n => n.content.startsWith('⚖'));
  const hasPayment    = c.notes.some(n => n.content.startsWith('💰'));

  const docs = [
    { key: 'pip',       label: 'PIP verificado',      done: hasPip },
    { key: 'lien',      label: 'Lien firmado',         done: hasLienNote },
    { key: 'visitNote', label: 'Nota médica firmada',  done: hasSignedNote },
    { key: 'hcfa',      label: 'HCFA generado',        done: hasHcfa },
    { key: 'payment',   label: 'Pago registrado',      done: hasPayment },
  ];

  return NextResponse.json({
    ok: true,
    case: {
      id:           c.id,
      caseCode:     c.caseCode,
      caseType:     c.caseType,
      status:       c.status,
      accidentDate: c.accidentDate?.toISOString() ?? null,
      daysPending,
      patientName:  `${c.patient.firstName} ${c.patient.lastName}`,
      patientPhone: c.patient.phone,
      firmName:     c.lawFirm?.firmName ?? null,
      firmPhone:    c.lawFirm?.phone    ?? null,
      firmEmail:    c.lawFirm?.email    ?? null,
      attorney: c.attorney
        ? {
            firstName: c.attorney.firstName,
            lastName:  c.attorney.lastName,
            phone:     c.attorney.phone,
            email:     c.attorney.email,
          }
        : null,
      visitCount: c.appointments.length,
    },
    financial: {
      totalBilled,
      totalBilledFmt:    fmtMoney(totalBilled),
      totalCollected,
      totalCollectedFmt: fmtMoney(totalCollected),
      totalPending,
      totalPendingFmt:   fmtMoney(totalPending),
    },
    timeline,
    docs,
  });
}

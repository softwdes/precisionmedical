import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { writeAuditLog } from '@precision-medical/database';
import { actorFromHeaders } from '@/lib/actor-from-headers';

/**
 * B.28 — Settlement Workflow
 * POST /api/admin/billing/[caseId]/settle
 *
 * Body:
 *   receivedDate  — ISO date string (fecha de recepción del cheque/wire)
 *   method        — 'check' | 'wire' | 'ach'
 *   reference     — número de cheque o referencia de wire (opcional)
 *   payor         — nombre del emisor (ej: "Smith & Johnson Trust Account")
 *   amount        — número (monto recibido)
 *
 * Acciones al confirmar:
 *   1. Actualiza caso a status SETTLED + closedAt
 *   2. Crea CaseNote 🎯 con el resumen del settlement (queda en el ledger)
 *   3. writeAuditLog SETTLEMENT_PROCESSED
 *
 * Phase 1A: sin envío real de email — TODO Phase 2 via Resend
 */

interface SettleBody {
  receivedDate: string;
  method:       'check' | 'wire' | 'ach';
  reference:    string;
  payor:        string;
  amount:       number;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

const METHOD_LABELS: Record<string, string> = {
  check: 'Cheque',
  wire:  'Wire Transfer',
  ach:   'ACH',
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await ctx.params;

  let body: SettleBody;
  try {
    body = await req.json() as SettleBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }

  // Validate
  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ ok: false, error: 'INVALID_AMOUNT' }, { status: 400 });
  }
  if (!body.receivedDate) {
    return NextResponse.json({ ok: false, error: 'MISSING_DATE' }, { status: 400 });
  }

  // Verify case exists and is not already settled
  const existing = await db.case.findUnique({
    where:  { id: caseId },
    select: { id: true, status: true, caseCode: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }
  if (existing.status === 'SETTLED' || existing.status === 'CLOSED') {
    return NextResponse.json({ ok: false, error: 'ALREADY_SETTLED' }, { status: 409 });
  }

  const actor       = actorFromHeaders(req.headers);
  const receivedAt  = new Date(body.receivedDate);
  const methodLabel = METHOD_LABELS[body.method] ?? body.method;
  const refStr      = body.reference ? ` · ${body.reference}` : '';
  const amtStr      = fmtMoney(body.amount);

  // Build settlement note content (goes in ledger as 🎯 + serves as receipt)
  const noteContent = [
    `🎯 Settlement procesado: ${amtStr}`,
    `Método: ${methodLabel}${refStr}`,
    `Emisor: ${body.payor || 'Bufete'}`,
    `Fecha de recepción: ${receivedAt.toLocaleDateString('en-US', { timeZone: 'America/Denver' })}`,
  ].join(' · ');

  // Transaction: update case + create note + audit
  await db.$transaction(async tx => {
    // 1. Update case to SETTLED
    await tx.case.update({
      where: { id: caseId },
      data: {
        status:   'SETTLED',
        closedAt: new Date(),
      },
    });

    // 2. Create settlement note (appears in ledger timeline)
    await tx.caseNote.create({
      data: {
        caseId,
        content:    noteContent,
        authorName: actor.actorName ?? 'Brunella',
        tag:        'system',
      },
    });
  });

  // 3. Audit log (outside transaction — non-blocking)
  await writeAuditLog(db, {
    action:      'SETTLEMENT_PROCESSED',
    resource:    'Case',
    resourceId:  caseId,
    actorType:   actor.actorType,
    actorId:     actor.actorId,
    actorName:   actor.actorName,
    metadata: {
      caseCode:    existing.caseCode,
      amount:      body.amount,
      method:      body.method,
      reference:   body.reference,
      payor:       body.payor,
      receivedAt:  body.receivedDate,
    },
  }).catch(console.error);

  return NextResponse.json({
    ok: true,
    settled: {
      caseId,
      caseCode:   existing.caseCode,
      amount:     body.amount,
      amountFmt:  amtStr,
      method:     methodLabel,
      reference:  body.reference || null,
      payor:      body.payor,
      receivedAt: body.receivedDate,
      processedAt: new Date().toISOString(),
    },
  });
}

/**
 * POST /api/sms/send-portal-link
 *
 * Phoenix Phase 0 — AI Receptionist hook (stub).
 * Genera magic link del portal del paciente (B.5) y dispara envío vía Weave SMS.
 *
 * Consumido HOY por: Recepción humana en B.2 → botón "Enviar portal al paciente".
 * Consumido EN FUTURO por: AI Receptionist (Phase 3+) al colgar la llamada.
 *
 * Phase 0: este stub NO envía SMS real (Weave BAA aún no firmado).
 * Solo valida payload + escribe audit log con actorType. Phase 2 conecta
 * a Weave API (después de BAA Weave firmado).
 *
 * Mockup canónico: B.5 (Portal landing del paciente).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

// ─── Zod schema estricto ────────────────────────────────────────────
const InputSchema = z.object({
  caseId: z.string().min(1, 'caseId requerido'),
  patientPhone: z
    .string()
    .regex(/^[+0-9\s()-]{7,20}$/, 'Phone format inválido'),
  patientLanguage: z.enum(['es', 'en']).default('es'),
  customMessage: z.string().max(500).optional(),
  linkExpiresIn: z
    .enum(['1h', '6h', '24h', '7d'])
    .default('24h'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);

  // 1. Validate
  let parsed;
  try {
    const body = await req.json();
    parsed = InputSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_PAYLOAD',
        details: err instanceof z.ZodError ? err.flatten() : String(err),
      },
      { status: 400 },
    );
  }

  // 2. Idempotency
  if (actor.idempotencyKey) {
    const existing = await db.auditLog.findFirst({
      where: {
        idempotencyKey: actor.idempotencyKey,
        action: 'SEND_PORTAL_LINK',
      },
      select: { id: true, metadata: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        auditLogId: existing.id,
      });
    }
  }

  // 3. Phase 0 stub: NO envía SMS. Genera un fake magic link.
  //    Phase 2 reemplaza por Weave API call (post-BAA Weave).
  const magicToken = `mt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const stubLink = `https://portal.lienmaster.net/login?token=${magicToken}`;

  // 4. Audit log
  const log = await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SEND_PORTAL_LINK',
    entityType: 'cases',
    entityId: parsed.caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    idempotencyKey: actor.idempotencyKey,
    metadata: {
      phase: 0,
      stub: true,
      patientLanguage: parsed.patientLanguage,
      linkExpiresIn: parsed.linkExpiresIn,
      // NOTE: phone NOT logged in clear (PHI-adjacent). Phase 1+ usar hash/last4.
      phoneLast4: parsed.patientPhone.slice(-4),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      stub: true,
      magicToken,
      stubLink, // Phase 0 only — Phase 2 ya no devuelve link, lo manda por SMS via Weave.
      auditLogId: log.id,
      message: 'Phase 0 stub — Weave SMS no enviado (BAA pendiente). Audit log written.',
    },
    { status: 200 },
  );
}

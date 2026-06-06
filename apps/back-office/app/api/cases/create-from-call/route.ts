/**
 * POST /api/cases/create-from-call
 *
 * Phoenix Phase 0 — AI Receptionist hook (stub).
 * Crea esqueleto de Case desde una llamada (humana o AI agent).
 *
 * Consumido HOY por: Recepción humana en B.2 (Crear caso) via UI.
 * Consumido EN FUTURO por: AI Receptionist (Phase 3+) via webhook.
 *
 * Phase 0: este stub NO crea nada todavía (no hay tabla Case en schema).
 * Solo valida payload + escribe audit log con actorType. Listo para
 * que Phase 1 lo conecte a Prisma con tabla Case real.
 *
 * Mockup canónico: B.2 (Crear caso) · spec en docs/propuesta-clinica/mockups-flujo-completo.html
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

// ─── Zod schema estricto — AI agent puede mandar payloads creativos ──
const InputSchema = z.object({
  patient: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    phone: z.string().regex(/^[+0-9\s()-]{7,20}$/, 'Phone format inválido'),
    preferredLanguage: z.enum(['es', 'en']).optional(),
  }),
  accident: z.object({
    dateOfLoss: z.string().datetime().optional(), // ISO 8601
    type: z.enum(['MVA', 'WORK', 'SLIP_FALL', 'OTHER']).default('MVA'),
    notes: z.string().max(2000).optional(),
  }),
  lawFirmName: z.string().max(200).optional(),
  attorneyName: z.string().max(200).optional(),
  callerType: z
    .enum(['PATIENT', 'ATTORNEY', 'CASE_MANAGER', 'FAMILY'])
    .default('PATIENT'),
  source: z.enum(['PHONE_HUMAN', 'PHONE_AI', 'WEB_FORM']).default('PHONE_HUMAN'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Extract actor context (HUMAN_USER | AI_AGENT | SYSTEM)
  const actor = actorFromHeaders(req.headers);

  // 2. Validate input
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

  // 3. Idempotency check (when AI agent retries)
  if (actor.idempotencyKey) {
    const existing = await db.auditLog.findFirst({
      where: {
        idempotencyKey: actor.idempotencyKey,
        action: 'CREATE_CASE_FROM_CALL',
      },
      select: { id: true, entityId: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        caseId: existing.entityId,
        auditLogId: existing.id,
      });
    }
  }

  // 4. Phase 0 stub: NO crea Case real (tabla no existe todavía).
  //    Phase 1 reemplaza este bloque por prisma.case.create({...}).
  const stubCaseId = `case_stub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // 5. Write audit log
  const log = await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_CASE_FROM_CALL',
    entityType: 'cases',
    entityId: stubCaseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    idempotencyKey: actor.idempotencyKey,
    after: parsed,
    metadata: {
      phase: 0,
      stub: true,
      source: parsed.source,
      callerType: parsed.callerType,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      stub: true,
      caseId: stubCaseId,
      auditLogId: log.id,
      message: 'Phase 0 stub — Case table not yet wired. Audit log written.',
    },
    { status: 201 },
  );
}

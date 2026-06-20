/**
 * GET /api/admin/audit-logs
 *
 * B.44 — Visor de Audit Log (HIPAA compliance).
 *
 * Query params:
 *   page        — página (1-based, default 1)
 *   limit       — filas por página (default 50, max 200)
 *   actorType   — HUMAN_USER | AI_AGENT | SYSTEM
 *   action      — filtro exacto de acción (ej. CREATE_CASE)
 *   entityType  — filtro exacto de entidad (ej. cases)
 *   entityId    — ID específico de entidad
 *   from        — ISO date inicio (ej. 2026-06-01)
 *   to          — ISO date fin (ej. 2026-06-30)
 *   q           — búsqueda libre en action + metadata (via icontains)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import type { ActorType } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const page       = Math.max(1, parseInt(searchParams.get('page')  ?? '1', 10));
  const limit      = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const actorType  = searchParams.get('actorType') ?? '';
  const action     = searchParams.get('action')     ?? '';
  const entityType = searchParams.get('entityType') ?? '';
  const entityId   = searchParams.get('entityId')   ?? '';
  const from       = searchParams.get('from')       ?? '';
  const to         = searchParams.get('to')         ?? '';
  const q          = searchParams.get('q')          ?? '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (actorType)  where.actorType  = actorType as ActorType;
  if (action)     where.action     = { contains: action,     mode: 'insensitive' };
  if (entityType) where.entityType = { contains: entityType, mode: 'insensitive' };
  if (entityId)   where.entityId   = entityId;

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) }                          : {}),
      ...(to   ? { lte: new Date(new Date(to).setHours(23,59,59,999)) } : {}),
    };
  }

  if (q.length >= 2) {
    where.OR = [
      { action:     { contains: q, mode: 'insensitive' } },
      { entityType: { contains: q, mode: 'insensitive' } },
      { entityId:   { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      select: {
        id:           true,
        actorType:    true,
        actorUserId:  true,
        actorRole:    true,
        action:       true,
        entityType:   true,
        entityId:     true,
        ipAddress:    true,
        metadata:     true,
        createdAt:    true,
      },
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
  ]);

  // Distinct actions y entityTypes para los filtros del UI
  const [actions, entityTypes] = await Promise.all([
    db.auditLog.findMany({ select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' } }),
    db.auditLog.findMany({ where: { entityType: { not: null } }, select: { entityType: true }, distinct: ['entityType'], orderBy: { entityType: 'asc' } }),
  ]);

  return NextResponse.json({
    ok:          true,
    total,
    page,
    limit,
    pages:       Math.ceil(total / limit),
    logs:        logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    filterOptions: {
      actions:     actions.map(a => a.action),
      entityTypes: entityTypes.map(e => e.entityType).filter(Boolean),
    },
  });
}

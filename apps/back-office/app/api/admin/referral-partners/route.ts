/**
 * Catálogo de referidores — CRUD API
 *
 * GET    /api/admin/referral-partners?q=&type=&all=1  → catálogo + `results`
 * POST   /api/admin/referral-partners                 → crear
 * PATCH  /api/admin/referral-partners                 → editar (body.id requerido)
 * DELETE /api/admin/referral-partners?id=...          → soft delete
 *
 * Quién nos manda pacientes y NO es un bufete: quiroprácticos, centros de
 * accidente, otras clínicas. Los bufetes tienen su propio catálogo (`Lawyer`)
 * y el personal propio el suyo (`Provider`) — ver el comentario del modelo
 * `ReferralPartner` para por qué son tres tablas y no una.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const TIPOS = ['CHIROPRACTOR', 'ACCIDENT_CENTER', 'MEDICAL_PROVIDER', 'OTHER'] as const;

const InputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(TIPOS).default('CHIROPRACTOR'),
  name: z.string().min(2).max(200),
  contactName: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(10).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

/** Campos escribibles — evita repetir el mapeo en POST, PATCH y revive. */
function toData(parsed: z.infer<typeof InputSchema>) {
  return {
    type: parsed.type,
    name: parsed.name.trim(),
    contactName: parsed.contactName?.trim() || null,
    phone: parsed.phone ?? null,
    email: parsed.email ?? null,
    address: parsed.address ?? null,
    city: parsed.city ?? null,
    state: parsed.state ?? null,
    zip: parsed.zip ?? null,
    notes: parsed.notes ?? null,
    status: parsed.status,
  };
}

/**
 * Choque de nombres SIN distinguir mayúsculas.
 *
 * El índice único de Postgres compara byte a byte, así que dejaría entrar
 * "axcess" al lado de "Axcess" — que es exactamente el desorden que este
 * catálogo viene a terminar (el histórico tenía el mismo lugar escrito de tres
 * formas). El índice igual queda: es la última red si dos altas entran juntas.
 */
async function mismoNombre(name: string, exceptoId?: string) {
  return db.referralPartner.findFirst({
    where: {
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(exceptoId ? { NOT: { id: exceptoId } } : {}),
    },
  });
}

const SELECT = {
  id: true, type: true, name: true, contactName: true,
  phone: true, email: true, address: true, city: true, state: true, zip: true,
  notes: true, status: true,
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  const type = sp.get('type') ?? '';
  /** El catálogo muestra también los inactivos; los selectores, no. */
  const all = sp.get('all') === '1';

  const where: Prisma.ReferralPartnerWhereInput = {
    deletedAt: null,
    ...(all ? {} : { status: 'ACTIVE' }),
    ...(TIPOS.includes(type as (typeof TIPOS)[number]) ? { type: type as (typeof TIPOS)[number] } : {}),
  };
  if (q) {
    // También por la persona de contacto y por teléfono: recepción a veces
    // tiene el nombre del doctor y no el del lugar.
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { contactName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ];
  }

  const partners = await db.referralPartner.findMany({
    where,
    orderBy: { name: 'asc' },
    select: SELECT,
    take: 100,
  });

  /* Sin los conteos de pacientes/casos: esta ruta la usan los SELECTORES, que
     no los muestran, y son dos consultas más en cada tecla. La pantalla del
     catálogo los arma en el servidor — ver `settings/page.tsx`. */
  return NextResponse.json({
    ok: true,
    partners,
    /* El mismo dato en el contrato del `Autocomplete` (`{ results }`), para no
       tener dos rutas que leen la misma tabla. */
    results: partners.map(p => ({
      id: p.id,
      label: p.name,
      subtitle: [p.contactName, p.city].filter(Boolean).join(' · '),
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const existing = await mismoNombre(parsed.name);
  if (existing && !existing.deletedAt) {
    return NextResponse.json(
      { error: 'DUPLICATE_NAME', params: { name: existing.name }, partner: existing },
      { status: 409 },
    );
  }

  // Un referidor borrado bloquea el alta del mismo nombre por el índice único.
  // Revivirlo es lo correcto: es el mismo lugar, y así no se pierde el vínculo
  // con los casos y pacientes que ya lo señalaban.
  const created = existing
    ? await db.referralPartner.update({
        where: { id: existing.id },
        data: { ...toData(parsed), deletedAt: null },
      })
    : await db.referralPartner.create({ data: toData(parsed) });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: existing ? 'RESTORE_REFERRAL_PARTNER' : 'CREATE_REFERRAL_PARTNER',
    entityType: 'referral_partners',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: existing ? (existing as unknown as Prisma.JsonValue) : undefined,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, partner: created, restored: !!existing }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.referralPartner.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (parsed.name.trim().toLowerCase() !== before.name.toLowerCase()) {
    const dup = await mismoNombre(parsed.name, before.id);
    if (dup && !dup.deletedAt) {
      return NextResponse.json(
        { error: 'DUPLICATE_NAME', params: { name: dup.name }, partner: dup },
        { status: 409 },
      );
    }
  }

  const updated = await db.referralPartner.update({ where: { id: parsed.id }, data: toData(parsed) });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'UPDATE_REFERRAL_PARTNER',
    entityType: 'referral_partners',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, partner: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.referralPartner.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  /* Borrado lógico y los vínculos INTACTOS: los casos que ya señalaban a este
     referidor siguen señalándolo. Si se borrara el vínculo, se perdería el
     único registro de quién mandó a esos pacientes — que es justo el dato que
     este catálogo existe para no perder. */
  const deleted = await db.referralPartner.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'SOFT_DELETE_REFERRAL_PARTNER',
    entityType: 'referral_partners',
    entityId: deleted.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}

/**
 * Catálogo de precios — CRUD
 *
 * GET    /api/admin/catalog            → todos los ítems (labs · inyectables · servicios · férulas)
 * POST   /api/admin/catalog            → crear
 * PATCH  /api/admin/catalog            → editar (body.id requerido)
 * DELETE /api/admin/catalog?id=...     → soft delete
 *
 * NOTA: se usa $queryRaw / $executeRaw porque el cliente de Prisma todavía no
 * conoce CatalogItem (el engine de Windows estaba bloqueado al generar). Mismo
 * patrón que VisitServiceCode. Al regenerar se puede migrar a db.catalogItem.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders, Prisma } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { listCatalog, findCatalogItem } from '@/lib/catalog';

const ItemSchema = z.object({
  id: z.number().int().optional(),
  kind: z.enum(['LAB', 'INJECTION', 'SERVICE', 'DME']),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  category: z.string().max(40).nullable().default(null),
  section: z.string().max(40).nullable().default(null),
  vendor: z.string().max(40).default('IN_HOUSE'),

  costPrice: z.number().nonnegative().nullable().default(null),
  publicPrice: z.number().nonnegative().nullable().default(null),
  memberPrice: z.number().nonnegative().nullable().default(null),
  priceNote: z.string().max(200).nullable().default(null),
  unitLabel: z.string().max(60).nullable().default(null),

  hasReflex: z.boolean().default(false),
  reflexCost: z.number().nonnegative().nullable().default(null),
  reflexPrice: z.number().nonnegative().nullable().default(null),
  reflexPolicy: z.string().max(2000).nullable().default(null),

  tubeColors: z.array(z.string().max(30)).default([]),
  containerType: z.string().max(40).nullable().default(null),
  specialHandling: z.string().max(500).nullable().default(null),

  sizeLabel: z.string().max(60).nullable().default(null),
  alwaysFullPayment: z.boolean().default(false),

  cptCode: z.string().max(20).nullable().default(null),
  hcpcsCode: z.string().max(20).nullable().default(null),
  ndcCode: z.string().max(20).nullable().default(null),

  isActive: z.boolean().default(true),
  isOrderable: z.boolean().default(true),
  replacedByCode: z.string().max(64).nullable().default(null),
  notes: z.string().max(4000).nullable().default(null),

  /** Marca el precio como verificado hoy (checkbox del diálogo). */
  markVerified: z.boolean().default(false),
  /** Motivo del cambio de precio — queda en el historial. */
  priceChangeReason: z.string().max(300).nullable().default(null),
});

type ItemInput = z.infer<typeof ItemSchema>;

/** Solo admin escribe. El doctor consulta. */
async function requireEditor(): Promise<{ email: string } | NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const role = await fetchDbRole(user.email);
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN_EDIT_CATALOG' }, { status: 403 });
  }
  return { email: user.email };
}

function parseBody(raw: unknown): ItemInput | NextResponse {
  try {
    return ItemSchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  return NextResponse.json({ items: await listCatalog() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const auth = await requireEditor();
  if (auth instanceof NextResponse) return auth;

  const p = parseBody(await req.json());
  if (p instanceof NextResponse) return p;

  const verified = p.markVerified;
  const rows = await db.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "catalog_items" (
      kind, code, name, category, section, vendor,
      "costPrice", "publicPrice", "memberPrice", "priceNote", "unitLabel",
      "hasReflex", "reflexCost", "reflexPrice", "reflexPolicy",
      "tubeColors", "containerType", "specialHandling",
      "sizeLabel", "alwaysFullPayment",
      "cptCode", "hcpcsCode", "ndcCode",
      "priceStatus", "priceVerifiedAt", "priceVerifiedBy",
      "isActive", "isOrderable", "replacedByCode", notes, "updatedAt"
    ) VALUES (
      ${p.kind}::"catalog_item_kind", ${p.code}, ${p.name}, ${p.category}, ${p.section}, ${p.vendor},
      ${p.costPrice}, ${p.publicPrice}, ${p.memberPrice}, ${p.priceNote}, ${p.unitLabel},
      ${p.hasReflex}, ${p.reflexCost}, ${p.reflexPrice}, ${p.reflexPolicy},
      ${p.tubeColors}::text[], ${p.containerType}, ${p.specialHandling},
      ${p.sizeLabel}, ${p.alwaysFullPayment},
      ${p.cptCode}, ${p.hcpcsCode}, ${p.ndcCode},
      ${verified ? 'VERIFIED' : 'UNVERIFIED'}::"catalog_price_status",
      ${verified ? new Date() : null}, ${verified ? auth.email : null},
      ${p.isActive}, ${p.isOrderable}, ${p.replacedByCode}, ${p.notes}, NOW()
    )
    RETURNING id
  `;

  const id = rows[0]?.id;
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_CATALOG_ITEM',
    entityType: 'catalog_items',
    entityId: String(id),
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: p as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const auth = await requireEditor();
  if (auth instanceof NextResponse) return auth;

  const p = parseBody(await req.json());
  if (p instanceof NextResponse) return p;
  if (!p.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await findCatalogItem(p.id);
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const priceChanged =
    before.costPrice !== p.costPrice ||
    before.publicPrice !== p.publicPrice ||
    before.memberPrice !== p.memberPrice;

  // Verificado si lo marcaron, o si ya lo estaba y el precio no se movió.
  const verified = p.markVerified || (before.priceStatus === 'VERIFIED' && !priceChanged);

  await db.$transaction(async (tx) => {
    // El historial guarda los valores ANTERIORES al cambio — junto con la fila
    // actual reconstruye la serie completa de precios.
    if (priceChanged) {
      await tx.$executeRaw`
        INSERT INTO "catalog_price_history"
          ("itemId", "costPrice", "publicPrice", "memberPrice", "changedByName", reason)
        VALUES (${p.id}, ${before.costPrice}, ${before.publicPrice}, ${before.memberPrice},
                ${auth.email}, ${p.priceChangeReason})
      `;
    }

    await tx.$executeRaw`
      UPDATE "catalog_items" SET
        kind              = ${p.kind}::"catalog_item_kind",
        code              = ${p.code},
        name              = ${p.name},
        category          = ${p.category},
        section           = ${p.section},
        vendor            = ${p.vendor},
        "costPrice"       = ${p.costPrice},
        "publicPrice"     = ${p.publicPrice},
        "memberPrice"     = ${p.memberPrice},
        "priceNote"       = ${p.priceNote},
        "unitLabel"       = ${p.unitLabel},
        "hasReflex"       = ${p.hasReflex},
        "reflexCost"      = ${p.reflexCost},
        "reflexPrice"     = ${p.reflexPrice},
        "reflexPolicy"    = ${p.reflexPolicy},
        "tubeColors"      = ${p.tubeColors}::text[],
        "containerType"   = ${p.containerType},
        "specialHandling" = ${p.specialHandling},
        "sizeLabel"       = ${p.sizeLabel},
        "alwaysFullPayment" = ${p.alwaysFullPayment},
        "cptCode"         = ${p.cptCode},
        "hcpcsCode"       = ${p.hcpcsCode},
        "ndcCode"         = ${p.ndcCode},
        "priceStatus"     = ${verified ? 'VERIFIED' : 'UNVERIFIED'}::"catalog_price_status",
        "priceVerifiedAt" = ${p.markVerified ? new Date() : (verified ? before.priceVerifiedAt : null)},
        "priceVerifiedBy" = ${p.markVerified ? auth.email : (verified ? before.priceVerifiedBy : null)},
        "isActive"        = ${p.isActive},
        "isOrderable"     = ${p.isOrderable},
        "replacedByCode"  = ${p.replacedByCode},
        notes             = ${p.notes},
        "updatedAt"       = NOW()
      WHERE id = ${p.id}
    `;
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: priceChanged ? 'UPDATE_CATALOG_PRICE' : 'UPDATE_CATALOG_ITEM',
    entityType: 'catalog_items',
    entityId: String(p.id),
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: p as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id: p.id });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const auth = await requireEditor();
  if (auth instanceof NextResponse) return auth;

  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await findCatalogItem(id);
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.$executeRaw`
    UPDATE "catalog_items"
    SET "deletedAt" = NOW(), "isActive" = false, "updatedAt" = NOW()
    WHERE id = ${id}
  `;

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_CATALOG_ITEM',
    entityType: 'catalog_items',
    entityId: String(id),
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { SEDE_WHERE } from '@/lib/clinic-sede';

const CLINIC_SELECT = {
  id: true, name: true, address: true, phone: true, cellPhone: true,
  email: true, zipCode: true, state: true, city: true, color: true,
  _count: { select: { appointments: true } },
} as const;

/**
 * @param soloSedes `?soloSedes=1` devuelve solo las sedes propias (ver
 * lib/clinic-sede). Es opt-in y no el default a proposito: Settings administra
 * la tabla entera, externos incluidos, y filtrar por defecto le escondería filas
 * que justamente va a editar.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const soloSedes = new URL(req.url).searchParams.get('soloSedes') === '1';
  const clinics = await db.clinic.findMany({
    where:   soloSedes ? SEDE_WHERE : undefined,
    orderBy: { name: 'asc' },
    select:  CLINIC_SELECT,
  });
  return NextResponse.json({ clinics });
}

const CreateSchema = z.object({
  name:      z.string().min(1).max(100),
  address:   z.string().max(300).optional(),
  phone:     z.string().max(30).optional(),
  cellPhone: z.string().max(30).optional(),
  email:     z.string().email().optional().or(z.literal('')),
  zipCode:   z.string().max(10).optional(),
  state:     z.string().max(2).optional(),
  city:      z.string().max(100).optional(),
  color:     z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  let parsed;
  try { parsed = CreateSchema.parse(await req.json()); }
  catch { return NextResponse.json({ error: 'INVALID_PAYLOAD', message: 'Datos inválidos. Verifica que todos los campos estén completos.' }, { status: 400 }); }

  const exists = await db.clinic.findUnique({ where: { name: parsed.name }, select: { id: true } });
  if (exists) return NextResponse.json({ error: 'DUPLICATE_NAME', message: `Ya existe una clínica con el nombre "${parsed.name}".` }, { status: 409 });

  const clinic = await db.clinic.create({
    data: {
      name: parsed.name,
      address:   parsed.address   || null,
      phone:     parsed.phone     || null,
      cellPhone: parsed.cellPhone || null,
      email:     parsed.email     || null,
      zipCode:   parsed.zipCode   || null,
      state:     parsed.state     || null,
      city:      parsed.city      || null,
      color:     parsed.color     || '#6366F1',
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
    action: 'CREATE_CLINIC', entityType: 'clinics', entityId: clinic.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    after: clinic,
  });

  return NextResponse.json({ clinic }, { status: 201 });
}

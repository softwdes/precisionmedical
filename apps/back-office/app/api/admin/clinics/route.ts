import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function GET(): Promise<NextResponse> {
  const clinics = await db.clinic.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, address: true, phone: true,
      _count: { select: { appointments: true } },
    },
  });
  return NextResponse.json({ clinics });
}

const CreateSchema = z.object({
  name:    z.string().min(1).max(100),
  address: z.string().max(200).optional(),
  phone:   z.string().max(30).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try { parsed = CreateSchema.parse(await req.json()); }
  catch (err) { return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 }); }

  const exists = await db.clinic.findUnique({ where: { name: parsed.name }, select: { id: true } });
  if (exists) return NextResponse.json({ error: 'DUPLICATE_NAME', message: `Ya existe una clínica con el nombre "${parsed.name}".` }, { status: 409 });

  const clinic = await db.clinic.create({
    data: { name: parsed.name, address: parsed.address ?? null, phone: parsed.phone ?? null },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId,
    action: 'CREATE_CLINIC', entityType: 'clinics', entityId: clinic.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    after: clinic,
  });

  return NextResponse.json({ clinic }, { status: 201 });
}

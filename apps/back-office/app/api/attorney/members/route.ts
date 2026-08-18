/**
 * Portal Legal · Miembros del despacho (F4)
 *
 * POST   /api/attorney/members   → alta de un miembro (opcionalmente con acceso)
 * PATCH  /api/attorney/members   → editar, activar/desactivar, dar o quitar acceso
 * DELETE /api/attorney/members?id=…  → baja lógica
 *
 * Todo cuelga del bufete de la SESIÓN: no hay un `parentFirmId` que el cliente
 * pueda mandar. Un despacho no puede crear gente en otro ni editar a nadie que
 * no sea suyo — y eso se comprueba en cada verbo, no una sola vez.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import { getSessionLawyer, type SessionLawyer } from '@/lib/get-session-lawyer';
import { canAssignStaff } from '@/lib/attorney-portal';
import { grantLawyerAccess, revokeLawyerAccess } from '@/lib/lawyer-access';
import { resolveActor } from '@/lib/actor';

const MEMBER_ROLES = ['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT', 'OTHER'] as const;

const HTTP_STATUS: Record<string, number> = {
  NO_EMAIL: 400, NOT_ACTIVE: 400, EMAIL_IN_USE: 409,
  AUTH_CREATE_FAILED: 500, USER_INSERT_FAILED: 500,
  NO_ACCESS: 404, NOT_A_LAWYER_ACCOUNT: 409, BAN_FAILED: 500,
};

/**
 * Gestionar el directorio es del titular. Se resuelve una vez por request y
 * devuelve la sesión ya estrechada, para que ningún verbo pueda olvidarse.
 */
async function requireFirmAdmin(): Promise<SessionLawyer | null> {
  const lawyer = await getSessionLawyer();
  if (!lawyer?.firmId) return null;
  return canAssignStaff(lawyer) ? lawyer : null;
}

const CreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  email:     z.string().email().nullable().optional(),
  phone:     z.string().max(50).nullable().optional(),
  memberRole: z.enum(MEMBER_ROLES).default('CASE_MANAGER'),
  barNumber:  z.string().max(50).nullable().optional(),
  /** Si viene true, además del alta se le crea el acceso al portal. */
  grantAccess: z.boolean().default(false),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const lawyer = await requireFirmAdmin();
  if (!lawyer?.firmId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let input: z.infer<typeof CreateSchema>;
  try {
    input = CreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  if (input.grantAccess && !input.email) {
    return NextResponse.json(
      { error: 'NO_EMAIL', message: 'Para dar acceso al portal hace falta un email.' },
      { status: 400 },
    );
  }

  // `lawyers.email` es @unique en toda la tabla, no solo dentro del bufete: sin
  // este chequeo el insert revienta con un P2002 crudo.
  if (input.email) {
    const dup = await db.lawyer.findUnique({ where: { email: input.email }, select: { id: true } });
    if (dup) {
      return NextResponse.json(
        { error: 'DUPLICATE_EMAIL', message: `Ya existe una ficha con el email "${input.email}".` },
        { status: 409 },
      );
    }
  }

  const firm = await db.lawyer.findUnique({
    where: { id: lawyer.firmId },
    select: { id: true, firmName: true, city: true, state: true },
  });
  if (!firm) return NextResponse.json({ error: 'FIRM_NOT_FOUND' }, { status: 404 });

  const created = await db.lawyer.create({
    data: {
      // `FIRM_MEMBER` es el valor correcto para alguien con bufete padre. El
      // alta de Externals los crea como `INDEPENDENT`, que es una inconsistencia
      // vieja; acá no se replica. Nada del scoping depende de este enum —
      // `parentFirmId` es lo que manda (ver `get-session-lawyer.ts`).
      entityType: 'FIRM_MEMBER',
      parentFirmId: firm.id,
      firstName: input.firstName,
      lastName:  input.lastName,
      email:     input.email ?? null,
      phone:     input.phone ?? null,
      memberRole: input.memberRole,
      barNumber:  input.memberRole === 'ATTORNEY' ? (input.barNumber ?? null) : null,
      city:  firm.city,
      state: firm.state,
      status: 'ACTIVE',
    },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      firmName: true, status: true, memberRole: true,
    },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'ATTORNEY_CREATE_MEMBER',
    entityType: 'lawyers',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
    metadata: { firmId: firm.id, by: lawyer.email },
  });

  // El acceso va después del alta y NO es transaccional a propósito: si el
  // correo falla, la persona ya quedó creada y el enlace se devuelve igual.
  // Deshacer el alta por un fallo de correo sería peor que dejarla sin acceso.
  let access = null;
  if (input.grantAccess) {
    const granted = await grantLawyerAccess({ ...created, parentFirm: { firmName: firm.firmName } });
    access = {
      ok: granted.ok,
      error: granted.error,
      message: granted.message,
      emailSent: granted.emailSent ?? false,
      activationLink: granted.activationLink ?? null,
    };
  }

  return NextResponse.json({ ok: true, member: created, access });
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
  email:     z.string().email().nullable().optional(),
  phone:     z.string().max(50).nullable().optional(),
  memberRole: z.enum(MEMBER_ROLES).optional(),
  barNumber:  z.string().max(50).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  /** 'grant' crea o reenvía el acceso; 'revoke' lo quita. */
  accessAction: z.enum(['grant', 'revoke']).optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const lawyer = await requireFirmAdmin();
  if (!lawyer?.firmId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let input: z.infer<typeof UpdateSchema>;
  try {
    input = UpdateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // El miembro tiene que ser DE SU bufete. Buscar por id a secas dejaría editar
  // —y darle acceso a— cualquier ficha de la tabla con solo cambiar el id.
  const member = await db.lawyer.findFirst({
    where: { id: input.id, deletedAt: null, parentFirmId: lawyer.firmId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      firmName: true, status: true, memberRole: true,
    },
  });
  if (!member) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (input.email && input.email !== member.email) {
    const dup = await db.lawyer.findUnique({ where: { email: input.email }, select: { id: true } });
    if (dup && dup.id !== member.id) {
      return NextResponse.json(
        { error: 'DUPLICATE_EMAIL', message: `Ya existe una ficha con el email "${input.email}".` },
        { status: 409 },
      );
    }
  }

  const data: Prisma.LawyerUpdateInput = {};
  if (input.firstName  !== undefined) data.firstName  = input.firstName;
  if (input.lastName   !== undefined) data.lastName   = input.lastName;
  if (input.email      !== undefined) data.email      = input.email;
  if (input.phone      !== undefined) data.phone      = input.phone;
  if (input.memberRole !== undefined) data.memberRole = input.memberRole;
  if (input.barNumber  !== undefined) data.barNumber  = input.barNumber;
  if (input.status     !== undefined) data.status     = input.status;

  const updated = Object.keys(data).length > 0
    ? await db.lawyer.update({
        where: { id: member.id },
        data,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          firmName: true, status: true, memberRole: true,
        },
      })
    : member;

  const actor = await resolveActor(req.headers);

  let access = null;
  if (input.accessAction === 'grant') {
    const firm = await db.lawyer.findUnique({
      where: { id: lawyer.firmId },
      select: { firmName: true },
    });
    const granted = await grantLawyerAccess({ ...updated, parentFirm: firm });
    if (!granted.ok) {
      return NextResponse.json(
        { error: granted.error, message: granted.message },
        { status: HTTP_STATUS[granted.error ?? ''] ?? 500 },
      );
    }
    access = {
      emailSent: granted.emailSent ?? false,
      activationLink: granted.activationLink ?? null,
    };
    await writeAuditLog(db, {
      actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
      action: granted.created ? 'ATTORNEY_CREATE_MEMBER_ACCESS' : 'ATTORNEY_RESEND_MEMBER_ACCESS',
      entityType: 'lawyers', entityId: member.id,
      ipAddress: actor.ipAddress, userAgent: actor.userAgent,
      metadata: { email: updated.email, by: lawyer.email, emailSent: granted.emailSent },
    });
  }

  if (input.accessAction === 'revoke') {
    const revoked = await revokeLawyerAccess(updated);
    if (!revoked.ok) {
      return NextResponse.json(
        { error: revoked.error, message: revoked.message },
        { status: HTTP_STATUS[revoked.error ?? ''] ?? 500 },
      );
    }
    await writeAuditLog(db, {
      actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
      action: 'ATTORNEY_REVOKE_MEMBER_ACCESS',
      entityType: 'lawyers', entityId: member.id,
      ipAddress: actor.ipAddress, userAgent: actor.userAgent,
      metadata: { email: updated.email, by: lawyer.email },
    });
  }

  if (Object.keys(data).length > 0) {
    await writeAuditLog(db, {
      actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
      action: 'ATTORNEY_UPDATE_MEMBER',
      entityType: 'lawyers', entityId: member.id,
      ipAddress: actor.ipAddress, userAgent: actor.userAgent,
      before: member as unknown as Prisma.JsonValue,
      after: updated as unknown as Prisma.JsonValue,
      metadata: { firmId: lawyer.firmId, by: lawyer.email },
    });
  }

  return NextResponse.json({ ok: true, member: updated, access });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const lawyer = await requireFirmAdmin();
  if (!lawyer?.firmId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const member = await db.lawyer.findFirst({
    where: { id, deletedAt: null, parentFirmId: lawyer.firmId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!member) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Nadie se borra a sí mismo: dejaría al despacho sin quien administre.
  if (member.id === lawyer.id) {
    return NextResponse.json(
      { error: 'CANNOT_DELETE_SELF', message: 'No podés darte de baja a vos mismo.' },
      { status: 400 },
    );
  }

  // Baja lógica; y si tenía acceso, se revoca. Borrar la ficha y dejarle la
  // cuenta viva sería sacarlo de la lista sin sacarlo del portal.
  await revokeLawyerAccess(member);

  await db.lawyer.update({
    where: { id: member.id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
    action: 'ATTORNEY_DELETE_MEMBER',
    entityType: 'lawyers', entityId: member.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    before: member as unknown as Prisma.JsonValue,
    metadata: { firmId: lawyer.firmId, by: lawyer.email },
  });

  return NextResponse.json({ ok: true });
}

/**
 * GET    /api/admin/cases/[id]  — detalles del caso
 * PATCH  /api/admin/cases/[id]  — editar campos básicos
 * DELETE /api/admin/cases/[id]  — soft-delete (status → CANCELLED)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, casePrefixFor } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { COVERAGE_FIELDS, resolveCoverage, serializeCoverage } from '@/lib/coverage';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const c = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseCode: true,
      caseType: true,
      status: true,
      accidentType: true,
      accidentDate: true,
      accidentLocation: true,
      accidentNotes: true,
      consentsData: true,
      ...COVERAGE_FIELDS,
      consentSignaturePng: true,
      portalToken: true,
      createdAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      lawFirm: { select: { id: true, firmName: true } },
      attorney: { select: { id: true, firstName: true, lastName: true } },
      primaryInsurance: { select: { id: true, name: true } },
      specialty: { select: { id: true, name: true } },
    },
  });

  if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  // La cobertura va resuelta y no cruda: el cliente no debe reimplementar la
  // regla de qué cuenta como seguro (es lo que hizo que hubiera tres verdades).
  return NextResponse.json({ ok: true, case: c, coverage: serializeCoverage(resolveCoverage(c)) });
}

const PatchSchema = z.object({
  status:           z.enum(['NEW_REFERRAL','INTAKE_PENDING','INTAKE_COMPLETED','CONFIRMED','ACTIVE','MMI','CLOSED','SETTLED','ARCHIVED','CANCELLED']).optional(),
  caseType:         z.enum(['MVA','GENERAL','WORKERS_COMP','NURSING_HOME']).optional(),
  accidentType:     z.enum(['AUTO','MOTORCYCLE','PEDESTRIAN','WORKPLACE','OTHER']).nullable().optional(),
  accidentDate:     z.string().nullable().optional(),
  accidentLocation: z.string().nullable().optional(),
  accidentNotes:    z.string().nullable().optional(),
  signatureExempt:  z.boolean().optional(),
  lawFirmId:        z.string().nullable().optional(),
  attorneyId:       z.string().nullable().optional(),
  paralegalId:      z.string().nullable().optional(),
  legalAssistantId: z.string().nullable().optional(),
  specialtyId:      z.string().nullable().optional(),
  // text fields stored in consentsData JSON
  chiropractor:     z.string().nullable().optional(),
  lawFirmLabel:     z.string().nullable().optional(),
  // full consents object (from edit wizard step 2)
  consents:         z.record(z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 422 });

  const { accidentDate, chiropractor, lawFirmLabel, consents, legalAssistantId, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };

  /**
   * El asistente legal ya NO es una columna: viven en `case_legal_assistants`,
   * porque un caso puede tener varios (el Portal Legal los asigna así).
   *
   * Esta pantalla sigue mandando UNO solo, y eso está bien — lo que no puede
   * pasar es que escriba en la columna vieja mientras el portal escribe en la
   * tabla: serían dos verdades para el mismo dato, y la que se desincroniza es
   * siempre la que nadie mira. Se traduce a "reemplazá la lista por esta única
   * persona", que es exactamente lo que significa el selector de acá.
   */
  if (legalAssistantId !== undefined) {
    data.legalAssistants = {
      deleteMany: {},
      ...(legalAssistantId ? { create: [{ lawyerId: legalAssistantId }] } : {}),
    };
  }
  if (accidentDate !== undefined) {
    data.accidentDate = accidentDate ? new Date(accidentDate + 'T12:00:00') : null;
  }

  // Merge consentsData JSON with text fields and/or full consents object
  if (chiropractor !== undefined || lawFirmLabel !== undefined || consents !== undefined) {
    const existing = await db.case.findUnique({ where: { id }, select: { consentsData: true } });
    const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
    data.consentsData = {
      ...prev,
      ...(consents ?? {}),
      ...(chiropractor ? { chiropractor } : chiropractor === null ? { chiropractor: null } : {}),
      ...(lawFirmLabel ? { lawFirm: lawFirmLabel } : lawFirmLabel === null ? { lawFirm: null } : {}),
    };
  }

  // ── Corregir el prefijo del código cuando cambia el tipo ────────────────────
  // "Se creó como MVA pero era medicina general": el tipo se corregía pero el
  // código quedaba MVA-1122 para siempre. El número se CONSERVA (es global y
  // único, el prefijo es solo etiqueta — ver codes.ts); solo cambia la etiqueta
  // con el mismo mapeo de la creación. Solo se tocan códigos con formato de
  // serie: los legados raros y los cifrados del v2 no se renombran.
  let codeRename: { from: string; to: string } | null = null;
  if (parsed.data.caseType !== undefined) {
    const current = await db.case.findUnique({ where: { id }, select: { caseCode: true } });
    const m = current?.caseCode.match(/^([A-Z]+)-([0-9]{1,6})$/);
    if (m) {
      const wanted = casePrefixFor(parsed.data.caseType);
      if (m[1] !== wanted) {
        const candidate = `${wanted}-${m[2]}`;
        // Anticolisión: en el rango legado del v2 conviven MVA-2900 y CASE-2900,
        // así que el destino puede existir. En ese caso el código no se toca.
        const clash = await db.case.findUnique({ where: { caseCode: candidate }, select: { id: true } });
        if (!clash) {
          data.caseCode = candidate;
          codeRename = { from: current!.caseCode, to: candidate };
        }
      }
    }
  }

  // ── Assignment change audit ──────────────────────────────────────────────────
  // When attorney/paralegal/legalAssistant changes, read previous names for the log.
  const assignmentFields = ['attorneyId', 'paralegalId', 'legalAssistantId'] as const;
  const changingAssignment = assignmentFields.some((f) => parsed.data[f] !== undefined);

  let prevCase: {
    caseCode: string;
    attorney:       { id: string; firstName: string | null; lastName: string | null } | null;
    paralegal:      { id: string; firstName: string | null; lastName: string | null } | null;
    legalAssistants: Array<{ lawyer: { id: string; firstName: string | null; lastName: string | null } }>;
  } | null = null;

  if (changingAssignment) {
    prevCase = await db.case.findUnique({
      where: { id },
      select: {
        caseCode: true,
        attorney:       { select: { id: true, firstName: true, lastName: true } },
        paralegal:      { select: { id: true, firstName: true, lastName: true } },
        legalAssistants: { select: { lawyer: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const updated = await db.case.update({ where: { id }, data, select: { id: true, caseCode: true } });

  const actor = await resolveActor(req.headers);

  // Write one audit entry per changed assignment field
  if (changingAssignment && prevCase) {
    type PrevPerson = { id: string; firstName: string | null; lastName: string | null } | null;
    const fieldMeta: Record<string, { label: string; prevPerson: PrevPerson }> = {
      attorneyId:       { label: 'Abogado',          prevPerson: prevCase.attorney },
      paralegalId:      { label: 'Gestor de casos',  prevPerson: prevCase.paralegal },
      legalAssistantId: { label: 'Asistente',        prevPerson: prevCase.legalAssistants[0]?.lawyer ?? null },
    };

    for (const field of assignmentFields) {
      const raw = field === 'legalAssistantId' ? legalAssistantId : parsed.data[field];
      if (raw === undefined) continue;
      const { label, prevPerson } = fieldMeta[field];
      const newId = raw as string | null;

      // El nombre nuevo sale de `lawyers`, NO de `employees`.
      //
      // Buscarlo en `employees` no encontraba NUNCA a nadie —las tres columnas
      // (`attorneyId`, `paralegalId`, `legalAssistantId`) son FK a `lawyers`—,
      // así que `newName` quedaba siempre null. Y como la acción se deduce de si
      // hay nombre nuevo, ASIGNAR a alguien quedaba registrado como "Removido"
      // y el historial no podía mostrar a quién se asignó. Las 6 filas que hay
      // en la base salieron todas con `newValue: null`.
      let newName: string | null = null;
      if (newId) {
        const lawyer = await db.lawyer.findUnique({
          where: { id: newId },
          select: { firstName: true, lastName: true, firmName: true },
        });
        if (lawyer) {
          newName = `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim() || lawyer.firmName;
        }
      }

      const prevName = prevPerson ? `${prevPerson.firstName} ${prevPerson.lastName}`.trim() : null;
      const action =
        !prevName && newName  ? 'Asignado'    :
        prevName  && !newName ? 'Removido'    : 'Actualizado';

      await writeAuditLog(db, {
        actorType:   actor.actorType,
        actorUserId: actor.actorUserId,
        actorRole:   actor.actorRole,
        action:      'ASSIGNMENT_CHANGE',
        entityType:  'cases',
        entityId:    id,
        metadata: {
          changeType:    label,
          changeTypeRaw: field.replace('Id', '').toUpperCase(),
          action,
          actionRaw:     action === 'Asignado' ? 'ASSIGNED' : action === 'Removido' ? 'REMOVED' : 'UPDATED',
          // El EMAIL de quien hizo el cambio, no su id: la columna "Usuario" del
          // historial mostraba un cuid (`cqhr4cvbc2vx1xtyzofuqw`) porque acá iba
          // `actorUserId`. `resolveActor` ya trae el email de la sesión.
          changedByEmail: actor.email ?? null,
          changedByName:  actor.actorName ?? null,
          previousValue: prevName,
          newValue:      newName,
          caseCode:      prevCase.caseCode,
        },
        ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      });
    }
  } else {
    // Generic update log for non-assignment changes
    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole:   actor.actorRole,
      action:      'UPDATE_CASE',
      entityType:  'cases',
      entityId:    id,
      metadata: {
        caseCode: updated.caseCode,
        fields: Object.keys(parsed.data),
        // Rastro del renombre: el código viejo puede estar en SMS/PDFs ya
        // emitidos y soporte necesita poder rastrearlo (Regla #3).
        ...(codeRename ? { previousCaseCode: codeRename.from, newCaseCode: codeRename.to } : {}),
      },
      ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
    });
  }

  // Si el PATCH traía asignaciones Y cambio de tipo, la rama de arriba logueó
  // solo las asignaciones — el renombre del código no puede quedar sin rastro.
  if (changingAssignment && codeRename) {
    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole:   actor.actorRole,
      action:      'UPDATE_CASE',
      entityType:  'cases',
      entityId:    id,
      metadata: {
        caseCode: updated.caseCode,
        fields: ['caseType'],
        previousCaseCode: codeRename.from,
        newCaseCode: codeRename.to,
      },
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.case.findUnique({
    where: { id },
    select: { id: true, caseCode: true, status: true, deletedAt: true },
  });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (existing.deletedAt) {
    return NextResponse.json({ ok: false, error: 'ALREADY_ARCHIVED', message: 'El caso ya está archivado.' }, { status: 409 });
  }

  /**
   * Archivar un caso escribe `deletedAt`, NO pisa el `status`.
   *
   * Antes ponía `status: 'CANCELLED'`, que es el mismo valor que tiene un caso
   * cancelado por motivos clínicos o administrativos: un caso archivado quedaba
   * INDISTINGUIBLE de uno cancelado, y se perdía el hecho de que alguien lo quitó
   * (decisión de Erick 2026-08-21: el archivado tiene que ser distinguible).
   *
   * Además conserva el estado real del caso, que es el dato que importa si se
   * restaura: un caso ACTIVE archivado por error volvía como CANCELLED.
   *
   * Seguro de hacer: `deletedAt: null` ya es la convención dominante para excluir
   * casos (110 consultas lo filtran contra 29 que miran `CANCELLED`, y ninguna de
   * esas 29 es un filtro de caso — son de cita o de pago). Y `Case.deletedAt` ya
   * existía en el schema; lo escribía solo el archivado de PACIENTE.
   */
  await db.case.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'DELETE_CASE',
    entityType:  'cases',
    entityId:    id,
    // `status` se conserva: es el estado en el que quedó, no "cancelado".
    metadata:    { caseCode: existing.caseCode, statusAlArchivar: existing.status },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

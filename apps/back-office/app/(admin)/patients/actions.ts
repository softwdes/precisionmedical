'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { db, type UserRole } from '@precision-medical/database';
import { writeAuditLog } from '@precision-medical/database/audit';
import { resolveActor, getDbUserByEmail } from '@/lib/actor';
import { getSessionUser } from '@/lib/session';
import type { MedicalHistoryData } from './medical-history-dialog';
import { validarHistorial } from '@/lib/medical-history-schema';

export async function searchDrugs(q: string): Promise<Array<{ id: number; name: string; generic: string; category: string }>> {
  const rows = await db.drug.findMany({
    where: q
      ? { OR: [
          { name:    { contains: q, mode: 'insensitive' } },
          { generic: { contains: q, mode: 'insensitive' } },
        ]}
      : {},
    select: { id: true, name: true, generic: true, category: true },
    orderBy: { name: 'asc' },
    take: 30,
  });
  return rows;
}

export async function searchDoctors(q: string): Promise<Array<{ id: string; name: string }>> {
  const parts = q.trim().split(/\s+/).filter(Boolean);
  const fullName = parts.length >= 2 ? [
    { firstName: { contains: parts[0]!, mode: 'insensitive' as const }, lastName: { contains: parts[parts.length - 1]!, mode: 'insensitive' as const } },
    { firstName: { contains: parts[parts.length - 1]!, mode: 'insensitive' as const }, lastName: { contains: parts[0]!, mode: 'insensitive' as const } },
  ] : [];
  const rows = await db.provider.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      ...(q ? { OR: [
        ...fullName,
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName:  { contains: q, mode: 'insensitive' } },
      ]} : {}),
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }],
    take: 20,
  });
  return rows.map(r => ({ id: r.id, name: `${r.firstName} ${r.lastName}` }));
}

export async function searchSpecialties(q: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.specialtyCatalog.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 30,
  });
  return rows;
}

export async function searchDiagnoses(q: string): Promise<Array<{ id: string; label: string; code: string }>> {
  const rows = await db.diagnosis.findMany({
    where: {
      isActive: true,
      OR: [
        { icd10Description: { contains: q, mode: 'insensitive' } },
        { icd10Code:        { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, icd10Code: true, icd10Description: true },
    orderBy: [{ usageCount: 'desc' }, { icd10Description: 'asc' }],
    take: 30,
  });
  return rows.map(r => ({ id: r.id, label: r.icd10Description, code: r.icd10Code }));
}

/**
 * Roles que pueden escribir la ficha clínica de un paciente.
 *
 * La lista es por lo que hace cada uno, no por jerarquía: recepción corrige un
 * teléfono, el asistente carga la alergia que el paciente menciona en el
 * mostrador, el doctor la lista de problemas y medicamentos. Los que quedan
 * fuera —LAWYER (portal de abogados), CONTADOR, AUDITOR_AI— no tienen ningún
 * motivo para reescribir un historial médico, y dos de ellos son cuentas
 * externas a la clínica.
 */
const PUEDEN_EDITAR_HISTORIAL: readonly UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'FRONT_DESK', 'EMPLOYEE', 'DOCTOR', 'PROVIDER',
];

export async function updateMedicalHistory(
  patientId: string,
  patch: Partial<MedicalHistoryData>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    /**
     * Quién es, antes de escribir.
     *
     * Esta acción no verificaba NADA: validaba el dato, escribía y dejaba su
     * audit log. Mientras el único botón que la llamaba vivía en una pantalla de
     * admin, el middleware de rutas hacía de único cerco; al abrir el historial
     * al portal médico (botón dentro de la nota, 2026-08-13) ese cerco dejó de
     * alcanzar — y una server action es un POST con un id público, así que la
     * pantalla desde donde se llama no prueba nada sobre quién llama.
     *
     * La sesión se resuelve con `getSessionUser()` y NO con el rol que trae
     * `resolveActor`: ese respeta el header `x-actor-user-id` a propósito (los
     * hooks del AI Receptionist declaran su identidad), así que sirve para
     * atribuir en el audit log pero no para decidir un permiso.
     */
    const user = await getSessionUser();
    if (!user?.email) return { ok: false, error: 'Sesión vencida — volvé a entrar' };

    const dbUser = await getDbUserByEmail(user.email);
    if (!dbUser || !PUEDEN_EDITAR_HISTORIAL.includes(dbUser.role)) {
      return { ok: false, error: 'Tu rol no puede editar el historial médico' };
    }

    const existing = await db.patient.findUnique({
      where: { id: patientId },
      select: { medicalHistory: true },
    });

    const current = (existing?.medicalHistory ?? {}) as MedicalHistoryData;

    /**
     * Validar contra lo YA guardado, no el patch suelto.
     *
     * Antes esto escribía `{ ...current, ...patch }` sin mirar nada. Y validar
     * el patch completo tampoco servía: 5 filas ya guardadas no cumplen (un
     * nombre de 179 caracteres, fechas `1212-12-12` y una futura), y como el
     * cliente manda la sección ENTERA, una fila vieja hacía fallar el guardado
     * completo — dejando al usuario sin poder corregirla.
     */
    const revisado = validarHistorial(
      current as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    );
    if (!revisado.ok) return { ok: false, error: revisado.error };

    const updated  = { ...current, ...revisado.data };

    await db.patient.update({
      where: { id: patientId },
      data:  { medicalHistory: updated },
    });

    const actor = await resolveActor(await headers());
    await writeAuditLog(db, {
      action:      'UPDATE_MEDICAL_HISTORY',
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole:   actor.actorRole,
      entityType:  'patients',
      entityId:    patientId,
      metadata:    { fields: Object.keys(revisado.data) },
    });

    revalidatePath('/patients');
    return { ok: true };
  } catch (err) {
    console.error('updateMedicalHistory', err);
    return { ok: false, error: String(err) };
  }
}

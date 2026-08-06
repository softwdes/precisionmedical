'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { db } from '@precision-medical/database';
import { writeAuditLog } from '@precision-medical/database/audit';
import { resolveActor } from '@/lib/actor';
import type { MedicalHistoryData } from './medical-history-dialog';

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

export async function updateMedicalHistory(
  patientId: string,
  patch: Partial<MedicalHistoryData>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const existing = await db.patient.findUnique({
      where: { id: patientId },
      select: { medicalHistory: true },
    });

    const current = (existing?.medicalHistory ?? {}) as MedicalHistoryData;
    const updated  = { ...current, ...patch };

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
      metadata:    { fields: Object.keys(patch) },
    });

    revalidatePath('/patients');
    return { ok: true };
  } catch (err) {
    console.error('updateMedicalHistory', err);
    return { ok: false, error: String(err) };
  }
}

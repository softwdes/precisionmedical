'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@precision-medical/database';
import { writeAuditLog } from '@precision-medical/database/audit';
import type { MedicalHistoryData } from './medical-history-dialog';

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

    await writeAuditLog(db, {
      action:     'UPDATE_MEDICAL_HISTORY',
      actorType:  'HUMAN_USER',
      entityType: 'patients',
      entityId:   patientId,
      metadata:   { fields: Object.keys(patch) },
    });

    revalidatePath('/patients');
    return { ok: true };
  } catch (err) {
    console.error('updateMedicalHistory', err);
    return { ok: false, error: String(err) };
  }
}

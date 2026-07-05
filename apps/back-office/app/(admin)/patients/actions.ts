'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@precision-medical/database';
import { writeAuditLog } from '@precision-medical/database/audit';
import type { MedicalHistoryData } from './medical-history-dialog';

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

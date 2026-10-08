/**
 * Health History — carga del paciente para el formulario (modal y PDF).
 *
 * Junta las TRES fuentes y las pasa por `armarVista`:
 *   1. la ficha (`Patient`: nombre, nacimiento, sexo, estado civil, referido),
 *   2. el Historial Médico (`Patient.medicalHistory`) — manda sobre todo lo demás,
 *   3. el intake que el paciente llenó (`IntakeSubmission`, colgado del CASO):
 *      solo rellena lo que el historial todavía no tiene.
 *
 * ⚠️ No autoriza a nadie: quien la llama decide el acceso (`checkPatientAccess`).
 */

import { db } from '@precision-medical/database';
import { armarVista, type FormView } from '@/lib/health-history-form';
import type { MedicalHistoryData } from '@/app/(admin)/patients/medical-history-dialog';

export type HealthHistoryPayload = {
  view: FormView;
  /** Lo guardado tal cual — el modal lo necesita para calcular el patch. */
  mh: MedicalHistoryData;
  sex: string | null;
  /** Edad en años al día de hoy; null si no hay fecha de nacimiento. */
  isMinor: boolean;
};

export async function cargarHealthHistory(patientId: string): Promise<HealthHistoryPayload | null> {
  const p = await db.patient.findUnique({
    where: { id: patientId },
    select: {
      firstName: true, lastName: true, dateOfBirth: true, sex: true, maritalStatus: true,
      referralSource: true, referralSourceOther: true, medicalHistory: true,
      cases: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          intakeSubmission: {
            select: {
              healthStatus: true, hasMedications: true, medications: true,
              hasAllergies: true, allergies: true, hasPreviousInjuries: true, previousInjuries: true,
            },
          },
        },
      },
    },
  });
  if (!p) return null;

  // El intake MÁS RECIENTE que exista (un paciente puede tener varios casos).
  const intake = p.cases.map(c => c.intakeSubmission).find(Boolean) ?? null;
  const mh = (p.medicalHistory ?? {}) as MedicalHistoryData;

  const view = armarVista({
    patient: {
      firstName: p.firstName, lastName: p.lastName,
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
      sex: p.sex, maritalStatus: p.maritalStatus,
      referralSource: p.referralSource, referralSourceOther: p.referralSourceOther,
    },
    mh,
    intake,
  });

  let isMinor = false;
  if (p.dateOfBirth) {
    const hoy = new Date();
    const n = p.dateOfBirth;
    let edad = hoy.getUTCFullYear() - n.getUTCFullYear();
    const antes = hoy.getUTCMonth() < n.getUTCMonth() || (hoy.getUTCMonth() === n.getUTCMonth() && hoy.getUTCDate() < n.getUTCDate());
    if (antes) edad -= 1;
    isMinor = edad < 18;
  }

  return { view, mh, sex: p.sex, isMinor };
}

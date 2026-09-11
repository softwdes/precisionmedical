/**
 * GET /api/admin/patients/[id]/medical-history
 *   La ficha del paciente para el Historial Médico: sus datos + el JSON
 *   `medicalHistory`. Lo consumen el tab del caso y el botón de la nota clínica.
 *
 * (No hay PATCH: se escribe con la server action `updateMedicalHistory`. El
 * encabezado anunciaba uno que nunca existió.)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { checkPatientAccess } from '@/lib/patient-access';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  /**
   * La respuesta trae la ficha entera —incluido el SSN— y esta ruta no estaba
   * pidiendo sesión. El middleware deja pasar `/api/*` sin chequear módulos, así
   * que el único cerco era que nadie supiera la URL.
   *
   * Pedir sesión tampoco alcanzaba: el portal médico abre este historial desde
   * la nota, y con solo "hay alguien logueado" un provider leía el de cualquier
   * paciente de la clínica. El alcance lo pone `checkPatientAccess`.
   */
  const acceso = await checkPatientAccess(id);
  if (acceso.deny) return acceso.deny;

  const patient = await db.patient.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      phone2: true,
      patientCode: true,
      status: true,
      preferredLanguage: true,
      sex: true,
      maritalStatus: true,
      employer: true,
      preferredPharmacy: true,
      communicationPreference: true,
      referralSource: true,
      race: true,
      ethnicity: true,
      socialSecurityNumber: true,
      addressLine1: true,
      addressCity: true,
      addressState: true,
      addressZip: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRelation: true,
      emergency2Name: true,
      emergency2Phone: true,
      emergency2Relation: true,
      dateOfBirth: true,
      guardianName: true,
      guardianPhone: true,
      guardianRelation: true,
      accidentDate: true,
      accidentType: true,
      insuranceCarrier: true,
      policyNumber: true,
      medicalHistory: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!patient) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // latestCase stub — dialog needs it but doesn't render case info in this context
  return NextResponse.json({
    patient: {
      ...patient,
      dateOfBirth:              patient.dateOfBirth?.toISOString() ?? null,
      accidentDate:             patient.accidentDate?.toISOString() ?? null,
      createdAt:                patient.createdAt.toISOString(),
      updatedAt:                patient.updatedAt.toISOString(),
      // Decrypt PHI fields that may carry the legacy "e:" cipher prefix
      phone:                    dec(patient.phone),
      phone2:                   dec(patient.phone2),
      employer:                 dec(patient.employer),
      preferredPharmacy:        dec(patient.preferredPharmacy),
      socialSecurityNumber:     dec(patient.socialSecurityNumber),
      addressLine1:             dec(patient.addressLine1),
      addressCity:              dec(patient.addressCity),
      addressState:             dec(patient.addressState),
      addressZip:               dec(patient.addressZip),
      emergencyContactName:     dec(patient.emergencyContactName),
      emergencyContactPhone:    dec(patient.emergencyContactPhone),
      emergencyContactRelation: dec(patient.emergencyContactRelation),
      emergency2Name:           dec(patient.emergency2Name),
      emergency2Phone:          dec(patient.emergency2Phone),
      emergency2Relation:       dec(patient.emergency2Relation),
      guardianName:             dec(patient.guardianName),
      guardianPhone:            dec(patient.guardianPhone),
      guardianRelation:         dec(patient.guardianRelation),
      insuranceCarrier:         dec(patient.insuranceCarrier),
      policyNumber:             dec(patient.policyNumber),
      latestCase: null,
      caseCount: 0,
    },
  });
}

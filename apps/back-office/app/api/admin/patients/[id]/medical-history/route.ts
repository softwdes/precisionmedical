/**
 * GET  /api/admin/patients/[id]/medical-history
 *   Retorna el JSON medicalHistory del paciente + datos básicos para el dialog.
 *
 * PATCH /api/admin/patients/[id]/medical-history
 *   Alias de update — delega a la acción updateMedicalHistory.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

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
      latestCase: null,
      caseCount: 0,
    },
  });
}

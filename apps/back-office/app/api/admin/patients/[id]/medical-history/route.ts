/**
 * GET  /api/admin/patients/[id]/medical-history
 *   Retorna el JSON medicalHistory del paciente + datos básicos para el dialog.
 *
 * PATCH /api/admin/patients/[id]/medical-history
 *   Alias de update — delega a la acción updateMedicalHistory.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';

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

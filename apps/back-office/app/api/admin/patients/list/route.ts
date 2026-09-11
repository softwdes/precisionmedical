/**
 * GET /api/admin/patients/list?q=&page=&inactive=1
 *
 * Versión API del server component de pacientes.
 * Permite búsqueda client-side sin navegación completa de página.
 *
 * ⚠️ El recorte del portal médico se decide con la SESIÓN — nunca con lo que
 * manda el cliente. Vive en `alcanceDePacientes()` (`lib/patient-access.ts`),
 * compartido hoy con el autocomplete y hermano de los guards por paciente.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { alcanceDePacientes } from '@/lib/patient-access';
import { tamanoDePagina } from '@/lib/patients-page';
import { wherePacientes } from '@/lib/patients-query';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q            = (searchParams.get('q') ?? '').trim();
  const page         = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
  // Antes era una constante 15 hardcodeada: el server renderizaba 10 filas y
  // apenas montaba el cliente esta API las reemplazaba por 15, asi que la
  // grilla "crecia sola" despues de cargar. Ahora el numero y su clamp son los
  // mismos que usan las dos paginas y el cliente — ver `lib/patients-page.ts`.
  const PAGE_SIZE = tamanoDePagina(searchParams.get('size'));
  const inactiveOnly = searchParams.get('inactive') === '1';

  // Portal médico. El param es solo la SEÑAL de que se quiere el modo recortado;
  // el id sale de la sesión.
  const alcance = await alcanceDePacientes(searchParams.get('providerId') ?? '');
  if (!alcance.ok) {
    return NextResponse.json({ error: 'NO_PROVIDER_PROFILE' }, { status: 403 });
  }
  const providerId = alcance.providerId;

  // El filtro es el MISMO que usa el render del servidor — ver
  // `lib/patients-query.ts`. Estaba escrito dos veces y ya había divergido.
  const where = await wherePacientes({ q, inactiveOnly, providerId });

  const [patients, total] = await Promise.all([
    db.patient.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, phone2: true,
        patientCode: true, status: true, preferredLanguage: true,
        sex: true, maritalStatus: true, employer: true, preferredPharmacy: true,
        communicationPreference: true, referralSource: true, referralSourceOther: true,
        race: true, ethnicity: true, socialSecurityNumber: true,
        addressLine1: true, addressCity: true, addressState: true, addressZip: true,
        emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
        emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
        dateOfBirth: true, guardianName: true, guardianPhone: true, guardianRelation: true,
        // Vinculo real al tutor (lo escribe el alta del menor). Los campos de
        // texto de arriba son legado — ver pending-tasks.md.
        guardianPatientId: true,
        guardianPatient: { select: { id: true, patientCode: true, firstName: true, lastName: true, email: true, phone: true } },
        accidentDate: true, accidentType: true, insuranceCarrier: true, policyNumber: true,
        medicalHistory: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.patient.count({ where }),
  ]);

  const patientIds = patients.map(p => p.id);

  const [caseCounts, latestCases] = await Promise.all([
    db.case.groupBy({
      by: ['patientId'],
      where: { patientId: { in: patientIds }, deletedAt: null },
      _count: { _all: true },
    }),
    db.case.findMany({
      where: { patientId: { in: patientIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        patientId: true, id: true, caseCode: true, caseType: true,
        accidentDate: true, status: true, portalToken: true,
        intakeFormSentAt: true, intakeFormCompletedAt: true,
        consentsData: true,
        intakeSubmission: { select: { id: true } },
        // El seguro de auto salio del JSON a su propia tabla; sin esto la barra
        // de completitud marcaria "falta seguro" en casos que si lo tienen.
        autoInsurance: { select: { id: true } },
      },
    }),
  ]);

  const caseCountMap = Object.fromEntries(caseCounts.map(c => [c.patientId, c._count._all]));
  const latestCaseMap: Record<string, typeof latestCases[0]> = {};
  for (const c of latestCases) {
    if (!latestCaseMap[c.patientId]) latestCaseMap[c.patientId] = c;
  }

  const rows = patients.map(p => ({
    ...p,
    dateOfBirth:  p.dateOfBirth?.toISOString()  ?? null,
    accidentDate: p.accidentDate?.toISOString() ?? null,
    createdAt:    p.createdAt.toISOString(),
    updatedAt:    p.updatedAt.toISOString(),
    // Decrypt PHI fields that may carry the legacy "e:" cipher prefix
    phone:                    dec(p.phone),
    phone2:                   dec(p.phone2),
    employer:                 dec(p.employer),
    preferredPharmacy:        dec(p.preferredPharmacy),
    socialSecurityNumber:     dec(p.socialSecurityNumber),
    addressLine1:             dec(p.addressLine1),
    addressCity:              dec(p.addressCity),
    addressState:             dec(p.addressState),
    addressZip:               dec(p.addressZip),
    emergencyContactName:     dec(p.emergencyContactName),
    emergencyContactPhone:    dec(p.emergencyContactPhone),
    emergencyContactRelation: dec(p.emergencyContactRelation),
    emergency2Name:           dec(p.emergency2Name),
    emergency2Phone:          dec(p.emergency2Phone),
    emergency2Relation:       dec(p.emergency2Relation),
    guardianName:             dec(p.guardianName),
    guardianPhone:            dec(p.guardianPhone),
    guardianRelation:         dec(p.guardianRelation),
    insuranceCarrier:         dec(p.insuranceCarrier),
    policyNumber:             dec(p.policyNumber),
    caseCount:    caseCountMap[p.id] ?? 0,
    latestCase:   latestCaseMap[p.id]
      ? {
          id:                    latestCaseMap[p.id].id,
          caseCode:              latestCaseMap[p.id].caseCode,
          caseType:              latestCaseMap[p.id].caseType,
          accidentDate:          latestCaseMap[p.id].accidentDate?.toISOString() ?? null,
          portalToken:           latestCaseMap[p.id].portalToken ?? null,
          status:                latestCaseMap[p.id].status,
          intakeFormSentAt:      latestCaseMap[p.id].intakeFormSentAt?.toISOString() ?? null,
          intakeFormCompletedAt: latestCaseMap[p.id].intakeFormCompletedAt?.toISOString() ?? null,
          consentsData:          latestCaseMap[p.id].consentsData as Record<string, unknown> | null,
          hasIntakeSubmission:   !!latestCaseMap[p.id].intakeSubmission,
          hasAutoInsurance:      !!latestCaseMap[p.id].autoInsurance,
        }
      : null,
  }));

  return NextResponse.json({
    patients: rows,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
}

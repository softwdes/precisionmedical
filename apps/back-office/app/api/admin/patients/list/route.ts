/**
 * GET /api/admin/patients/list?q=&page=&inactive=1
 *
 * Versión API del server component de pacientes.
 * Permite búsqueda client-side sin navegación completa de página.
 *
 * ⚠️ El recorte del portal médico se decide ACÁ, con la sesión — nunca con lo
 * que manda el cliente. Ver `alcanceDelProvider()`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { getSessionProvider, getSessionRole, PORTAL_ONLY_ROLES } from '@/lib/get-session-provider';

const DEFAULT_PAGE_SIZE = 10;

/**
 * A qué provider se limita esta consulta, resuelto contra la SESIÓN.
 *
 * `/doctor/patients` reúsa la lista administrativa: el server component la
 * pinta con `scopeProviderId` (el doctor de sesión), pero apenas el usuario
 * escribe en el buscador o pasa de página, el cliente refresca por esta API —
 * y hasta ahora mandaba el id como query param, que esta ruta aceptaba tal
 * cual. Dos formas de saltearlo, las dos con solo editar la URL:
 *
 *   · cambiar el id  → la lista de pacientes de OTRO médico
 *   · borrar el param → el padrón completo de la clínica
 *
 * La primera página se veía recortada, así que el agujero no se notaba.
 *
 * Ahora el param solo dice "quiero el modo recortado"; QUIÉN es el provider lo
 * dice `getSessionProvider()`, que además respeta "ver como otro doctor" (la
 * cookie solo vale con la capacidad, ver ese helper). Y un rol que vive solo en
 * el portal queda recortado SIEMPRE, mande o no el param.
 */
async function alcanceDelProvider(pedido: string): Promise<
  { ok: true; providerId: string | null } | { ok: false }
> {
  const role       = await getSessionRole();
  const portalOnly = !!role && PORTAL_ONLY_ROLES.has(role);

  // Staff administrativo que no pidió el modo recortado: lista completa.
  if (!pedido && !portalOnly) return { ok: true, providerId: null };

  const provider = await getSessionProvider();

  // Sin ficha de Provider no hay nada que recortar. Para un rol del portal eso
  // es 403 y no "toda la clínica": es exactamente el caso que abría el agujero.
  if (!provider) return portalOnly ? { ok: false } : { ok: true, providerId: null };

  return { ok: true, providerId: provider.id };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q            = (searchParams.get('q') ?? '').trim();
  const page         = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
  // Antes era una constante 15 hardcodeada: el server renderizaba 10 filas y
  // apenas montaba el cliente esta API las reemplazaba por 15, asi que la
  // grilla "crecia sola" despues de cargar. Ahora respeta el mismo size que
  // usa la pagina (mismo clamp que app/(admin)/patients/page.tsx).
  const PAGE_SIZE = Math.min(50, Math.max(5,
    parseInt(searchParams.get('size') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
  const inactiveOnly = searchParams.get('inactive') === '1';

  // Portal médico. El param es solo la SEÑAL de que se quiere el modo recortado;
  // el id sale de la sesión.
  const alcance = await alcanceDelProvider(searchParams.get('providerId') ?? '');
  if (!alcance.ok) {
    return NextResponse.json({ error: 'NO_PROVIDER_PROFILE' }, { status: 403 });
  }
  const providerId = alcance.providerId;

  const statusFilter = inactiveOnly
    ? { status: 'INACTIVE' as const }
    : { NOT: { status: 'INACTIVE' as const } };

  const providerScope = providerId
    ? { appointments: { some: { providerId } } }
    : {};

  const qParts = q ? q.split(/\s+/).filter(Boolean) : [];
  const fullNameClauses = qParts.length >= 2
    ? [
        { firstName: { contains: qParts[0]!, mode: 'insensitive' as const }, lastName: { contains: qParts[qParts.length - 1]!, mode: 'insensitive' as const } },
        { firstName: { contains: qParts[qParts.length - 1]!, mode: 'insensitive' as const }, lastName: { contains: qParts[0]!, mode: 'insensitive' as const } },
      ]
    : [];

  const where = q
    ? {
        AND: [
          statusFilter,
          providerScope,
          {
            OR: [
              ...fullNameClauses,
              { firstName:   { contains: q, mode: 'insensitive' as const } },
              { lastName:    { contains: q, mode: 'insensitive' as const } },
              { email:       { contains: q, mode: 'insensitive' as const } },
              { phone:       { contains: q, mode: 'insensitive' as const } },
              { patientCode: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        ],
      }
    : { AND: [statusFilter, providerScope] };

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

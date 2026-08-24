/**
 * Patient search · para el PreCall step de B.2.
 *
 * GET /api/admin/patients/search?q=<query>
 *   → { results: [{ id, firstName, lastName, phone, email, patientCode, casesCount, lastCaseStatus, lastCaseCode }] }
 *
 * Phase 1A: busca en phoenix-dev (mock data).
 * Phase 2+: con BAA + RLS, los datos son PHI real.
 *
 * Busca por: firstName, lastName, phone, email, patientCode (insensitive contains).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptScalars, decryptFieldOrOriginal as dec, isCipher } from '@/lib/decrypt';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const parts = q.split(/\s+/).filter(Boolean);
  const fullNameClauses = parts.length >= 2
    ? [
        // "Sandra Lopez" → firstName:Sandra AND lastName:Lopez
        { firstName: { contains: parts[0]!, mode: 'insensitive' as const }, lastName: { contains: parts[parts.length - 1]!, mode: 'insensitive' as const } },
        // "Lopez Sandra" → firstName:Lopez AND lastName:Sandra
        { firstName: { contains: parts[parts.length - 1]!, mode: 'insensitive' as const }, lastName: { contains: parts[0]!, mode: 'insensitive' as const } },
      ]
    : [];

  const patients = await db.patient.findMany({
    where: {
      OR: [
        ...fullNameClauses,
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { patientCode: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      dateOfBirth: true,
      // `deletedAt: null` en los dos: sin esto el resumen contaba los casos
      // archivados y el "último caso" podía ser uno archivado. Se veía en vivo:
      // una paciente con un caso archivado y uno real aparecía como "2 case(s)"
      // y mostraba el código del archivado.
      cases: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { caseCode: true, status: true },
      },
      _count: { select: { cases: { where: { deletedAt: null } } } },
      /**
       * Para que el llamador pueda distinguir a un paciente DADO DE BAJA.
       *
       * Antes no viajaba, así que ningún selector podía marcarlos ni bloquearlos
       * aunque quisiera: aparecían igual que uno activo. Ojo que esto es la baja
       * del PACIENTE (duplicado, data de prueba); un paciente con su CASO
       * archivado sigue activo y se agenda normal.
       */
      status: true,
    },
  });

  return NextResponse.json({
    results: patients.map((p) => {
      // Los escalares del paciente, de una pasada: parte de la data migrada del
      // v2 sigue con el sobre `e:…` y este endpoint no desciframos nada, así que
      // el buscador podía mostrar un nombre o un teléfono ilegible.
      const { cases, _count, dateOfBirth, ...escalares } = p;
      const d = decryptScalars(escalares);
      const codigoCrudo = cases[0]?.caseCode ?? null;
      return {
        id: d.id,
        patientCode: d.patientCode,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone,
        email: d.email,
        dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : null,
        casesCount: _count.cases,
        // Si no se puede descifrar va null, nunca el `e:…` crudo — mismo criterio
        // que el selector de casos.
        lastCaseCode: codigoCrudo && isCipher(codigoCrudo) ? dec(codigoCrudo) : codigoCrudo,
        lastCaseStatus: cases[0]?.status ?? null,
        isArchived: d.status === 'INACTIVE',
      };
    }),
  });
}

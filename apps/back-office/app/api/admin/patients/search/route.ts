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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const patients = await db.patient.findMany({
    where: {
      OR: [
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
      cases: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { caseCode: true, status: true },
      },
      _count: { select: { cases: true } },
    },
  });

  return NextResponse.json({
    results: patients.map((p) => ({
      id: p.id,
      patientCode: p.patientCode,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      email: p.email,
      casesCount: p._count.cases,
      lastCaseCode: p.cases[0]?.caseCode ?? null,
      lastCaseStatus: p.cases[0]?.status ?? null,
    })),
  });
}

/**
 * GET /api/admin/lawyers/[id]/cases
 * Returns cases linked to a law firm, plus aggregated stats.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: firmId } = await ctx.params;
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim() ?? '';
  const statusFilter = searchParams.get('status') ?? '';

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [cases, totalCount, recentCount, signedCount, byMonthRaw] = await Promise.all([
    db.case.findMany({
      where: {
        lawFirmId: firmId,
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter as never } : {}),
        ...(search
          ? {
              OR: [
                { caseCode: { contains: search, mode: 'insensitive' } },
                { patient: { firstName: { contains: search, mode: 'insensitive' } } },
                { patient: { lastName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        caseCode: true,
        caseType: true,
        status: true,
        createdAt: true,
        accidentDate: true,
        patient: { select: { firstName: true, lastName: true } },
        attorney:       { select: { id: true, firstName: true, lastName: true } },
        paralegal:      { select: { id: true, firstName: true, lastName: true } },
        legalAssistant: { select: { id: true, firstName: true, lastName: true } },
        lienSignatures: { select: { id: true }, take: 1 },
      },
    }),
    db.case.count({ where: { lawFirmId: firmId, deletedAt: null } }),
    db.case.count({
      where: { lawFirmId: firmId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
    }),
    db.case.count({
      where: { lawFirmId: firmId, deletedAt: null, lienSignatures: { some: {} } },
    }),
    db.$queryRaw<Array<{ month: string; count: bigint }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
        COUNT(*)::bigint AS count
      FROM cases
      WHERE "lawFirmId" = ${firmId}
        AND "deletedAt" IS NULL
        AND "createdAt" >= ${sixMonthsAgo}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const signatureRate = totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : 0;

  const byMonth = byMonthRaw.map((r) => ({
    month: r.month,
    count: Number(r.count),
  }));

  return NextResponse.json({
    cases: cases.map((c) => ({
      id: c.id,
      caseCode: c.caseCode,
      caseType: c.caseType,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      accidentDate: c.accidentDate?.toISOString() ?? null,
      patient: {
        firstName: c.patient.firstName,
        lastName: c.patient.lastName,
      },
      attorney: c.attorney
        ? { id: c.attorney.id, firstName: c.attorney.firstName, lastName: c.attorney.lastName }
        : null,
      paralegal: c.paralegal
        ? { id: c.paralegal.id, firstName: c.paralegal.firstName, lastName: c.paralegal.lastName }
        : null,
      legalAssistant: c.legalAssistant
        ? { id: c.legalAssistant.id, firstName: c.legalAssistant.firstName, lastName: c.legalAssistant.lastName }
        : null,
      hasSigned: c.lienSignatures.length > 0,
    })),
    stats: {
      total: totalCount,
      recentCount,
      signatureRate,
      byMonth,
    },
  });
}

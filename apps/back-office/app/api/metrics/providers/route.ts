/**
 * GET /api/metrics/providers?range=week|month|year
 *
 * Métricas de TODOS los doctores activos — para la pestaña "Doctores" de
 * Métricas del Admin (apps/web la consume). Misma fuente que /doctor/stats.
 *
 * Acceso: SUPER_ADMIN / ADMIN. Un DOCTOR recibe solo sus propios números.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getProviderMetrics, type MetricsRange } from '@/lib/provider-metrics';

const RANGES: MetricsRange[] = ['week', 'month', 'year'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await fetchDbRole(user.email);
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: MetricsRange = RANGES.includes(rangeParam as MetricsRange) ? (rangeParam as MetricsRange) : 'week';

  // Un doctor solo puede ver sus propios números
  if (role === 'DOCTOR' || role === 'PROVIDER') {
    const own = await db.provider.findFirst({
      where: { deletedAt: null, email: { equals: user.email, mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true, specialty: true },
    });
    if (!own) return NextResponse.json({ error: 'No provider profile' }, { status: 403 });
    const metrics = await getProviderMetrics(own.id, range);
    return NextResponse.json({ range, providers: [{ ...own, metrics }] });
  }

  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const providers = await db.provider.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    orderBy: { lastName: 'asc' },
    select: { id: true, firstName: true, lastName: true, specialty: true },
  });

  const rows = await Promise.all(
    providers.map(async (p) => ({ ...p, metrics: await getProviderMetrics(p.id, range) })),
  );

  return NextResponse.json({ range, providers: rows });
}

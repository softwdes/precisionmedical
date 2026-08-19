/**
 * GET /api/admin/releases → los borradores y lo ya publicado.
 *
 * Es la cola de curación: el script del build deja todo en DRAFT y nadie lo ve
 * hasta que se publica desde acá.
 */
import { NextResponse } from 'next/server';
import { listReleasesForAdmin } from '@precision-medical/database/release-notes';
import { requireReleaseAdmin } from './guard';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const auth = await requireReleaseAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    { releases: await listReleasesForAdmin() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

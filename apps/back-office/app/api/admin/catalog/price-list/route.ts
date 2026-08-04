/**
 * GET /api/admin/catalog/price-list
 *
 * Lista de precios para el modal de mostrador. Solo lectura, para cualquier
 * usuario logueado (recepción y portal médico lo consumen igual).
 *
 * Payload flaco a propósito: el costo real NO viaja al cliente. Ver
 * `listPriceList()` en lib/catalog.ts.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { listPriceList } from '@/lib/catalog';

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  return NextResponse.json({ entries: await listPriceList() });
}

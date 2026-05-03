import { NextRequest, NextResponse } from 'next/server';
import { getUsageHoy, LIMITE_DIARIO } from '@/lib/ai-usage';

export async function GET(req: NextRequest) {
  const trainerId = req.nextUrl.searchParams.get('trainerId');
  if (!trainerId) {
    return NextResponse.json({ usadas: 0, restantes: LIMITE_DIARIO, limite: LIMITE_DIARIO });
  }
  const usage = await getUsageHoy(trainerId);
  return NextResponse.json({ ...usage, limite: LIMITE_DIARIO });
}

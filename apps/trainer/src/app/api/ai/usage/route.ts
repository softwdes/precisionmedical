import { NextRequest, NextResponse } from 'next/server';
import { getUsageHoy } from '@/lib/ai-usage';

export async function GET(req: NextRequest) {
  const trainerId = req.nextUrl.searchParams.get('trainerId');
  if (!trainerId) {
    return NextResponse.json({ usadas: 0, restantes: 20, limite: 20 });
  }
  const usage = await getUsageHoy(trainerId);
  return NextResponse.json(usage);
}

import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, getTrainerIdFromRequest } from '@/lib/supabase-api';

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);

    const { data, error } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('trainer_id', trainerId)
      .is('archived_at', null)
      .order('full_name', { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

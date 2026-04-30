import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, getTrainerIdFromRequest } from '@/lib/supabase-api';

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // Single join query — no separate availability lookup needed
    let query = supabase
      .from('bookings')
      .select(`
        id,
        status,
        reserved_at,
        student_id,
        trainer_availability_id,
        student:students(id, full_name),
        availability:trainer_availability!inner(trainer_id)
      `)
      .eq('availability.trainer_id', trainerId)
      .order('reserved_at', { ascending: false })
      .limit(200);

    if (startDate) query = query.gte('reserved_at', startDate);
    if (endDate) query = query.lte('reserved_at', endDate);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

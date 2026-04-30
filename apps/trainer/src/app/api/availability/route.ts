import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, getTrainerIdFromRequest } from '@/lib/supabase-api';

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    let query = supabase
      .from('trainer_availability')
      .select('*')
      .eq('trainer_id', trainerId)
      .order('starts_at', { ascending: true });

    if (startDate) query = query.gte('starts_at', startDate);
    if (endDate) query = query.lte('starts_at', endDate);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);
    const { id, starts_at, ends_at } = await request.json();

    const { data, error } = await supabase
      .from('trainer_availability')
      .update({ starts_at, ends_at })
      .eq('id', id)
      .eq('trainer_id', trainerId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);
    const { starts_at, ends_at, block_type, capacity, session_duration_min } = await request.json();

    const { data, error } = await supabase
      .from('trainer_availability')
      .insert({
        trainer_id: trainerId,
        starts_at,
        ends_at,
        block_type: block_type ?? 'available',
        capacity: capacity ?? 1,
        session_duration_min: session_duration_min ?? 60,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

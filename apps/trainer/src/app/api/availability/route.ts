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

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

    const { error } = await supabase
      .from('trainer_availability')
      .delete()
      .eq('id', id)
      .eq('trainer_id', trainerId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);
    const { starts_at, ends_at, block_type, capacity, gym_id, student_ids } = await request.json();

    const { data: block, error } = await supabase
      .from('trainer_availability')
      .insert({
        trainer_id: trainerId,
        starts_at,
        ends_at,
        block_type: block_type ?? 'available',
        capacity: capacity ?? 1,
        gym_id: gym_id ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert(
          student_ids.map((sid: string) => ({
            trainer_availability_id: block.id,
            student_id: sid,
            status: 'reserved',
          }))
        );
      if (bookingError) throw new Error(bookingError.message);
    }

    return NextResponse.json(block);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

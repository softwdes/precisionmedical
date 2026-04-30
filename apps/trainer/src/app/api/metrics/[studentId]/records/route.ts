import { NextRequest, NextResponse } from 'next/server';
import { createApiClient } from '@/lib/supabase-api';

interface Props {
  params: Promise<{ studentId: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { studentId } = await params;
    const supabase = createApiClient(request);

    const { data, error } = await supabase
      .from('personal_records')
      .select('id, exercise_name, weight_kg, reps, achieved_on')
      .eq('student_id', studentId)
      .order('achieved_on', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

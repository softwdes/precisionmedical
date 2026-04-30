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
      .from('body_metrics')
      .select('id, measured_at, weight_kg, body_fat_pct, muscle_mass_kg')
      .eq('student_id', studentId)
      .order('measured_at', { ascending: false })
      .limit(90);

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

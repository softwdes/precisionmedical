import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, getTrainerIdFromRequest } from '@/lib/supabase-api';

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const trainerId = await getTrainerIdFromRequest(request);

    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('trainer_id', trainerId)
      .is('archived_at', null)
      .order('full_name', { ascending: true });

    if (studentsError) throw new Error(studentsError.message);
    if (!students || students.length === 0) return NextResponse.json([]);

    const studentIds = students.map(s => s.id);

    // Batch fetch latest metric per student — no N+1
    const { data: allMetrics, error: metricsError } = await supabase
      .from('body_metrics')
      .select('student_id, weight_kg, body_fat_pct, muscle_mass_kg, measured_at')
      .in('student_id', studentIds)
      .order('measured_at', { ascending: false });

    if (metricsError) throw new Error(metricsError.message);

    type MetricRow = NonNullable<typeof allMetrics>[number];
    const latestByStudent = new Map<string, MetricRow>();
    for (const m of allMetrics ?? []) {
      if (!latestByStudent.has(m.student_id)) latestByStudent.set(m.student_id, m);
    }

    const result = students.map(s => ({
      ...s,
      latestMetric: latestByStudent.get(s.id) ?? null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const { student_id, weight_kg, body_fat_pct, muscle_mass_kg, notes } = await request.json();

    const { data, error } = await supabase
      .from('body_metrics')
      .insert({
        student_id,
        measured_at: new Date().toISOString(),
        weight_kg,
        body_fat_pct,
        muscle_mass_kg,
        notes,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

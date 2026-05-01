import { NextRequest, NextResponse } from 'next/server';
import { createApiClient } from '@/lib/supabase-api';

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiClient(request);
    const { data, error } = await supabase
      .from('gyms')
      .select('id, name')
      .order('name');
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

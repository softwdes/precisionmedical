import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { runAuditScan } from '@/lib/audit/runAuditScan';

type TriggeredBy = 'manual' | 'cron';

async function resolveAuth(req: NextRequest): Promise<{ ok: true; userId?: string; triggeredBy: TriggeredBy } | { ok: false }> {
  // Internal call from Edge Function cron — validate service key header
  const serviceKey = req.headers.get('x-service-key');
  if (serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    let triggeredBy: TriggeredBy = 'cron';
    try {
      const body = await req.clone().json() as { triggered_by?: string };
      if (body.triggered_by === 'manual') triggeredBy = 'manual';
    } catch { /* body may be empty */ }
    return { ok: true, triggeredBy };
  }

  // Normal user session auth
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  return { ok: true, userId: user.id, triggeredBy: 'manual' };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveAuth(req);
    if (!auth.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const result = await runAuditScan(auth.triggeredBy, auth.userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const status = message.includes('en progreso') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('audit_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ runs: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

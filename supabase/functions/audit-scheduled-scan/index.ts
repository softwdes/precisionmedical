// Supabase Edge Function — Audit Scheduled Scan
// Triggered by cron at 02:00 AM daily (configure in Supabase dashboard)
// Setup: supabase functions deploy audit-scheduled-scan

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const openRouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? '';
const openRouterModel = Deno.env.get('OPENROUTER_MODEL') ?? 'poolside/laguna-m.1:free';
const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'erick@precisionmedicalcare.com';
const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://app.precisionmedicalcare.com';
const resendFrom = Deno.env.get('RESEND_FROM_EMAIL') ?? 'LM Super Admin <onboarding@resend.dev>';

interface FindingInsert {
  severity: 'critical' | 'warning' | 'info';
  module: string;
  description: string;
  suggestion: string | null;
  status: 'pending';
  run_id: string;
}

Deno.serve(async (_req: Request): Promise<Response> => {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();

  // Block concurrent scans
  const { data: running } = await supabase
    .from('audit_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
    .maybeSingle();

  if (running) {
    return new Response(JSON.stringify({ error: 'Scan already in progress' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create run record
  const { data: run, error: runError } = await supabase
    .from('audit_runs')
    .insert({ triggered_by: 'cron', started_at: now, status: 'running' })
    .select('id')
    .single();

  if (runError || !run) {
    return new Response(JSON.stringify({ error: 'Failed to create audit run' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const runId = (run as { id: string }).id;
  const findings: FindingInsert[] = [];

  // ── Rule-based checks ─────────────────────────────────────

  const [cashResult, paymentsResult, fxResult, commissionsResult] = await Promise.allSettled([
    supabase
      .from('cash_boxes')
      .select('id, name, currency, balance, lowBalanceThreshold')
      .then(({ data: boxes }) =>
        (boxes ?? []).filter(
          (b: { balance: number; lowBalanceThreshold: number }) =>
            Number(b.balance) < Number(b.lowBalanceThreshold),
        ),
      ),
    supabase
      .from('payments')
      .select('id, employeeId, amountLocal, currencyLocal, period, createdAt')
      .neq('status', 'REVERSED')
      .order('createdAt', { ascending: false })
      .limit(500)
      .then(({ data }) => data ?? []),
    supabase
      .from('fx_operations')
      .select('id, rate, performedAt')
      .gte('performedAt', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .then(({ data }) => data ?? []),
    supabase
      .from('commissions')
      .select('id, lawyerId, providerId, status')
      .eq('status', 'EARNED')
      .is('lawyerId', null)
      .is('providerId', null)
      .then(({ data }) => data ?? []),
  ]);

  if (cashResult.status === 'fulfilled') {
    for (const box of cashResult.value as Array<{ name: string; currency: string; balance: number; lowBalanceThreshold: number }>) {
      findings.push({
        severity: 'critical',
        module: 'caja_chica',
        description: `Caja "${box.name}" · saldo ${box.currency} ${Number(box.balance).toFixed(2)} por debajo del mínimo (${Number(box.lowBalanceThreshold).toFixed(2)})`,
        suggestion: 'Registrar un depósito para reponer el saldo mínimo requerido',
        status: 'pending',
        run_id: runId,
      });
    }
  }

  if (paymentsResult.status === 'fulfilled') {
    const payments = paymentsResult.value as Array<{ id: string; employeeId: string; amountLocal: number; currencyLocal: string; period: string; createdAt: string }>;
    const seen = new Map<string, typeof payments[number]>();
    const reported = new Set<string>();
    for (const p of payments) {
      const key = `${p.employeeId}|${Number(p.amountLocal).toFixed(2)}|${p.period}`;
      const prev = seen.get(key);
      if (prev && !reported.has(key)) {
        const diffMs = Math.abs(new Date(p.createdAt).getTime() - new Date(prev.createdAt).getTime());
        if (diffMs < 24 * 60 * 60 * 1000) {
          reported.add(key);
          findings.push({
            severity: 'critical',
            module: 'empleados',
            description: `Posible pago duplicado: empleado ...${p.employeeId.slice(-6)} · ${p.currencyLocal} ${Number(p.amountLocal).toFixed(2)} · período ${p.period}`,
            suggestion: 'Verificar si ambos pagos son intencionales o si uno debe reversarse',
            status: 'pending',
            run_id: runId,
          });
        }
      } else {
        seen.set(key, p);
      }
    }
  }

  if (fxResult.status === 'fulfilled') {
    const ops = fxResult.value as Array<{ id: string; rate: number }>;
    if (ops.length > 3) {
      const avgRate = ops.reduce((s: number, o: { rate: number }) => s + Number(o.rate), 0) / ops.length;
      for (const op of ops.slice(0, 10)) {
        const dev = Math.abs(Number(op.rate) - avgRate) / avgRate;
        if (dev > 0.2) {
          findings.push({
            severity: 'warning',
            module: 'fx',
            description: `Operación FX con tasa ${Number(op.rate).toFixed(4)} · desvío ${(dev * 100).toFixed(1)}% del promedio histórico`,
            suggestion: 'Verificar que la tasa aplicada sea correcta con la casa de cambio',
            status: 'pending',
            run_id: runId,
          });
          break;
        }
      }
    }
  }

  if (commissionsResult.status === 'fulfilled') {
    const count = (commissionsResult.value as unknown[]).length;
    if (count > 0) {
      findings.push({
        severity: 'warning',
        module: 'comisiones',
        description: `${count} comisión(es) devengada(s) sin abogado ni proveedor asignado`,
        suggestion: 'Asignar el abogado o proveedor correspondiente a cada comisión sin referencia',
        status: 'pending',
        run_id: runId,
      });
    }
  }

  // ── AI enrichment (non-fatal) ─────────────────────────────

  if (openRouterKey) {
    try {
      const summary = findings.length > 0
        ? findings.map(f => `[${f.severity.toUpperCase()}][${f.module}] ${f.description}`).join('\n')
        : 'Sin anomalías detectadas.';
      const prompt = findings.length > 0
        ? `Eres un auditor financiero. Analiza estos hallazgos en 2 oraciones en español:\n${summary}`
        : 'Auditoría rutinaria sin anomalías. Confirma brevemente en 1 oración en español.';

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': appUrl,
          'X-Title': 'Precision Medical Audit Agent',
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
        }),
      });

      if (resp.ok) {
        const aiData = await resp.json() as { choices: Array<{ message: { content: string } }> };
        const aiText = aiData.choices?.[0]?.message?.content?.trim() ?? '';
        if (aiText) {
          findings.push({
            severity: 'info',
            module: 'sistema',
            description: `Análisis IA (cron): ${aiText}`,
            suggestion: null,
            status: 'pending',
            run_id: runId,
          });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // ── Persist findings ──────────────────────────────────────

  if (findings.length > 0) {
    await supabase.from('audit_findings').insert(findings);
  }

  const critical_count = findings.filter(f => f.severity === 'critical').length;
  const warning_count = findings.filter(f => f.severity === 'warning').length;
  const info_count = findings.filter(f => f.severity === 'info').length;

  await supabase.from('audit_runs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    findings_count: findings.length,
    critical_count,
    warning_count,
    info_count,
  }).eq('id', runId);

  // ── Cost tracking ─────────────────────────────────────────

  try {
    const monthKey = `${new Date().toISOString().slice(0, 7)}-01`;
    const { data: existing } = await supabase
      .from('agent_costs')
      .select('operation_count, total_cost')
      .eq('agent_name', 'audit_agent')
      .eq('month', monthKey)
      .maybeSingle();

    await supabase.from('agent_costs').upsert({
      agent_name: 'audit_agent',
      month: monthKey,
      total_cost: Number((existing as { total_cost: number } | null)?.total_cost ?? 0),
      operation_count: Number((existing as { operation_count: number } | null)?.operation_count ?? 0) + 1,
      model_used: openRouterModel,
    }, { onConflict: 'agent_name,month' });
  } catch {
    // Non-fatal
  }

  // ── Alert email ───────────────────────────────────────────

  if (critical_count > 0 && resendKey) {
    const { data: settings } = await supabase
      .from('agent_settings')
      .select('notify_email')
      .eq('agent_name', 'audit_agent')
      .maybeSingle();

    if ((settings as { notify_email: boolean } | null)?.notify_email) {
      try {
        const findingRows = findings
          .filter(f => f.severity === 'critical')
          .map(f => `
            <div style="background:#0A0A0F;border:1px solid rgba(244,63,94,0.25);border-left:3px solid #F43F5E;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
              <p style="margin:0 0 4px;color:#F43F5E;font-size:10px;font-weight:700;text-transform:uppercase;">${f.module.toUpperCase()}</p>
              <p style="margin:0 0 6px;color:#E2E2EE;font-size:13px;">${f.description}</p>
              ${f.suggestion ? `<p style="margin:0;color:#8888AA;font-size:11px;font-style:italic;">💡 ${f.suggestion}</p>` : ''}
            </div>
          `)
          .join('');

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: adminEmail,
            subject: `🔍 Audit Agent · ${critical_count} hallazgo${critical_count !== 1 ? 's' : ''} crítico${critical_count !== 1 ? 's' : ''} detectado${critical_count !== 1 ? 's' : ''}`,
            html: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#0A0A0F;font-family:system-ui,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:32px 16px;"><div style="background:#111118;border:1px solid #1E1E2E;border-radius:12px;padding:28px;"><h2 style="color:#E2E2EE;font-size:18px;font-weight:700;margin:0 0 8px;text-align:center;">Audit Agent · ${critical_count} hallazgo${critical_count !== 1 ? 's' : ''} crítico${critical_count !== 1 ? 's' : ''}</h2><p style="color:#8888AA;font-size:13px;margin:0 0 20px;text-align:center;">El escaneo programado detectó anomalías que requieren tu atención.</p>${findingRows}<div style="text-align:center;margin-top:20px;"><a href="${appUrl}/dashboard/ai-agents" style="display:inline-block;background:linear-gradient(135deg,#6366F1,#8B5CF6);color:white;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Ver hallazgos →</a></div></div></div></body></html>`,
          }),
        });
      } catch {
        // Non-fatal
      }
    }
  }

  return new Response(
    JSON.stringify({ run_id: runId, findings_count: findings.length, critical_count, warning_count, info_count }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

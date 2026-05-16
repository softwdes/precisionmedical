import { createAdminClient } from '@precision-medical/auth';
import { sendAuditAlertEmail } from '@precision-medical/api';

interface FindingInsert {
  severity: 'critical' | 'warning' | 'info';
  module: string;
  description: string;
  suggestion: string | null;
  status: 'pending';
  run_id: string;
}

export interface ScanResult {
  run_id: string;
  findings_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
}

export async function runAuditScan(
  triggeredBy: 'manual' | 'cron' = 'manual',
  userId?: string,
): Promise<ScanResult> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Block concurrent scans
  const { data: running } = await supabase
    .from('audit_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
    .maybeSingle();

  if (running) throw new Error('Ya hay un escaneo en progreso');

  // Create run record
  const { data: run, error: runError } = await supabase
    .from('audit_runs')
    .insert({
      triggered_by: triggeredBy,
      triggered_by_user: userId ?? null,
      started_at: now,
      status: 'running',
    })
    .select('id')
    .single();

  if (runError ?? !run) throw new Error('No se pudo crear el registro de escaneo');
  const runId = (run as { id: string }).id;

  const findings: FindingInsert[] = [];

  // ── Rule-based checks ──────────────────────────────────────

  const [cashResult, paymentsResult, fxResult, commissionsResult] = await Promise.allSettled([
    // CHECK 1: Cash boxes below threshold
    supabase
      .from('cash_boxes')
      .select('id, name, currency, balance, lowBalanceThreshold')
      .then(({ data: boxes }) =>
        (boxes ?? []).filter(
          (b: { balance: number; lowBalanceThreshold: number }) =>
            Number(b.balance) < Number(b.lowBalanceThreshold),
        ),
      ),

    // CHECK 2 + 3: Duplicate payments within 24h for same employee / amount / period
    supabase
      .from('payments')
      .select('id, employeeId, amountLocal, currencyLocal, period, createdAt')
      .neq('status', 'REVERSED')
      .order('createdAt', { ascending: false })
      .limit(500)
      .then(({ data }) => data ?? []),

    // CHECK 4: FX operations last 90 days — detect outlier rates
    supabase
      .from('fx_operations')
      .select('id, rate, performedAt')
      .gte('performedAt', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .then(({ data }) => data ?? []),

    // CHECK 5: Earned commissions with no lawyer or provider assigned
    supabase
      .from('commissions')
      .select('id, lawyerId, providerId, status')
      .eq('status', 'EARNED')
      .is('lawyerId', null)
      .is('providerId', null)
      .then(({ data }) => data ?? []),
  ]);

  // Process CHECK 1
  if (cashResult.status === 'fulfilled') {
    for (const box of cashResult.value as Array<{
      name: string; currency: string; balance: number; lowBalanceThreshold: number;
    }>) {
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

  // Process CHECK 2 + 3: duplicate payments
  if (paymentsResult.status === 'fulfilled') {
    const payments = paymentsResult.value as Array<{
      id: string; employeeId: string; amountLocal: number;
      currencyLocal: string; period: string; createdAt: string;
    }>;
    const seen = new Map<string, (typeof payments)[number]>();
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

  // Process CHECK 4: FX rate outliers (>20% deviation from 90-day avg)
  if (fxResult.status === 'fulfilled') {
    const ops = fxResult.value as Array<{ id: string; rate: number }>;
    if (ops.length > 3) {
      const avgRate = ops.reduce((s, o) => s + Number(o.rate), 0) / ops.length;
      for (const op of ops.slice(0, 10)) {
        const dev = Math.abs(Number(op.rate) - avgRate) / avgRate;
        if (dev > 0.2) {
          findings.push({
            severity: 'warning',
            module: 'fx',
            description: `Operación FX con tasa ${Number(op.rate).toFixed(4)} · desvío ${(dev * 100).toFixed(1)}% del promedio histórico (${avgRate.toFixed(4)})`,
            suggestion: 'Verificar que la tasa aplicada sea correcta con la casa de cambio',
            status: 'pending',
            run_id: runId,
          });
          break;
        }
      }
    }
  }

  // Process CHECK 5: commissions without reference
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

  // ── AI enrichment via OpenRouter (non-fatal) ──────────────

  if (process.env.AI_PROVIDER === 'openrouter' && process.env.OPENROUTER_API_KEY) {
    try {
      const model = process.env.OPENROUTER_MODEL ?? 'poolside/laguna-m.1:free';
      const summary =
        findings.length > 0
          ? findings.map(f => `[${f.severity.toUpperCase()}][${f.module}] ${f.description}`).join('\n')
          : 'Sin anomalías detectadas en las verificaciones de reglas.';

      const prompt =
        findings.length > 0
          ? `Eres un auditor financiero de una clínica médica. Analiza estos hallazgos y proporciona un resumen de riesgo en 2 oraciones en español:\n${summary}`
          : 'Eres un auditor financiero. No se detectaron anomalías en el escaneo rutinario. Confirma brevemente en 1 oración en español.';

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.precisionmedicalcare.com',
          'X-Title': 'Precision Medical Audit Agent',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
        }),
      });

      if (resp.ok) {
        const aiData = (await resp.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        const aiText = aiData.choices?.[0]?.message?.content?.trim() ?? '';
        if (aiText) {
          findings.push({
            severity: 'info',
            module: 'sistema',
            description: `Análisis IA: ${aiText}`,
            suggestion: null,
            status: 'pending',
            run_id: runId,
          });
        }
      }
    } catch {
      // Non-fatal: AI failure does not block the scan
    }
  }

  // ── Persist findings ──────────────────────────────────────

  if (findings.length > 0) {
    await supabase.from('audit_findings').insert(findings);
  }

  const critical_count = findings.filter(f => f.severity === 'critical').length;
  const warning_count = findings.filter(f => f.severity === 'warning').length;
  const info_count = findings.filter(f => f.severity === 'info').length;

  await supabase
    .from('audit_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: findings.length,
      critical_count,
      warning_count,
      info_count,
    })
    .eq('id', runId);

  // ── Cost tracking (free model = $0, but log operation count) ──

  try {
    const monthKey = `${new Date().toISOString().slice(0, 7)}-01`;
    const { data: existing } = await supabase
      .from('agent_costs')
      .select('operation_count, total_cost')
      .eq('agent_name', 'audit_agent')
      .eq('month', monthKey)
      .maybeSingle();

    await supabase.from('agent_costs').upsert(
      {
        agent_name: 'audit_agent',
        month: monthKey,
        total_cost: Number((existing as { total_cost: number } | null)?.total_cost ?? 0),
        operation_count: Number((existing as { operation_count: number } | null)?.operation_count ?? 0) + 1,
        model_used: process.env.OPENROUTER_MODEL ?? 'poolside/laguna-m.1:free',
      },
      { onConflict: 'agent_name,month' },
    );
  } catch {
    // Non-fatal
  }

  // ── Alert email for critical findings ─────────────────────

  if (critical_count > 0) {
    const { data: settings } = await supabase
      .from('agent_settings')
      .select('notify_email')
      .eq('agent_name', 'audit_agent')
      .maybeSingle();

    if ((settings as { notify_email: boolean } | null)?.notify_email) {
      try {
        await sendAuditAlertEmail({
          to: process.env.ADMIN_EMAIL ?? 'erick@precisionmedicalcare.com',
          criticalCount: critical_count,
          findings: findings.filter(f => f.severity === 'critical'),
        });
      } catch {
        // Non-fatal
      }
    }
  }

  return {
    run_id: runId,
    findings_count: findings.length,
    critical_count,
    warning_count,
    info_count,
  };
}

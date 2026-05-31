import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

interface CifoMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

function detectLanguage(text: string): 'es' | 'en' {
  const spanishWords = ['hola', 'qué', 'cómo', 'cuánto', 'cuál', 'hay', 'dame', 'muestra', 'dime',
    'está', 'son', 'tiene', 'puedes', 'gracias', 'resumen', 'empleados', 'pago', 'quiero',
    'necesito', 'tengo', 'puedo', 'freelancer', 'comision', 'saldo', 'caja', 'billetera'];
  const lower = text.toLowerCase();
  return spanishWords.some(w => lower.includes(w)) ? 'es' : 'en';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. AUTH
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // 2. PARSE BODY
  let body: { message?: string; session_id?: string; language?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { message, session_id, language } = body;
  if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

  const startTime = Date.now();
  const detectedLang: 'es' | 'en' = (language as 'es' | 'en') ?? detectLanguage(message);
  const isSpanish = detectedLang === 'es';

  // 3. FETCH REAL-TIME DATA — 12 queries in parallel

  // Raw bucket types
  type EmpRow      = { id: string; firstName: string; lastName: string; type: string; position: string; baseSalary: string | null; baseCurrency: string; countryId: string; departmentId: string };
  type CashRow     = { id: string; name: string; balance: string; lowBalanceThreshold: string; currency: string };
  type CountryRow  = { id: string; code: string };
  type DeptRow     = { id: string; name: string };
  type PmtMonthRow = { amountLocal: string; bonus_amount: string | null };
  type PmtRecentRow= { employeeId: string; amountLocal: string; currencyLocal: string; period: string; status: string; paidDate: string | null; bonus_amount: string | null };
  type FLRow       = { id: string; nombre: string; pais: string; modalidad: string; tarifaBase: string | null; moneda: string };
  type FPRow       = { freelancerId: string; monto: string; moneda: string; descripcion: string; fechaPago: string };
  type WalletRow   = { name: string; currency: string; balance: string };
  type CommRow     = { amount: string; currency: string; status: string; paidAt: string | null };
  type FindingRow  = { severity: string; module: string; description: string };
  type AuditRunRow = { created_at: string; status: string; findings_count: number; critical_count: number };

  // Result buckets (filled by Promise.allSettled)
  let cashBoxRows:     CashRow[]      = [];
  let empRows:         EmpRow[]       = [];
  let countryRows:     CountryRow[]   = [];
  let deptRows:        DeptRow[]      = [];
  let pmtMonthRows:    PmtMonthRow[]  = [];
  let pmtRecentRows:   PmtRecentRow[] = [];
  let flRows:          FLRow[]        = [];
  let fpRows:          FPRow[]        = [];
  let walletRows:      WalletRow[]    = [];
  let commRows:        CommRow[]      = [];
  let findingRows:     FindingRow[]   = [];
  let lastAuditRow:    AuditRunRow | undefined;

  const monthStart    = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  await Promise.allSettled([
    // Cash boxes (petty cash) — solo cajas activas (is_active=true);
    // las desactivadas NO deben aparecer en el contexto del CIFO ni
    // generar "low:true" en la respuesta de la IA.
    admin.from('cash_boxes')
      .select('id, name, balance, lowBalanceThreshold, currency')
      .eq('is_active', true)
      .then(({ data }) => { if (data) cashBoxRows = data as CashRow[]; }),

    // Active employees with lookup IDs
    admin.from('employees')
      .select('id, firstName, lastName, type, position, baseSalary, baseCurrency, countryId, departmentId')
      .eq('status', 'ACTIVE')
      .is('deletedAt', null)
      .then(({ data }) => { if (data) empRows = data as EmpRow[]; }),

    // Country code lookup (id → "US"/"BO"/"PE")
    admin.from('countries')
      .select('id, code')
      .then(({ data }) => { if (data) countryRows = data as CountryRow[]; }),

    // Department name lookup (id → "Marketing")
    admin.from('departments')
      .select('id, name')
      .then(({ data }) => { if (data) deptRows = data as DeptRow[]; }),

    // Payments this month — aggregate summary
    admin.from('payments')
      .select('amountLocal, bonus_amount')
      .gte('createdAt', monthStart)
      .then(({ data }) => { if (data) pmtMonthRows = data as PmtMonthRow[]; }),

    // Last 15 payments — individual detail with employee lookup
    admin.from('payments')
      .select('employeeId, amountLocal, currencyLocal, period, status, paidDate, bonus_amount')
      .order('createdAt', { ascending: false })
      .limit(15)
      .then(({ data }) => { if (data) pmtRecentRows = data as PmtRecentRow[]; }),

    // Active freelancers — full detail (id needed for payment lookup)
    admin.from('freelancers')
      .select('id, nombre, pais, modalidad, tarifaBase, moneda')
      .eq('status', 'active')
      .is('deletedAt', null)
      .then(({ data }) => { if (data) flRows = data as FLRow[]; }),

    // Freelancer payments — last 90 days
    admin.from('freelancer_payments')
      .select('freelancerId, monto, moneda, descripcion, fechaPago')
      .gte('fechaPago', ninetyDaysAgo)
      .order('fechaPago', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) fpRows = data as FPRow[]; }),

    // Wallets — main treasury by country
    admin.from('wallets')
      .select('name, currency, balance')
      .then(({ data }) => { if (data) walletRows = data as WalletRow[]; }),

    // Commissions — last 90 days (earned + paid)
    admin.from('commissions')
      .select('amount, currency, status, paidAt')
      .in('status', ['EARNED', 'APPROVED', 'PAID'])
      .gte('earnedAt', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .then(({ data }) => { if (data) commRows = data as CommRow[]; }),

    // Audit findings — pending
    admin.from('audit_findings')
      .select('severity, module, description')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) findingRows = data as FindingRow[]; }),

    // Last completed audit run
    admin.from('audit_runs')
      .select('created_at, status, findings_count, critical_count')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => { if (data?.[0]) lastAuditRow = data[0] as AuditRunRow; }),
  ]);

  // 4. ENRICH & BUILD CONTEXT

  // Lookup maps
  const countryMap = new Map(countryRows.map(c => [c.id, c.code]));
  const deptMap    = new Map(deptRows.map(d => [d.id, d.name]));
  const empNameMap = new Map<string, string>();
  const flNameMap  = new Map(flRows.map(f => [f.id, f.nombre]));

  // Employees — resolved names, department, country, salary
  const employees = empRows.map(e => {
    const fullName = `${e.firstName} ${e.lastName}`;
    empNameMap.set(e.id, fullName);
    return {
      name:       fullName,
      type:       e.type,
      position:   e.position,
      department: deptMap.get(e.departmentId) ?? '—',
      country:    countryMap.get(e.countryId) ?? '—',
      salary:     e.baseSalary != null
        ? `${Number(e.baseSalary).toFixed(2)} ${e.baseCurrency}`
        : null,
    };
  });

  const employees_summary = {
    total:         employees.length,
    by_country:    employees.reduce<Record<string, number>>((a, e) => { a[e.country]    = (a[e.country]    ?? 0) + 1; return a; }, {}),
    by_department: employees.reduce<Record<string, number>>((a, e) => { a[e.department] = (a[e.department] ?? 0) + 1; return a; }, {}),
  };

  // Payments this month — aggregate
  const payments_this_month = {
    count:   pmtMonthRows.length,
    total:   pmtMonthRows.reduce((s, p) => s + Number(p.amountLocal),    0),
    bonuses: pmtMonthRows.reduce((s, p) => s + Number(p.bonus_amount ?? 0), 0),
  };

  // Recent payments — enriched with employee name
  const recent_payments = pmtRecentRows.map(p => ({
    employee:  empNameMap.get(p.employeeId) ?? `(…${p.employeeId.slice(-6)})`,
    amount:    Number(p.amountLocal),
    currency:  p.currencyLocal,
    period:    p.period,
    status:    p.status,
    paid_date: p.paidDate ?? null,
    bonus:     p.bonus_amount != null ? Number(p.bonus_amount) : null,
  }));

  // Freelancers — formatted tariff
  const freelancers = flRows.map(f => ({
    nombre:   f.nombre,
    pais:     f.pais,
    modalidad: f.modalidad === 'POR_HORA' ? 'Por hora' : 'Por servicio',
    tarifa:   f.tarifaBase != null
      ? `${Number(f.tarifaBase).toFixed(2)} ${f.moneda}${f.modalidad === 'POR_HORA' ? '/hr' : ''}`
      : 'Sin tarifa fija',
  }));

  // Freelancer payments — enriched with freelancer name
  const recent_freelancer_payments = fpRows.map(p => ({
    freelancer:  flNameMap.get(p.freelancerId) ?? `(…${p.freelancerId.slice(-6)})`,
    amount:      Number(p.monto),
    currency:    p.moneda,
    description: p.descripcion,
    date:        p.fechaPago,
  }));

  // Wallets
  const wallets = walletRows.map(w => ({
    name:     w.name,
    currency: w.currency,
    balance:  Number(w.balance),
  }));

  // Cash boxes — annotate low balance.
  // Solo marcamos low:true en cajas activas Y aperturadas (con >=1
  // transaccion). Cajas recien creadas sin uso nunca disparan "low".
  const cashBoxIds = cashBoxRows.map(b => b.id);
  const aperturadas = new Set<string>();
  if (cashBoxIds.length > 0) {
    const { data: txRows } = await admin
      .from('cash_transactions')
      .select('cashBoxId')
      .in('cashBoxId', cashBoxIds);
    for (const t of (txRows ?? []) as Array<{ cashBoxId: string }>) {
      aperturadas.add(t.cashBoxId);
    }
  }
  const cash_boxes = cashBoxRows.map(b => ({
    name:      b.name,
    balance:   Number(b.balance),
    threshold: Number(b.lowBalanceThreshold),
    currency:  b.currency,
    low:       aperturadas.has(b.id)
                 && Number(b.balance) < Number(b.lowBalanceThreshold),
  }));

  // Commissions — summary
  const earned       = commRows.filter(c => c.status === 'EARNED' || c.status === 'APPROVED');
  const paidThisMo   = commRows.filter(c => c.status === 'PAID' && c.paidAt != null && c.paidAt >= monthStart);
  const commissions_summary = {
    earned_pending_count: earned.length,
    earned_pending_total: Number(earned.reduce((s, c) => s + Number(c.amount), 0).toFixed(2)),
    paid_this_month_count: paidThisMo.length,
    paid_this_month_total: Number(paidThisMo.reduce((s, c) => s + Number(c.amount), 0).toFixed(2)),
  };

  // Audit
  const audit_findings = findingRows.length > 0 ? {
    total:    findingRows.length,
    critical: findingRows.filter(f => f.severity === 'critical').length,
    warning:  findingRows.filter(f => f.severity === 'warning').length,
    items:    findingRows,
  } : null;

  // Final context object passed to LLM
  const contextData = {
    cash_boxes,
    wallets,
    employees,
    employees_summary,
    payments_this_month,
    recent_payments,
    freelancers,
    recent_freelancer_payments,
    commissions_summary,
    ...(audit_findings  ? { audit_findings }      : {}),
    ...(lastAuditRow    ? { last_audit: lastAuditRow } : {}),
  };

  // 5. GET CONVERSATION HISTORY (last 10 messages)
  const sessionId = session_id ?? crypto.randomUUID();
  const { data: history } = await admin
    .from('cifo_conversations')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(10);

  // 6. BUILD SYSTEM PROMPT
  const currentDate = new Date().toLocaleDateString(
    isSpanish ? 'es-ES' : 'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  );

  const systemPrompt = isSpanish
    ? `Eres CIFO, el asistente de inteligencia artificial de Precision Medical, una clínica especializada en auto-accidentes en Utah, USA, con operaciones en Bolivia y Perú.

Personalidad:
- Nombre: CIFO (pronunciado "sí-fo") · Tono: amigable, profesional, directo
- Conciso — sin párrafos innecesarios · Nunca inventas datos
- Hablas en español si te hablan en español

Hoy es: ${currentDate}
Usuario: Erick Salinas (Super Admin)

DATOS EN TIEMPO REAL:
${JSON.stringify(contextData, null, 2)}

GUÍA DE SECCIONES:
• cash_boxes — cajas chicas por clínica. "low:true" = saldo bajo el mínimo → urgente
• wallets — billeteras del tesoro principal (USD/BOB/PEN por país)
• employees — lista de empleados activos: nombre, cargo, departamento, país, salario
• employees_summary — conteo por país y por departamento
• payments_this_month — resumen total pagado a empleados este mes
• recent_payments — últimos 15 pagos individuales con nombre del empleado
• freelancers — freelancers activos: nombre, país, modalidad, tarifa
• recent_freelancer_payments — pagos a freelancers en los últimos 90 días
• commissions_summary — earned_pending = comisiones devengadas sin pagar; paid_this_month = pagadas este mes
• audit_findings — hallazgos pendientes del Audit Agent (críticos primero)
• last_audit — último escaneo completado

REGLAS:
- Para "¿cuánto gana/se le pagó a X?": busca en employees (salary) y recent_payments (employee)
- Para "¿cuándo/cuánto se le pagó al freelancer X?": busca en recent_freelancer_payments
- Para "¿cuánto hay en caja/billetera?": usa cash_boxes + wallets
- Para comisiones pendientes: usa commissions_summary.earned_pending_total
- Formatea montos con 2 decimales y símbolo de moneda (USD $, BOB Bs., PEN S/)
- Si hay caja con low:true → menciónalo con urgencia aunque no te lo pregunten
- Si hay hallazgos críticos → menciónalo proactivamente
- Emojis con moderación`
    : `You are CIFO, the AI assistant of Precision Medical, a clinic specialized in auto-accidents in Utah, USA, with operations in Bolivia and Peru.

Personality:
- Name: CIFO · Tone: friendly, professional, direct
- Concise — no unnecessary paragraphs · Never invent data
- Speak English when addressed in English

Today is: ${currentDate}
User: Erick Salinas (Super Admin)

REAL-TIME DATA:
${JSON.stringify(contextData, null, 2)}

DATA GUIDE:
• cash_boxes — petty cash by clinic. "low:true" = below minimum threshold → urgent
• wallets — main treasury wallets (USD/BOB/PEN by country)
• employees — active employees: name, position, department, country, salary
• employees_summary — count by country and by department
• payments_this_month — total paid to employees this month
• recent_payments — last 15 individual payments with employee name
• freelancers — active freelancers: name, country, modality, rate
• recent_freelancer_payments — freelancer payments in the last 90 days
• commissions_summary — earned_pending = accrued unpaid commissions; paid_this_month = paid this month
• audit_findings — pending Audit Agent findings (critical first)
• last_audit — last completed scan

RULES:
- For "how much does/did X earn?": look in employees (salary) and recent_payments (employee)
- For "when/how much was freelancer X paid?": look in recent_freelancer_payments
- For "how much is in the safe/wallet?": use cash_boxes + wallets
- For pending commissions: use commissions_summary.earned_pending_total
- Format amounts with 2 decimals and currency symbol
- If any cash box has low:true → mention it urgently even if not asked
- If critical audit findings exist → mention them proactively
- Use emojis sparingly`;

  // 7. BUILD MESSAGES ARRAY
  const messages: CifoMessage[] = [
    { role: 'system', content: systemPrompt },
    ...((history ?? []) as Array<{ role: string; content: string }>).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  // 8. CALL OPENROUTER
  let assistantMessage = '';
  let tokensUsed = 0;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? '',
        'X-Title': 'LM Super Admin - CIFO Assistant',
      },
      body: JSON.stringify({
        model: process.env.CIFO_MODEL ?? 'poolside/laguna-m.1:free',
        max_tokens: 800,
        temperature: 0.7,
        messages,
      }),
    });

    if (response.status === 429) {
      assistantMessage = isSpanish
        ? 'Estoy recibiendo muchas consultas. Intenta en unos segundos.'
        : 'Too many requests. Please try again in a few seconds.';
    } else if (response.status === 503) {
      assistantMessage = isSpanish
        ? 'El servicio de IA está temporalmente no disponible. Intenta más tarde.'
        : 'The AI service is temporarily unavailable. Please try again later.';
    } else if (!response.ok) {
      let errBody = '';
      try { errBody = await response.text(); } catch { /* ignore */ }
      console.error(`CIFO OpenRouter HTTP ${response.status}:`, errBody);
      throw new Error(`OpenRouter ${response.status}: ${errBody}`);
    } else {
      const data = await response.json() as OpenRouterResponse;
      assistantMessage = data.choices?.[0]?.message?.content
        ?? (isSpanish
          ? 'Lo siento, no pude procesar tu consulta. Intenta de nuevo.'
          : 'Sorry, I could not process your query. Please try again.');
      tokensUsed = data.usage?.total_tokens ?? 0;
    }
  } catch (error) {
    console.error('CIFO error:', error instanceof Error ? error.message : error);
    assistantMessage = isSpanish
      ? 'Hubo un error al conectar con el servicio de IA. Por favor intenta de nuevo en unos momentos.'
      : 'There was an error connecting to the AI service. Please try again in a moment.';
  }

  const responseTime = Date.now() - startTime;

  // 9. SAVE CONVERSATION
  await admin.from('cifo_conversations').insert([
    {
      session_id:  sessionId,
      user_id:     user.id,
      role:        'user',
      content:     message,
      language:    detectedLang,
      model_used:  process.env.CIFO_MODEL ?? 'poolside/laguna-m.1:free',
    },
    {
      session_id:       sessionId,
      user_id:          user.id,
      role:             'assistant',
      content:          assistantMessage,
      language:         detectedLang,
      tokens_used:      tokensUsed,
      model_used:       process.env.CIFO_MODEL ?? 'poolside/laguna-m.1:free',
      response_time_ms: responseTime,
    },
  ] as never);

  // 10. UPDATE AGENT COSTS (fire and forget)
  const monthKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]!;
  void admin.from('agent_costs').upsert(
    {
      agent_name:      'cifo',
      month:           monthKey,
      total_cost:      0,
      operation_count: 1,
      model_used:      process.env.CIFO_MODEL ?? 'poolside/laguna-m.1:free',
    } as never,
    { onConflict: 'agent_name,month' },
  );

  return NextResponse.json({
    message:         assistantMessage,
    session_id:      sessionId,
    language:        detectedLang,
    response_time_ms: responseTime,
  });
}

// GET /api/cifo/chat?session_id=X — return session message history
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ messages: [] });

  const admin = createAdminClient();
  const { data } = await admin
    .from('cifo_conversations')
    .select('role, content, created_at, language')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ messages: data ?? [] });
}

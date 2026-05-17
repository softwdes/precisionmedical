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

interface ContextData {
  cash_boxes?: Array<{ name: string; balance: number; lowBalanceThreshold: number; currency: string }>;
  employees?: Array<{ id: string; firstName: string; type: string; status: string }>;
  payments_this_month?: { count: number; total: number; bonuses: number };
  audit_findings?: { total: number; critical: number; warning: number; items: Array<{ severity: string; module: string; description: string }> };
  last_audit?: { created_at: string; status: string; findings_count: number; critical_count: number };
  freelancers_count?: number;
}

function detectLanguage(text: string): 'es' | 'en' {
  const spanishWords = ['hola', 'qué', 'cómo', 'cuánto', 'cuál', 'hay', 'dame', 'muestra', 'dime', 'está', 'son', 'tiene', 'puedes', 'gracias', 'resumen', 'empleados', 'pago', 'quiero', 'necesito', 'tengo', 'puedo'];
  const lower = text.toLowerCase();
  return spanishWords.some(w => lower.includes(w)) ? 'es' : 'en';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. AUTH CHECK
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

  // 3. FETCH REAL-TIME DATA IN PARALLEL
  const contextData: ContextData = {};
  await Promise.allSettled([
    admin
      .from('cash_boxes')
      .select('name, balance, lowBalanceThreshold, currency')
      .eq('isActive', true)
      .then(({ data }) => { if (data) contextData.cash_boxes = data as ContextData['cash_boxes']; }),

    admin
      .from('employees')
      .select('id, firstName, type, status')
      .eq('status', 'ACTIVE')
      .is('deletedAt', null)
      .then(({ data }) => { if (data) contextData.employees = data as ContextData['employees']; }),

    admin
      .from('payments')
      .select('amountLocal, currencyLocal, period, base_salary, bonus_amount')
      .gte('createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .then(({ data }) => {
        if (data) {
          contextData.payments_this_month = {
            count: data.length,
            total: data.reduce((s, p) => s + (Number(p.amountLocal) || 0), 0),
            bonuses: data.reduce((s, p) => s + (Number(p.bonus_amount) || 0), 0),
          };
        }
      }),

    admin
      .from('audit_findings')
      .select('severity, module, description, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) {
          contextData.audit_findings = {
            total: data.length,
            critical: data.filter(f => f.severity === 'critical').length,
            warning: data.filter(f => f.severity === 'warning').length,
            items: data as Array<{ severity: string; module: string; description: string }>,
          };
        }
      }),

    admin
      .from('audit_runs')
      .select('created_at, status, findings_count, critical_count')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => { if (data?.[0]) contextData.last_audit = data[0] as ContextData['last_audit']; }),

    admin
      .from('freelancers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .then(({ count }) => { if (count !== null) contextData.freelancers_count = count; }),
  ]);

  // 4. GET CONVERSATION HISTORY (last 10 messages)
  const sessionId = session_id ?? crypto.randomUUID();
  const { data: history } = await admin
    .from('cifo_conversations')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(10);

  // 5. BUILD SYSTEM PROMPT
  const currentDate = new Date().toLocaleDateString(
    isSpanish ? 'es-ES' : 'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  );

  const systemPrompt = isSpanish
    ? `Eres CIFO, el asistente de inteligencia artificial de Precision Medical, una clínica especializada en auto-accidentes ubicada en Utah, USA, con operaciones también en Bolivia y Perú.

Tu personalidad:
- Nombre: CIFO (pronunciado "sí-fo")
- Tono: amigable, profesional, directo y confiable
- Hablas en español cuando te hablan en español, en inglés cuando te hablan en inglés
- Eres conciso — no escribas párrafos largos innecesarios
- Usas los datos reales del sistema que se te proporcionan
- Si no tienes datos sobre algo, lo dices claramente
- Nunca inventas números o información

Hoy es: ${currentDate}
Usuario: Erick Salinas (Super Admin)

DATOS ACTUALES DEL SISTEMA:
${JSON.stringify(contextData, null, 2)}

INSTRUCCIONES:
- Cuando respondas sobre finanzas, usa los números exactos de los datos
- Si la caja chica está bajo el mínimo, menciónalo con urgencia
- Si hay hallazgos críticos del Audit Agent, mencionálos proactivamente
- Para preguntas de resumen del día, incluye los datos más relevantes
- Formatea los montos con 2 decimales y símbolo de moneda
- Usa emojis con moderación para hacer la respuesta más clara`
    : `You are CIFO, the AI assistant of Precision Medical, a clinic specialized in auto-accidents located in Utah, USA, with operations also in Bolivia and Peru.

Your personality:
- Name: CIFO
- Tone: friendly, professional, direct and reliable
- You speak Spanish when addressed in Spanish, English when addressed in English
- You are concise — no unnecessary long paragraphs
- You use real system data provided to you
- If you don't have data about something, say so clearly
- Never invent numbers or information

Today is: ${currentDate}
User: Erick Salinas (Super Admin)

CURRENT SYSTEM DATA:
${JSON.stringify(contextData, null, 2)}

INSTRUCTIONS:
- When answering about finances, use exact numbers from the data
- If petty cash is below minimum, mention it urgently
- If there are critical Audit Agent findings, mention them proactively
- For daily summary questions, include the most relevant data
- Format amounts with 2 decimals and currency symbol
- Use emojis sparingly to make responses clearer`;

  // 6. BUILD MESSAGES ARRAY
  const messages: CifoMessage[] = [
    { role: 'system', content: systemPrompt },
    ...((history ?? []) as Array<{ role: string; content: string }>).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  // 7. CALL OPENROUTER
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
        model: process.env.CIFO_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free',
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
        ?? (isSpanish ? 'Lo siento, no pude procesar tu consulta. Intenta de nuevo.' : 'Sorry, I could not process your query. Please try again.');
      tokensUsed = data.usage?.total_tokens ?? 0;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CIFO error:', errMsg);
    // Surface the real error in the response for debugging
    return NextResponse.json({
      message: isSpanish
        ? `Error temporal del servicio de IA. Intenta de nuevo. (${errMsg.slice(0, 120)})`
        : `Temporary AI service error. Please try again. (${errMsg.slice(0, 120)})`,
      session_id: sessionId,
      language: detectedLang,
      response_time_ms: Date.now() - startTime,
    });
  }

  const responseTime = Date.now() - startTime;

  // 8. SAVE CONVERSATION TO DB
  await admin.from('cifo_conversations').insert([
    {
      session_id: sessionId,
      user_id: user.id,
      role: 'user',
      content: message,
      language: detectedLang,
      model_used: process.env.CIFO_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free',
    },
    {
      session_id: sessionId,
      user_id: user.id,
      role: 'assistant',
      content: assistantMessage,
      language: detectedLang,
      tokens_used: tokensUsed,
      model_used: process.env.CIFO_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free',
      response_time_ms: responseTime,
    },
  ] as never);

  // 9. UPDATE AGENT COSTS (fire and forget)
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const monthKey = currentMonth.toISOString().split('T')[0];

  void admin.from('agent_costs').upsert(
    {
      agent_name: 'cifo',
      month: monthKey,
      total_cost: 0,
      operation_count: 1,
      model_used: process.env.CIFO_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free',
    } as never,
    { onConflict: 'agent_name,month' },
  );

  return NextResponse.json({
    message: assistantMessage,
    session_id: sessionId,
    language: detectedLang,
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

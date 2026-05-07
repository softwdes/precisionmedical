import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/ai-provider';
import { buildSystemPrompt } from '@/lib/ai-context';
import { checkAndIncrementUsage, LIMITE_DIARIO } from '@/lib/ai-usage';
import { createClient } from '@/lib/supabase-server';

interface ParsedAction {
  type: 'register_payment';
  student_name: string;
  student_id: string | null;
  monto: number;
  periodo: string;
  fecha_vencimiento: string;
}

async function parseAction(reply: string, trainerId: string): Promise<{ cleanReply: string; action: ParsedAction | null }> {
  const match = reply.match(/⟦ACCION⟧(\{[\s\S]*?\})⟦\/ACCION⟧/);
  if (!match?.[1]) return { cleanReply: reply, action: null };

  try {
    const raw = JSON.parse(match[1]) as {
      type?: string;
      student_name?: string;
      monto?: number;
      periodo?: string;
      fecha_vencimiento?: string;
    };

    if (raw.type !== 'register_payment' || !raw.student_name) {
      return { cleanReply: reply.replace(/⟦ACCION⟧[\s\S]*?⟦\/ACCION⟧/, '').trim(), action: null };
    }

    const supabase = await createClient();
    const { data: students } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('trainer_id', trainerId)
      .is('archived_at', null)
      .ilike('full_name', `%${raw.student_name}%`)
      .limit(1);

    const student = students?.[0] ?? null;

    const action: ParsedAction = {
      type: 'register_payment',
      student_name: student?.full_name ?? raw.student_name,
      student_id: student?.id ?? null,
      monto: raw.monto ?? 0,
      periodo: raw.periodo ?? new Date().toISOString().slice(0, 7),
      fecha_vencimiento: raw.fecha_vencimiento ?? '',
    };

    const cleanReply = reply.replace(/⟦ACCION⟧[\s\S]*?⟦\/ACCION⟧/, '').trim();
    return { cleanReply, action };
  } catch {
    return { cleanReply: reply.replace(/⟦ACCION⟧[\s\S]*?⟦\/ACCION⟧/, '').trim(), action: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages?: { role: 'user' | 'assistant'; content: string }[];
      trainerId?: string;
    };

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
    }
    if (!body.trainerId) {
      return NextResponse.json({ error: 'trainerId requerido' }, { status: 400 });
    }

    const trainerId = body.trainerId;

    const usage = await checkAndIncrementUsage(trainerId);
    if (!usage.permitido) {
      return NextResponse.json(
        {
          error: 'limite_alcanzado',
          mensaje:
            'Alcanzaste el límite de 10 consultas por hoy. Mañana a las 00:00 se renueva automáticamente.',
          restantes: 0,
          usadas: LIMITE_DIARIO,
        },
        { status: 429 }
      );
    }

    const systemPrompt = await buildSystemPrompt(trainerId);
    const rawReply = await chatCompletion(systemPrompt, body.messages);

    const { cleanReply, action } = await parseAction(rawReply, trainerId);

    return NextResponse.json({
      reply: cleanReply,
      action,
      usage: { usadas: usage.usadas, restantes: usage.restantes, limite: LIMITE_DIARIO },
    });
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };

    if (err?.message?.includes('Missing OPENROUTER_API_KEY')) {
      return NextResponse.json(
        { error: 'Falta configurar OPENROUTER_API_KEY en .env.local' },
        { status: 500 }
      );
    }
    if (err?.status === 429) {
      return NextResponse.json({
        reply:
          'El asistente está procesando muchas consultas en este momento. ' +
          'Esperá unos segundos y volvé a intentarlo.',
      });
    }
    if (err?.status === 401) {
      return NextResponse.json(
        { error: 'API key de OpenRouter inválida.' },
        { status: 401 }
      );
    }
    console.error('Error en /api/ai/chat:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}

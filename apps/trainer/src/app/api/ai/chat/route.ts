import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/ai-provider';
import { buildSystemPrompt } from '@/lib/ai-context';
import { checkAndIncrementUsage, LIMITE_DIARIO } from '@/lib/ai-usage';

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
    const reply = await chatCompletion(systemPrompt, body.messages);

    return NextResponse.json({
      reply,
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

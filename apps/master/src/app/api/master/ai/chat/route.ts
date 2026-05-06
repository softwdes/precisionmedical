import { NextRequest, NextResponse } from 'next/server';
import { getAdminContext } from '@/lib/supabase-server';
import { chatCompletion } from '@/lib/ai-provider';
import { buildMasterSystemPrompt } from '@/lib/master-ai-context';
import { serverClient } from '@precision/db/client';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAdminContext();
    const { messages, adminId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
    }

    const systemPrompt = await buildMasterSystemPrompt(ctx.adminId);
    const reply = await chatCompletion(systemPrompt, messages);

    if (!reply) {
      return NextResponse.json({ error: 'Sin respuesta del modelo' }, { status: 500 });
    }

    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUserMsg) {
      const supabase = serverClient();
      await supabase.from('master_ai_log').insert({
        admin_id: ctx.adminId,
        mensaje_usuario: lastUserMsg.content,
        respuesta_ia: reply,
      });
    }

    return NextResponse.json({ reply });
  } catch (e: any) {
    if (e.message === 'unauthenticated' || e.message === 'forbidden') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    console.error('[MasterAI chat]', e);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

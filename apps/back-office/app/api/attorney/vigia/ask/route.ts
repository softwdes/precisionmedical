/**
 * POST /api/attorney/vigia/ask — le pregunta a Vigía.
 *
 * El alcance no se discute acá: `preguntarAVigia` recibe la SESIÓN y cada
 * herramienta arma su filtro adentro. Esta ruta no acepta ningún parámetro que
 * amplíe lo que se ve — solo el texto de la pregunta.
 *
 * Queda dentro del guard de `/api/attorney/*` del middleware, así que un rol
 * que no sea abogado ni admin no llega ni a ejecutarse.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionLawyer, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { getSessionUser } from '@/lib/session';
import { canSeeVigia } from '@/lib/attorney-portal';
import { preguntarAVigiaStream, type VigiaAnswer } from '@/lib/vigia/agent';
import { resolveActor } from '@/lib/actor';

// El lazo puede encadenar varias llamadas al modelo; el default de Vercel es corto.
export const maxDuration = 60;

const AskSchema = z.object({
  pregunta: z.string().min(3).max(500),
});

export async function POST(req: NextRequest): Promise<Response> {
  const [lawyer, user] = await Promise.all([getSessionLawyer(), getSessionUser()]);
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  // La misma puerta que la pantalla: mientras Vigía esté en construcción, solo
  // admins. Se pregunta acá aparte de en la página porque las APIs no pasan por
  // los checks de página — esta ruta es su propia puerta.
  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  if (!canSeeVigia(lawyer, isAdminViewer)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'SIN_CONFIGURAR', mensaje: 'Falta OPENAI_API_KEY en el entorno.' }, { status: 503 });
  }

  let input: z.infer<typeof AskSchema>;
  try {
    input = AskSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'PREGUNTA_INVALIDA' }, { status: 400 });
  }

  const empezo = Date.now();
  const locale = await getLocale();

  /**
   * NDJSON y no SSE: un objeto JSON por línea.
   *
   * SSE agrega un protocolo entero (event:, data:, reconexión) para algo que se
   * lee una vez y no se reconecta. Con una línea por evento, el cliente parte
   * por `
` y listo.
   */
  const encoder = new TextEncoder();
  let final: VigiaAnswer | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of preguntarAVigiaStream(lawyer, input.pregunta, locale)) {
          if (ev.type === 'done') final = ev.answer;
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
      } catch (err) {
        // El detalle del proveedor no va al cliente: puede traer trozos del prompt.
        console.error('[vigia] fallo la consulta', err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error' }) + '\n'));
      } finally {
        controller.close();

        /**
         * La auditoría se escribe al CERRAR, no antes: solo acá se sabe qué
         * herramientas corrieron y cuánto costó. Si el abogado abandona a mitad,
         * `final` queda null y igual queda registro de que preguntó.
         */
        writeAuditLog(db, {
          ...(await resolveActor(req.headers)),
          action: 'VIGIA_ASK',
          entityType: 'lawyers',
          entityId: lawyer.id,
          metadata: {
            pregunta: input.pregunta,
            herramientas: final?.steps.map((s) => s.tool) ?? [],
            modelo: final?.model ?? null,
            tokens: final?.usage.total ?? 0,
            completa: !!final,
            ms: Date.now() - empezo,
          },
        }).catch(() => undefined);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Sin esto, algunos proxies juntan la respuesta y la sueltan al final —
      // que es exactamente lo que el streaming vino a evitar.
      'X-Accel-Buffering': 'no',
    },
  });
}

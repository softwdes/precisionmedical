/**
 * POST /api/cifo/ask — le pregunta a CIFO.
 *
 * Espejo de `/api/attorney/vigia/ask`, con dos diferencias que importan:
 *
 * · **El candado es una capacidad opt-in**, no un menú. CIFO contesta sobre
 *   los saldos de toda la clínica y las notas de todos los providers, así que no
 *   alcanza con "entrar al back-office" — hace falta `clinicModules.cifo` en
 *   `true`, o ser SUPER_ADMIN/ADMIN. Ver `lib/cifo-access.ts`.
 *
 * · **El alcance no achica nada.** En el portal legal la ruta pasa la sesión del
 *   abogado y cada herramienta se encierra en su bufete. Acá el alcance legítimo
 *   es la clínica entera, así que la garantía se mudó adentro de las
 *   herramientas: **ninguna devuelve el nombre de un paciente**. Esta ruta no
 *   acepta ningún parámetro que amplíe lo que se ve — solo el texto.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { canAskCifo } from '@/lib/cifo-access';
import { preguntarACifoStream, type CifoAnswer } from '@/lib/cifo/agent';
import { alcanceDe } from '@/lib/cifo/alcance';
import { resolveActor } from '@/lib/actor';

// El lazo puede encadenar varias llamadas al modelo; el default de Vercel es corto.
export const maxDuration = 60;

const AskSchema = z.object({
  pregunta: z.string().min(3).max(500),
});

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  // La misma puerta que la pantalla. Se pregunta acá aparte de en la página
  // porque las APIs no pasan por los checks de página: esta ruta es su propia
  // puerta.
  if (!(await canAskCifo())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'SIN_CONFIGURAR', mensaje: 'Falta OPENAI_API_KEY en el entorno.' },
      { status: 503 },
    );
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
   * El alcance sale de la sesión y se recorta a dos campos antes de llegar al
   * prompt — ver `lib/cifo/alcance.ts`. Nunca se pasa el `User` completo.
   */
  const alcance = alcanceDe(user);

  /**
   * NDJSON y no SSE: un objeto JSON por línea.
   *
   * SSE agrega un protocolo entero (event:, data:, reconexión) para algo que se
   * lee una vez y no se reconecta. Con una línea por evento, el cliente parte
   * por `\n` y listo.
   */
  const encoder = new TextEncoder();
  let final: CifoAnswer | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of preguntarACifoStream(alcance, input.pregunta, locale)) {
          if (ev.type === 'done') final = ev.answer;
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
      } catch (err) {
        // El detalle del proveedor no va al cliente: puede traer trozos del prompt.
        console.error('[cifo] fallo la consulta', err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error' }) + '\n'));
      } finally {
        controller.close();

        /**
         * La auditoría se escribe al CERRAR, no antes: solo acá se sabe qué
         * herramientas corrieron y cuánto costó. Si la persona abandona a mitad,
         * `final` queda null y igual queda registro de que preguntó.
         *
         * La PREGUNTA se guarda entera. Es texto que escribió el staff y puede
         * traer un nombre de paciente — que es exactamente lo que hay que poder
         * auditar, porque el prompt le contesta que no busca por nombre.
         */
        await writeAuditLog(db, {
          ...(await resolveActor(req.headers)),
          /**
           * Se queda `SENTINEL_ASK` aunque el agente ahora se llame CIFO.
           *
           * Ya hay **6 filas** con esa acción en la base. Cambiarla a `CIFO_ASK`
           * partiría el historial en dos: quien busque "quién le preguntó al
           * agente" tendría que saber que hubo un rename y buscar las dos, y el
           * que no lo sepa va a ver seis consultas menos. El nombre de una acción
           * de auditoría es un identificador de datos, no una etiqueta de UI.
           *
           * Si algún día se unifica, se migran las filas viejas en la misma
           * pasada y recién ahí se cambia acá.
           */
          action: 'SENTINEL_ASK',
          entityType: 'users',
          entityId: user.id,
          metadata: {
            pregunta: input.pregunta,
            herramientas: final?.steps.map((s) => s.tool) ?? [],
            modelo: final?.model ?? null,
            tokens: final?.usage.total ?? 0,
            completa: !!final,
            ms: Date.now() - empezo,
          },
        }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });
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

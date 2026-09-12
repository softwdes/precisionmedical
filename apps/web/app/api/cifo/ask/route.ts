import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@precision-medical/auth';
import { preguntar, type RespuestaAgente } from '@precision-medical/agente';
import { CIFO_ADMIN } from '@/lib/cifo/agente';
import { puedePreguntarACifo } from '@/lib/cifo/acceso';
import { getCurrentUserRole } from '@/lib/auth/get-role';

/**
 * POST /api/cifo/ask → preguntarle a CIFO, en streaming.
 *
 * ── Esta ruta REEMPLAZA a `/api/cifo/chat` ──────────────────────────────────
 *
 * La vieja tenía 503 líneas y precargaba doce tablas en el prompt de CADA
 * pregunta: pagaba todo siempre, no podía bajar al detalle de nada, y tenía un
 * techo duro el día que los datos no entraran. Además apuntaba a un modelo
 * retirado del catálogo, así que fallaba en cada consulta desde hacía meses sin
 * que nadie se enterara.
 *
 * Esta usa el motor compartido (`packages/agente`) con HERRAMIENTAS: el modelo
 * pide lo que necesita y nada más. Es el mismo lazo que ya corre en la clínica.
 *
 * ── Las cuatro puertas, en orden ────────────────────────────────────────────
 *
 * Sesión → rol → configuración → forma de la pregunta. Se chequea acá y no solo
 * en la pantalla porque **una API es su propia puerta**: el middleware no cubre
 * `/api/cifo/*` y la pantalla no protege a nadie que sepa escribir un `fetch`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AskSchema = z.object({
  pregunta: z.string().min(3).max(500),
});

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  /**
   * Lista blanca de roles, NO la regla opt-out de la clínica.
   *
   * Allá CIFO contesta sobre citas y códigos de caso; acá contesta sobre
   * sueldos, bonos y pagos a freelancers. Ver `lib/cifo/acceso.ts`.
   */
  if (!(await puedePreguntarACifo())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'SIN_CONFIGURAR', mensaje: 'Falta OPENAI_API_KEY en el entorno del Admin.' },
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
  const rol = await getCurrentUserRole();

  /**
   * El alcance se recorta a dos campos ANTES de llegar al prompt. Nunca se pasa
   * el usuario completo — ver `lib/cifo/alcance.ts`.
   */
  const alcance = {
    nombre: (user.user_metadata?.full_name as string | undefined) ?? null,
    rol,
  };

  /**
   * NDJSON y no SSE: un objeto JSON por línea. Mismo formato que la clínica, así
   * que el lector del cliente es el mismo hook.
   */
  const encoder = new TextEncoder();
  let final: RespuestaAgente | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of preguntar(CIFO_ADMIN, alcance, input.pregunta, 'es')) {
          if (ev.type === 'done') final = ev.answer;
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
      } catch (err) {
        // El detalle del proveedor no va al cliente: puede traer trozos del prompt.
        console.error('[cifo-admin] falló la consulta', err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error' }) + '\n'));
      } finally {
        controller.close();

        /**
         * El registro se escribe al CERRAR: solo acá se sabe qué herramientas
         * corrieron y cuánto costó. Si la persona abandona a mitad, `final` queda
         * en null y igual queda constancia de que preguntó.
         *
         * Y se guarda la pregunta ENTERA. Acá el alcance es la plata de la
         * empresa: quién preguntó qué sobre sueldos es exactamente lo que hay
         * que poder auditar después.
         */
        try {
          /**
           * Los nombres de columna son camelCase y salen de mirar la tabla, no
           * de suponer: la primera versión escribía `entity_type` / `user_id` a
           * la snake_case y el insert se habría ido al `catch` en silencio —
           * o sea, consultas sobre sueldos sin ninguna constancia.
           */
          await createAdminClient().from('audit_logs').insert({
            action: 'CIFO_ASK',
            entityType: 'users',
            entityId: user.id,
            actorUserId: user.id,
            actorRole: rol,
            metadata: {
              pregunta: input.pregunta,
              herramientas: final?.steps.map((s) => s.tool) ?? [],
              modelo: final?.model ?? null,
              tokens: final?.usage.total ?? 0,
              completa: !!final,
              ms: Date.now() - empezo,
            },
          });
        } catch (e) {
          console.error('[cifo-admin] no se pudo registrar la consulta:', e);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Sin esto algunos proxies juntan la respuesta y la sueltan al final —
      // que es justo lo que el streaming vino a evitar.
      'X-Accel-Buffering': 'no',
    },
  });
}

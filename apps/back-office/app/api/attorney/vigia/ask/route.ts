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
import { preguntarAVigia } from '@/lib/vigia/agent';
import { resolveActor } from '@/lib/actor';

// El lazo puede encadenar varias llamadas al modelo; el default de Vercel es corto.
export const maxDuration = 60;

const AskSchema = z.object({
  pregunta: z.string().min(3).max(500),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
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
  try {
    // El idioma sale de la sesión (cookie `locale`), no de la pregunta: el
    // agente tiene que hablar el mismo idioma que el resto de la pantalla.
    const res = await preguntarAVigia(lawyer, input.pregunta, await getLocale());

    /**
     * Auditoría: queda registrada la pregunta, las herramientas que corrió y lo
     * que consumió. La RESPUESTA no se guarda todavía —eso va a la tabla de
     * conversaciones cuando exista—; acá interesa el rastro de quién preguntó
     * qué y cuánto costó.
     */
    writeAuditLog(db, {
      ...(await resolveActor(req.headers)),
      action: 'VIGIA_ASK',
      entityType: 'lawyers',
      entityId: lawyer.id,
      metadata: {
        pregunta: input.pregunta,
        herramientas: res.steps.map((s) => s.tool),
        modelo: res.model,
        tokens: res.usage.total,
        ms: Date.now() - empezo,
      },
    }).catch(() => undefined);

    return NextResponse.json(res);
  } catch (err) {
    // El detalle del proveedor no va al cliente: puede traer trozos del prompt.
    console.error('[vigia] fallo la consulta', err);
    return NextResponse.json({ error: 'FALLO_LA_CONSULTA' }, { status: 502 });
  }
}

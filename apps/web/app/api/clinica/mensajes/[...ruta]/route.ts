/**
 * El puente del Admin hacia la mensajería de la clínica.
 *
 * Todo lo que el Admin pida bajo `/api/clinica/mensajes/...` se reenvía a
 * `/api/messages/...` del back-office, **desde el servidor**, con la sesión de
 * quien está usando el sistema.
 *
 * ── Por qué un proxy y no una copia de la lógica ───────────────────────────
 *
 * Porque los hilos, los destinatarios, los escritorios, los adjuntos, el push y
 * el historial ya existen y funcionan en un solo lugar. Una segunda
 * implementación se despega de la original en el primer cambio — ya lo sabemos,
 * está escrito en media docena de archivos de este repo. Acá el Admin pone la
 * pantalla; la clínica sigue siendo la dueña de las reglas.
 *
 * ── Por qué NO hace falta un token de servicio ─────────────────────────────
 *
 * Las dos apps se autentican contra el **mismo** proyecto de Supabase, así que
 * la cookie de sesión se llama igual en las dos (`sb-<ref>-auth-token`) y el
 * back-office la valida como si fuera suya. Se reenvía esa cookie y nada más.
 *
 * Eso importa por lo que EVITA: un token de servicio sería una credencial capaz
 * de actuar en nombre de cualquiera, y habría que cuidarla para siempre. Acá el
 * back-office resuelve a la misma persona que está logueada del otro lado, con
 * sus mismos permisos, y **no existe forma de pedir algo en nombre de otro**.
 * Es lo contrario del atajo que se cerró el 2026-09-13, donde la identidad
 * viajaba en un header y se le creía.
 *
 * ── Por qué del servidor y no del navegador ────────────────────────────────
 *
 * Si la página llamara directo a `clinic.lienmaster.net`, haría falta abrir
 * CORS entre dominios y la cookie tendría que viajar como `SameSite=None`. Yendo
 * por el servidor no hay nada de eso: para el navegador es una llamada a su
 * propio dominio.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A dónde se reenvía. Con un default real y no `localhost`: si la variable
 * falta, lo que se rompe es el desarrollo, no la producción.
 */
const CLINICA = (process.env.CLINIC_APP_URL ?? 'https://clinic.lienmaster.net').replace(/[/]+$/, '');

/** Métodos que la mensajería usa. Nada más pasa. */
const METODOS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Cabeceras que se copian de la respuesta.
 *
 * Deliberadamente NO se copia `set-cookie`: el back-office no tiene por qué
 * escribir cookies en el dominio del Admin, y dejarlo pasar sería darle a otro
 * host el control de la sesión de este.
 */
const CABECERAS_DE_VUELTA = ['content-type', 'cache-control'];

async function reenviar(req: NextRequest, ruta: string[]): Promise<NextResponse> {
  if (!METODOS.has(req.method)) {
    return NextResponse.json({ error: 'Metodo no permitido' }, { status: 405 });
  }

  /**
   * La sesión se verifica ACÁ ANTES de reenviar nada.
   *
   * El back-office la va a verificar igual —es su puerta y no se delega—, pero
   * sin este chequeo el proxy le mandaría a otro host todas las peticiones
   * anónimas que reciba, incluidas las de un escáner. Que el portero de la
   * clínica sepa decir que no, no es motivo para dejar pasar a cualquiera.
   */
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  /**
   * Solo la mensajería, y sin salirse de ahí.
   *
   * El prefijo es fijo en el código, así que esto no puede convertirse en un
   * proxy abierto a toda la API de la clínica. Y se rechaza cualquier segmento
   * que intente subir de nivel: `..` en una ruta reenviada es la forma clásica
   * de escaparse del prefijo.
   */
  if (ruta.length === 0 || ruta.some((s) => s === '..' || s.includes('/') || s.includes('\\'))) {
    return NextResponse.json({ error: 'Ruta no valida' }, { status: 400 });
  }

  const destino = `${CLINICA}/api/messages/${ruta.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  // Solo las cookies de la sesión. El resto de las cookies del Admin no son
  // asunto del back-office.
  const sesion = req.cookies
    .getAll()
    .filter((c) => c.name.startsWith('sb-'))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const cabeceras: Record<string, string> = { cookie: sesion };
  const tipo = req.headers.get('content-type');
  if (tipo) cabeceras['content-type'] = tipo;

  const cuerpo = req.method === 'GET' ? undefined : await req.text();

  let res: Response;
  try {
    res = await fetch(destino, {
      method: req.method,
      headers: cabeceras,
      body: cuerpo,
      // Un redirect a `/login` significa "esta sesión no sirve del otro lado".
      // Se devuelve como 401 en vez de seguirlo: el que llama espera datos, no
      // el HTML de una pantalla de ingreso.
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[clinica] no se pudo llegar a la mensajeria:', (e as Error).message);
    return NextResponse.json({ error: 'La clinica no responde' }, { status: 502 });
  }

  if (res.status >= 300 && res.status < 400) {
    return NextResponse.json({ error: 'Sesion no valida en la clinica' }, { status: 401 });
  }

  const salida = new NextResponse(res.body, { status: res.status });
  for (const h of CABECERAS_DE_VUELTA) {
    const v = res.headers.get(h);
    if (v) salida.headers.set(h, v);
  }
  return salida;
}

type Contexto = { params: Promise<{ ruta: string[] }> };

export async function GET(req: NextRequest, ctx: Contexto): Promise<NextResponse> {
  return reenviar(req, (await ctx.params).ruta);
}
export async function POST(req: NextRequest, ctx: Contexto): Promise<NextResponse> {
  return reenviar(req, (await ctx.params).ruta);
}
export async function PATCH(req: NextRequest, ctx: Contexto): Promise<NextResponse> {
  return reenviar(req, (await ctx.params).ruta);
}
export async function PUT(req: NextRequest, ctx: Contexto): Promise<NextResponse> {
  return reenviar(req, (await ctx.params).ruta);
}
export async function DELETE(req: NextRequest, ctx: Contexto): Promise<NextResponse> {
  return reenviar(req, (await ctx.params).ruta);
}

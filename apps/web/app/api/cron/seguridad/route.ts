import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { sendSecurityAlertEmail } from '@precision-medical/api';

/**
 * GET /api/cron/seguridad → mira los últimos minutos y avisa si algo huele mal.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El Centro de Seguridad lo ve todo, **pero solo si alguien lo abre**. Erick,
 * 2026-10-06: "nadie mira un tablero". Un ataque a las 3 de la mañana se
 * descubría a las 9, y una cuenta trabada a las 7:05 se descubría cuando la
 * persona llamaba por teléfono.
 *
 * Esto es lo que convierte la pantalla de informe en algo que protege cuando no
 * la estás mirando.
 *
 * ── Las tres reglas, y por qué son esas ────────────────────────────────────
 *
 * 1. **Una cuenta quedó trabada.** No es un ataque: es alguien que no puede
 *    trabajar. Es el aviso que más veces va a servir, porque el candado dura
 *    hasta la medianoche y hay un botón para levantarlo.
 * 2. **Una IP que SOLO falla.** Con 5 o más fallos y cero ingresos buenos en la
 *    ventana ya no es alguien que no se acuerda la contraseña.
 * 3. **Un ingreso desde un país nuevo.** Comparado contra TODO el historial de
 *    esa persona, no contra la ventana: el valor está justamente en que sea la
 *    primera vez.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 *
 * No bloquea nada solo. Medido el 2026-10-06: la IP de la clínica tiene 11
 * ingresos buenos y 4 fallidos — una regla automática la echaría y dejaría a
 * todo el personal afuera. Acá se avisa y decide una persona.
 *
 * ── `?simular=1` ──────────────────────────────────────────────────────────
 *
 * Calcula todo y **no escribe ni manda nada**: devuelve lo que habría avisado.
 * Existe porque la única forma de probarlo contra datos reales era llenarle la
 * campana y el correo a tres administradores. También contesta "¿qué habrías
 * avisado la semana pasada?" cuando uno duda de un umbral — con
 * `&minutos=10080` la ventana se abre a siete días.
 *
 * Pide el mismo secreto que la corrida de verdad: lo que devuelve es un mapa de
 * quién falló y desde dónde, que no es información para cualquiera.
 *
 * ── Por qué `SYSTEM` y no un tipo propio ───────────────────────────────────
 *
 * `NotificationType` es un enum de Postgres y no tiene un valor de seguridad.
 * Agregarlo es un `ALTER TYPE` que hay que correr a mano en el proyecto Admin,
 * y hoy no compra nada: el título ya dice qué es. Si alguna vez la campana
 * necesita filtrar por tipo, ahí se agrega.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cuánto mira hacia atrás. El cron corre cada 15 minutos y la ventana es de 20:
 * los 5 de más son para que no se escape nada entre corrida y corrida si una se
 * atrasa. El solapamiento produce repetidos, y de eso se encarga el silencio.
 */
const VENTANA_MIN = 20;

/**
 * No se vuelve a avisar lo mismo dentro de este rato.
 *
 * Sin esto, una IP que ataca durante dos horas manda ocho correos iguales, y al
 * tercero nadie los lee — que es la forma más común de que un sistema de avisos
 * deje de servir.
 */
const SILENCIO_MIN = 120;

/** Desde cuántos fallos sin un solo éxito se considera que no es un despiste. */
const FALLOS_PARA_AVISAR = 5;

/** Quién se entera. Mismo criterio que el cron de auditoría. */
const ROLES_AVISADOS = ['SUPER_ADMIN', 'ADMIN'];

/**
 * Cuánta historia de países hace falta para que "país nuevo" signifique algo.
 *
 * El 2026-10-07 esta regla avisó que Erick entró desde La Paz "por primera
 * vez". Entra desde ahí todos los días: lo nuevo no era el país, era el
 * REGISTRO del país, que arrancó el 2026-10-03. Con dos días de historia,
 * cualquier lugar parece nuevo.
 *
 * Dos semanas es el primer número con el que la frase es cierta: si en
 * catorce días alguien nunca entró desde ahí, que aparezca hoy sí es una
 * novedad. Antes de eso la regla se calla y lo dice en su respuesta
 * (`sinBase`), para que el silencio se pueda ver y no se confunda con que
 * no pasó nada.
 */
const DIAS_DE_BASE = 14;

const ZONA = 'America/Denver';

/** Postgres devuelve `timestamp` sin zona; sin la `Z` el servidor la lee mal. */
const utc = (v: string): string => (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`);

const hora = (iso: string): string =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(utc(iso)));

interface Aviso {
  /** Identifica el aviso para el silencio: misma clave = no se repite. */
  clave: string;
  titulo: string;
  linea: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Sin el secreto cualquiera dispara correos a los administradores.
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const simular = params.get('simular') === '1';
  const minutos = Number(params.get('minutos')) || VENTANA_MIN;

  const admin = createAdminClient();
  const desde = new Date(Date.now() - minutos * 60_000).toISOString();

  const { data: regs, error } = await admin
    .from('audit_logs')
    .select('action, createdAt, ipAddress, metadata, actorUserId')
    .in('action', ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED'])
    .gte('createdAt', desde)
    .limit(500);

  if (error) {
    console.error('[cron seguridad] no se pudo leer el registro:', error.message);
    return NextResponse.json({ error: 'LECTURA' }, { status: 500 });
  }

  const eventos = regs ?? [];
  if (eventos.length === 0) return NextResponse.json({ eventos: 0, avisos: 0 });

  // ── Los correos de quienes aparecen, para poder nombrarlos ────────────────
  const ids = [...new Set(eventos.map((e) => e.actorUserId as string).filter(Boolean))];
  const { data: gente } = ids.length
    ? await admin.from('users').select('id, email').in('id', ids)
    : { data: [] };
  const correoDe = new Map((gente ?? []).map((u) => [u.id as string, u.email as string]));

  const avisos: Aviso[] = [];

  /* ── 1. cuentas trabadas ─────────────────────────────────────────────── */
  for (const e of eventos.filter((x) => x.action === 'ACCOUNT_LOCKED')) {
    const quien = correoDe.get(e.actorUserId as string) ?? 'una cuenta';
    avisos.push({
      clave: `trabada:${e.actorUserId}`,
      titulo: 'Una cuenta quedó trabada',
      linea: `${quien} quedó trabada a las ${hora(e.createdAt as string)} tras 3 contraseñas erradas. `
           + 'Se abre sola a la medianoche, o con el botón Desbloquear del Centro de Seguridad.',
    });
  }

  /* ── 2. IPs que solo fallan ──────────────────────────────────────────── */
  const porIp = new Map<string, { fallos: number; exitos: number; pais: string | null; ciudad: string | null }>();
  for (const e of eventos) {
    const ip = (e.ipAddress as string | null) ?? null;
    if (!ip) continue;
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    const x = porIp.get(ip) ?? { fallos: 0, exitos: 0, pais: null, ciudad: null };
    if (e.action === 'LOGIN_FAILED') x.fallos++;
    if (e.action === 'LOGIN_SUCCESS') x.exitos++;
    x.pais ??= (m.pais as string) ?? null;
    x.ciudad ??= (m.ciudad as string) ?? null;
    porIp.set(ip, x);
  }
  for (const [ip, x] of porIp) {
    if (x.fallos < FALLOS_PARA_AVISAR || x.exitos > 0) continue;
    const donde = [x.ciudad, x.pais].filter(Boolean).join(', ');
    avisos.push({
      clave: `ip:${ip}`,
      titulo: 'Una dirección está probando contraseñas',
      linea: `${ip}${donde ? ` (${donde})` : ''} lleva ${x.fallos} ${x.fallos === 1 ? 'intento fallido' : 'intentos fallidos'} y ningún ingreso `
           + `en los últimos ${minutos} minutos. Se puede bloquear desde el Centro de Seguridad.`,
    });
  }

  /* ── 3. ingresos desde un país nuevo ─────────────────────────────────── */
  //
  // Se compara contra el historial COMPLETO de esa persona, no contra la
  // ventana: lo que importa es que sea la primera vez, y en 20 minutos todo
  // parece la primera vez.
  //
  // ⚠️ Y hace falta una BASE. El país solo se registra desde el 2026-10-05
  // 15:42; antes de eso las filas no lo traen. Sin exigir que la persona tenga
  // algún ingreso con país ANTES de la ventana, "país nuevo" significa "primera
  // fila con país de esta persona" y avisa por todos. Medido el 2026-10-06
  // sobre 7 días: 33 avisos de 69 eventos, casi uno por ingreso.
  /** Cuántos se callaron por no tener historia suficiente. Viaja en la respuesta. */
  let sinBase = 0;

  for (const e of eventos.filter((x) => x.action === 'LOGIN_SUCCESS')) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    const pais = (m.pais as string) ?? null;
    const quienId = e.actorUserId as string;
    if (!pais || !quienId) continue;

    /*
     * ¿Sabemos de dónde entra esta persona habitualmente?
     *
     * No alcanza con que exista UN ingreso con país: hace falta que la
     * historia sea vieja. Se pide el más antiguo y se mira su fecha — con
     * menos de `DIAS_DE_BASE` no hay con qué comparar y la regla se calla.
     * Es lo que faltaba el 2026-10-07, cuando avisó que alguien entró "por
     * primera vez" desde el país del que entra todos los días.
     */
    const { data: base } = await admin
      .from('audit_logs')
      .select('createdAt')
      .eq('actorUserId', quienId)
      .eq('action', 'LOGIN_SUCCESS')
      .not('metadata->>pais', 'is', null)
      .order('createdAt', { ascending: true })
      .limit(1);

    const desdeCuando = base?.[0]?.createdAt as string | undefined;
    if (desdeCuando === undefined) { sinBase += 1; continue; }

    const diasDeBase = (Date.now() - new Date(desdeCuando).getTime()) / 86_400_000;
    if (diasDeBase < DIAS_DE_BASE) { sinBase += 1; continue; }

    const { data: antes } = await admin
      .from('audit_logs')
      .select('id')
      .eq('actorUserId', quienId)
      .eq('action', 'LOGIN_SUCCESS')
      .eq('metadata->>pais', pais)
      .lt('createdAt', desde)
      .limit(1);

    if (antes && antes.length > 0) continue;   // ya había entrado desde ahí

    avisos.push({
      clave: `pais:${quienId}:${pais}`,
      titulo: 'Un ingreso desde un país nuevo',
      linea: `${correoDe.get(quienId) ?? 'Alguien'} entró desde ${[m.ciudad, pais].filter(Boolean).join(', ')} `
           + `a las ${hora(e.createdAt as string)}, y es la primera vez que entra desde ese país.`,
    });
  }

  /*
   * Un aviso por clave dentro del MISMO lote.
   *
   * El silencio de más abajo mira lo ya enviado, no lo repetido acá: sin esto,
   * la misma persona entrando cuatro veces desde el mismo país genera cuatro
   * avisos idénticos en una sola corrida. Lo mostró la simulación.
   */
  const unicos = [...new Map(avisos.map((a) => [a.clave, a])).values()];

  if (unicos.length === 0) return NextResponse.json({ eventos: eventos.length, avisos: 0, simular });

  /*
   * En simulación se corta ACÁ, antes del silencio y antes de escribir nada.
   * El silencio depende de lo ya avisado, y una simulación no debería cambiar
   * de respuesta según cuántas veces la hayan corrido.
   */
  if (simular) {
    return NextResponse.json({
      simular: true,
      eventos: eventos.length,
      avisos: unicos.length,
      repetidosEnElLote: avisos.length - unicos.length,
      detalle: unicos.map((a) => ({ titulo: a.titulo, linea: a.linea })),
    });
  }

  /* ── el silencio: no repetir lo mismo ────────────────────────────────── */
  //
  // La clave del aviso viaja escondida al final del cuerpo. Es feo pero no
  // pide una tabla nueva, y el cuerpo ya se guarda entero: la alternativa era
  // otra migración a mano en el proyecto Admin por un dato de control.
  const marca = (clave: string): string => `​${clave}`;
  const silencioDesde = new Date(Date.now() - SILENCIO_MIN * 60_000).toISOString();
  const { data: recientes } = await admin
    .from('notifications')
    .select('body')
    .gte('createdAt', silencioDesde)
    .limit(500);
  const yaAvisado = new Set(
    (recientes ?? [])
      .map((n) => String(n.body ?? '').split('​')[1])
      .filter(Boolean),
  );

  const nuevos = unicos.filter((a) => !yaAvisado.has(a.clave));
  if (nuevos.length === 0) {
    return NextResponse.json({ eventos: eventos.length, avisos: 0, callados: unicos.length, sinBase });
  }

  /* ── a quién ─────────────────────────────────────────────────────────── */
  const { data: admins } = await admin
    .from('users')
    .select('id, email')
    .in('role', ROLES_AVISADOS)
    .is('deletedAt', null);

  const destinatarios = admins ?? [];
  if (destinatarios.length === 0) {
    return NextResponse.json({ eventos: eventos.length, avisos: 0, motivo: 'sin admins' });
  }

  /* ── la campana ──────────────────────────────────────────────────────── */
  const filas = destinatarios.flatMap((u) =>
    nuevos.map((a) => ({
      id: crypto.randomUUID(),
      userId: u.id as string,
      type: 'SYSTEM' as const,
      title: a.titulo,
      body: a.linea + marca(a.clave),
      linkUrl: '/dashboard/seguridad',
      createdAt: new Date().toISOString(),
    })),
  );
  const { error: errIns } = await admin.from('notifications').insert(filas);
  if (errIns) console.error('[cron seguridad] no se pudo escribir la campana:', errIns.message);

  /* ── el correo ───────────────────────────────────────────────────────── */
  //
  // Un solo correo con todo, no uno por hallazgo: tres correos a la vez se leen
  // como ruido y se archivan juntos.
  //
  // Si falla el envío NO se devuelve error: la campana ya quedó escrita, que es
  // el registro que importa, y un 500 haría que Vercel marque el cron como roto
  // cada vez que Resend tiene un mal día.
  let enviados = 0;
  const titulo = nuevos.length === 1
    ? nuevos[0]!.titulo
    : `${nuevos.length} avisos de seguridad`;

  for (const u of destinatarios) {
    const correo = u.email as string | null;
    if (!correo) continue;
    try {
      await sendSecurityAlertEmail({ to: correo, titulo, lineas: nuevos.map((a) => a.linea) });
      enviados++;
    } catch (err) {
      console.error('[cron seguridad] no se pudo mandar el correo a', correo, err);
    }
  }

  return NextResponse.json({
    eventos: eventos.length,
    avisos: nuevos.length,
    callados: unicos.length - nuevos.length,
    campana: filas.length,
    correos: enviados,
  });
}

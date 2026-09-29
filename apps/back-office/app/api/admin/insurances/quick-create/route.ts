/**
 * POST /api/admin/insurances/quick-create — dar de alta una aseguradora DESDE el alta de ajustador.
 *
 * ── Por qué existe una ruta aparte ──────────────────────────────────────────
 *
 * `/api/admin/insurances` es el catálogo de aseguradoras: crear, editar, borrar,
 * el canal de HCFA, la dirección de reclamos. Lo gobierna `settings`, y está
 * bien que Edson no lo tenga. Pero el panel de ajustador SÍ necesita crear una:
 * un ajustador cuelga obligatoriamente de una aseguradora
 * (`insuranceCarrier` es requerido, con unique por carrier+nombre), así que sin
 * ella no se puede dar de alta a la persona.
 *
 * Erick lo reportó el 2026-09-29: Edson quiso agregar a alguien de "Travelers
 * Insurance" y la pantalla lo frenó con "Pick the carrier from the list". Y
 * Travelers de verdad no estaba — lo único parecido en las 237 aseguradoras
 * vivas era `E2E3 Travelers Indemnity`, una fila de prueba.
 *
 * Es el MISMO problema que tuvieron los bufetes el 2026-09-15 y se resuelve
 * igual: crear mientras trabajo ≠ administrar el catálogo. Reusar la ruta de
 * `settings` le habría dado a Edson un FORBIDDEN en el último clic, después de
 * teclear todo — que es exactamente lo que pasó entonces con 17 de 28 cuentas.
 *
 * ⚠️ El middleware la deja pasar POR SEPARADO, y son TRES líneas que van juntas:
 * la nueva con `edson`, y los dos `(?!\/quick-create$)` sobre las reglas de
 * `settings` y `settings:aseguradoras`. `apiGuardModules` junta TODAS las reglas
 * que matchean y bloquea si alguna está apagada, así que sin las dos exclusiones
 * el 403 vuelve igual aunque la regla nueva exista.
 *
 * ── Lo que esta ruta NO puede hacer ─────────────────────────────────────────
 *
 * Solo CREAR. No edita, no borra, no toca el canal de HCFA ni la dirección de
 * reclamos — eso sigue siendo del catálogo. Y pide un solo dato, el NOMBRE: el
 * resto son valores por defecto, porque quien está agendando no tiene a mano el
 * código de color ni el canal de facturación de la aseguradora.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const AltaRapidaSchema = z.object({
  name: z.string().trim().min(2).max(200),
  /**
   * Crear aunque haya nombres parecidos.
   *
   * Sin esto la ruta frena y devuelve los parecidos, para que la pantalla pueda
   * preguntar "¿quisiste decir X?". Con esto, el usuario ya respondió que no.
   */
  confirmarParecido: z.boolean().optional(),
});

/**
 * Palabras que NO distinguen a una aseguradora de otra.
 *
 * Fija: son las que aparecen en el nombre comercial de cualquiera.
 */
const GENERICAS = new Set([
  'insurance', 'ins', 'insurances', 'company', 'co', 'corp', 'inc', 'llc', 'group',
  'indemnity', 'casualty', 'mutual', 'assurance', 'underwriters', 'services',
  'the', 'of', 'and', 'auto', 'automobile', 'general', 'health', 'life',
]);

/** Palabras significativas del nombre, sin acentos ni puntuación. */
function palabras(s: string): Set<string> {
  return new Set(
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 3 && !GENERICAS.has(w) && !/^\d+$/.test(w)),
  );
}

/**
 * Código corto para el avatar: las iniciales de las dos primeras palabras, o
 * las primeras letras si es una sola. Máximo 4, que es lo que el avatar dibuja.
 *
 * NO es único en la base (a propósito: es decorativo), así que no hace falta
 * resolver choques.
 */
function codigoCorto(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(p => /[a-z0-9]/i.test(p));
  if (palabras.length >= 2) {
    return (palabras[0]![0]! + palabras[1]![0]!).toUpperCase().slice(0, 4);
  }
  return (palabras[0] ?? nombre).slice(0, 2).toUpperCase() || 'XX';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = AltaRapidaSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const nombre = parsed.name.trim();

  /*
   * Exacto: `name` es @unique en la base, así que esto además evita que el
   * `create` reviente con un P2002 que el cliente no sabría redactar.
   *
   * Se devuelve el id para que la pantalla pueda USAR la que ya existe en vez
   * de dejar al usuario en un callejón.
   */
  const exacta = await db.insuranceCarrier.findFirst({
    where: { name: { equals: nombre, mode: 'insensitive' } },
    select: { id: true, name: true, deletedAt: true },
  });
  if (exacta && !exacta.deletedAt) {
    return NextResponse.json(
      { error: 'DUPLICATE_NAME', params: { name: exacta.name }, carrierId: exacta.id },
      { status: 409 },
    );
  }

  /*
   * Revivir la borrada, igual que hace el alta de ajustadores.
   *
   * `name` es único en TODA la tabla, borradas incluidas, así que sin esto un
   * nombre dado de baja bloquea el alta para siempre y sin explicación.
   */
  if (exacta?.deletedAt) {
    const revivida = await db.insuranceCarrier.update({
      where: { id: exacta.id },
      data:  { deletedAt: null, isActive: true },
    });
    await writeAuditLog(db, {
      actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
      action: 'RESTORE_INSURANCE_CARRIER', entityType: 'insurance_carriers', entityId: revivida.id,
      ipAddress: actor.ipAddress, userAgent: actor.userAgent,
      after: revivida as unknown as Prisma.JsonValue,
    });
    return NextResponse.json({ ok: true, carrier: revivida, restored: true }, { status: 201 });
  }

  /*
   * PARECIDOS: se frena y se pregunta, no se bloquea.
   *
   * El catálogo tiene 237 aseguradoras vivas y ya arrastra una fila de prueba
   * ("E2E3 Travelers Indemnity"). Si cualquiera puede sumar al vuelo, en tres
   * meses hay "Travelers", "Travelers Ins" y "Travelers Insurance" como tres
   * empresas distintas — que es el estado en el que están hoy los bufetes.
   *
   * La comparación es por CONTENCIÓN en los dos sentidos sobre el nombre
   * normalizado: "travelersinsurance" contiene a "travelers" y al revés. Es
   * tosca a propósito; alcanza para el caso real —la misma empresa escrita
   * distinto— sin inventar una distancia de edición que nadie va a poder
   * explicar cuando falle.
   */
  /*
   * PARECIDOS: se frena y se pregunta, no se bloquea.
   *
   * Si cualquiera puede sumar al vuelo, en tres meses el catalogo tiene
   * "Travelers", "Travelers Ins" y "Travelers Insurance" como tres empresas —
   * que es como estan hoy los bufetes.
   *
   * Se compara por PALABRA y no por la cadena entera. Lo probé contra las 237
   * aseguradoras reales y la comparacion de cadena fallaba justo en el caso que
   * origino esto: "Travelers Insurance" no se parecia a "E2E3 Travelers
   * Indemnity" porque ninguna contiene a la otra. Por palabra, comparten
   * "travelers" y salta.
   *
   * Y la palabra tiene que ser DISTINTIVA: se descartan las que aparecen en mas
   * de MAX_FRECUENCIA aseguradoras del propio catalogo. Medido: sin ese filtro
   * quedaban afuera cosas como blue (38 aseguradoras), cross (31), select (23) y
   * shield (21), y el aviso saltaba tanto que se volvia un clic automatico. La
   * lista de palabras vacias sale del DATO, no de lo que a mi me parezca comun.
   */
  if (!parsed.confirmarParecido) {
    const buscadas = palabras(nombre);
    if (buscadas.size > 0) {
      const vivas = await db.insuranceCarrier.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });
      const indice = vivas.map(c => ({ ...c, p: palabras(c.name) }));

      const frecuencia = new Map<string, number>();
      for (const c of indice) for (const w of c.p) frecuencia.set(w, (frecuencia.get(w) ?? 0) + 1);
      const MAX_FRECUENCIA = 3;

      const distintivas = [...buscadas].filter(w => (frecuencia.get(w) ?? 0) <= MAX_FRECUENCIA);
      const parecidas = distintivas.length
        ? indice.filter(c => distintivas.some(w => c.p.has(w))).slice(0, 5)
        : [];

      if (parecidas.length > 0) {
        return NextResponse.json(
          {
            error: 'SIMILAR_CARRIER',
            params: { names: parecidas.map(c => c.name).join(' · ') },
            similares: parecidas.map(c => ({ id: c.id, name: c.name })),
          },
          { status: 409 },
        );
      }
    }
  }

  const created = await db.insuranceCarrier.create({
    data: {
      name:      nombre,
      shortCode: codigoCorto(nombre),
      /*
       * `OTHER` y no PIP: quien está agendando no sabe si esta póliza es PIP,
       * med-pay o salud, y adivinar mal es peor que dejarlo sin clasificar —
       * el tipo decide qué precio se cotiza. Se completa desde el catálogo.
       */
      type: 'OTHER',
      // `color` y `hcfaChannel` tienen default en el schema y no se tocan acá.
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
    action: 'QUICK_CREATE_INSURANCE_CARRIER',
    entityType: 'insurance_carriers',
    entityId: created.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
    metadata: { origen: 'panel de ajustador' } as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, carrier: created }, { status: 201 });
}

/**
 * Grilla de tracking de Edson — B.12
 *
 * GET /api/admin/edson/tracking?q=&clinicId=&providerId=&apptStatus=&pip=
 *                              &carrierId=&flag=&vista=&sort=&dir=&page=&size=
 *
 * Una fila = un caso MVA, mostrando SOLO su PRIMERA cita (Edson no necesita ver
 * las visitas siguientes). Incluye las citas pasadas: no-shows y canceladas son
 * justo las que persigue.
 *
 * `vista` parte el conjunto en tres y cada caso cae en una sola: 'seguimiento'
 * (el default, las primeras visitas MVA abiertas), 'repetidos' (el paciente ya
 * venía en tratamiento: esa "primera cita" es un control, no una admisión) y
 * 'archivados'. Ver VISITA_MVA_ANTERIOR más abajo.
 *
 * Va en SQL crudo y no en Prisma por dos razones concretas:
 *
 *  1. "La primera cita del caso" es un `JOIN LATERAL ... LIMIT 1`. Con el
 *     `include` de Prisma habría que traer todos los casos a memoria para poder
 *     ordenar y paginar por esa fecha, y son 1004 filas que solo crecen.
 *  2. La aseguradora y el date of loss caen a los del caso cuando la fila de
 *     `case_auto_insurances` no los tiene. Ese COALESCE tiene que pasar en la
 *     base para poder filtrar y ordenar por el valor efectivo, no por el crudo.
 *
 * Ver docs/plan-vista-edson.md
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, Prisma } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec, isCipher } from '@/lib/decrypt';

/** Columnas por las que se puede ordenar. Nunca se interpola input del usuario. */
const SORT_COLUMNS: Record<string, string> = {
  patient:     'p."lastName"',
  lossDate:    'loss_date',
  carrier:     'carrier_name',
  claim:       'cai."claimNum"',
  created:     'c."createdAt"',
};

/**
 * Zona de la clínica. El día calendario se calcula acá y no en UTC: una cita de
 * las 6 PM de Denver cae al día siguiente en UTC y se agruparía mal.
 */
const CLINIC_TZ = 'America/Denver';

/**
 * Orden por defecto: los días de más nuevo a más viejo, pero DENTRO de cada día
 * de la primera cita a la última.
 *
 * Es lo que pidió Edson y es como se lee una jornada: se empieza por la mañana.
 * Un `scheduledFor DESC` a secas ordenaba bien los días y al revés las horas.
 */
const SORT_BY_DAY = `
  (fa."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE '${CLINIC_TZ}')::date DESC,
  fa."scheduledFor" ASC
`;

/**
 * La visita MVA ANTERIOR del paciente, si la hay: la primera de las que ya
 * venían. Responde "¿esta es de verdad su primera visita MVA?" y, cuando no lo
 * es, dice desde cuándo y en qué caso — sin eso la pestaña sería una lista de
 * nombres sin motivo.
 *
 * La grilla toma la cita más vieja del CASO y la trata como primera visita. Eso
 * es falso cuando al mismo paciente se le abrió un segundo caso MVA: la cita más
 * vieja de ESE caso puede ser el control de la semana 4 de un tratamiento que ya
 * venía corriendo. Medido el 2026-09-17: 19 filas de 1.058, y en 10 de ellas la
 * recepción había escrito en la cita "MVA F/U 3 WEEKS" o parecido.
 *
 * Una cita cancelada o a la que el paciente no vino NO cuenta como tratamiento
 * previo: al que nunca llegó hay que perseguirlo igual. Hoy da lo mismo (19 con
 * y sin ese filtro), pero la regla tiene que decir lo que quiere decir.
 */
const VISITA_MVA_ANTERIOR = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT a2."scheduledFor", c2."id" AS case_id, c2."caseCode" AS case_code
    FROM appointments a2
    JOIN cases c2 ON c2."id" = a2."caseId"
    WHERE c2."patientId" = c."patientId"
      AND c2."id"        <> c."id"
      AND c2."caseType"  = 'MVA'
      AND c2."deletedAt" IS NULL
      AND a2."scheduledFor" < fa."scheduledFor"
      AND a2."status"::text NOT IN ('CANCELLED', 'NO_SHOW')
      /*
       * Y tiene que ser el MISMO ACCIDENTE.
       *
       * Sin esto, a un paciente que ya venia en tratamiento por un choque
       * viejo, un choque NUEVO le salia marcado como seguimiento y desaparecia
       * de la cola. Lo reporto la clinica dos veces: con Gattlin Rogers el
       * 2026-09-18 y con Karlee Sanchez el 22 — "that day was her new MVA".
       * Las dos veces tenian razon: un accidente nuevo ES una admision nueva,
       * aunque a la persona ya la conozcan.
       *
       * Se compara cases.accidentDate y NO el lossDate de la fila de
       * seguro, aunque esa sea la que usan las columnas de la grilla. El
       * lossDate y el numero de claim SE COPIAN al abrir un caso nuevo para el
       * mismo paciente, asi que comparar por ahi da "iguales" siempre. Esa
       * confusion exacta hizo que el 2026-09-17 fusionara 10 pares de casos que
       * eran accidentes distintos. Acá se compara el campo que una persona
       * ESCRIBE, no el que el sistema arrastra.
       *
       * Si a CUALQUIERA de los dos le falta la fecha, no hay con que afirmar
       * que es el mismo accidente y la fila se queda en la cola. El error de
       * mostrar una fila de mas se archiva de un clic; el de esconder un MVA
       * nuevo no se ve hasta que el paciente se pierde.
       */
      AND c2."accidentDate" IS NOT NULL
      AND c."accidentDate"  IS NOT NULL
      AND c2."accidentDate"::date = c."accidentDate"::date
    ORDER BY a2."scheduledFor" ASC
    LIMIT 1
  ) prev ON TRUE`;

/** Hay visita anterior ⇒ esta no es la primera. */
const YA_VENIA_EN_TRATAMIENTO = Prisma.sql`prev."scheduledFor" IS NOT NULL`;

const MAX_SIZE = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;

  const q          = (sp.get('q') ?? '').trim();
  const clinicId   = sp.get('clinicId')   ?? '';
  const providerId = sp.get('providerId') ?? '';
  const apptStatus = sp.get('apptStatus') ?? '';
  const pip        = sp.get('pip')        ?? '';
  const carrierId  = sp.get('carrierId')  ?? '';
  // 'noPip' | 'noAdjuster' | 'noClaim' | 'noAttorney' | 'completed' | 'pending'
  const flag       = sp.get('flag')       ?? '';
  /**
   * Horizonte: cuántos días hacia atrás se miran las PRIMERAS visitas.
   *
   * Sin esto la cola no tenía fondo. Medido el 2026-09-18: de las 1.047 filas
   * sin archivar, **solo 334 son de 2026** — 629 son de 2025, 82 de 2024 y 2 de
   * 2023. En los últimos 30 días hay 50. O sea que Edson buscaba su trabajo del
   * día dentro de una lista donde 19 de cada 20 filas no le tocaban, y de ahí
   * salía casi todo lo que venía reportando como "esta no es un MVA nuevo":
   * tenía razón siempre, pero el problema no era la clasificación de cada fila
   * sino la ANTIGÜEDAD de la lista entera.
   *
   * Por qué un filtro y no archivar en masa: de los 935 casos con más de 90
   * días, CERO tienen `completedAt`. No hay ningún dato que diga cuáles están
   * cerrados, así que archivarlos sería adivinar. Un filtro no toca nada y se
   * deshace solo.
   *
   * El default son 90 días y no 30 porque perseguir un PIP o un adjuster lleva
   * semanas: con 30 le escondería trabajo que sigue vivo.
   *
   * Va en `where` —junto a clínica y provider— y no en la vista, así los
   * contadores de las tres pestañas hablan del mismo recorte que la tabla.
   */
  const DIAS_VALIDOS = [30, 60, 90, 180];
  const diasParam = sp.get('dias') ?? '';
  const dias: number | null =
    diasParam === 'todo'                      ? null
    : DIAS_VALIDOS.includes(Number(diasParam)) ? Number(diasParam)
    : 90;
  /**
   * Tres vistas que PARTEN el conjunto, no que lo filtran: cada caso cae en una
   * sola y ninguno queda invisible.
   *
   *  'seguimiento' (default) — primeras visitas MVA sin archivar. Es la cola.
   *  'repetidos'             — el paciente YA venía en tratamiento MVA.
   *  'archivados'            — lo que Edson dio por cerrado.
   */
  const vistaParam = sp.get('vista') ?? '';
  const vista: 'seguimiento' | 'repetidos' | 'archivados' =
    vistaParam === 'repetidos' ? 'repetidos'
    : vistaParam === 'archivados' || sp.get('archived') === 'true' ? 'archivados'
    : 'seguimiento';
  const archived = vista === 'archivados';

  // `sort=appointment` (el default) usa el orden de dos niveles; el resto de las
  // columnas es un ORDER BY simple con su direccion.
  const sortParam = sp.get('sort') ?? '';
  const sortKey   = SORT_COLUMNS[sortParam] ?? null;
  const dir       = sp.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const orderBy   = sortKey ? `${sortKey} ${dir} NULLS LAST` : SORT_BY_DAY;
  const page    = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
  const size    = Math.min(MAX_SIZE, Math.max(1, parseInt(sp.get('size') ?? '25', 10) || 25));
  const offset  = (page - 1) * size;

  // Los filtros del usuario. La vista (archivado / primera visita) se suma
  // aparte, para poder contar las OTRAS pestañas con estos mismos filtros
  // puestos — que es el número que va en el tab.
  const where: Prisma.Sql[] = [
    Prisma.sql`c."deletedAt" IS NULL`,
    Prisma.sql`c."caseType" = 'MVA'`,
  ];

  if (q) {
    // El teléfono queda fuera de la búsqueda a propósito: viene cifrado en la
    // base (`e:…`) y un LIKE contra el cifrado nunca matchea. Se descifra al
    // salir, así que buscar por teléfono requeriría traer todo a memoria.
    const like = `%${q}%`;
    where.push(Prisma.sql`(
      p."firstName" ILIKE ${like} OR p."lastName" ILIKE ${like}
      OR c."caseCode" ILIKE ${like}
      OR lf."firmName" ILIKE ${like}
      OR at."firstName" ILIKE ${like} OR at."lastName" ILIKE ${like}
      OR cai."claimNum" ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM case_adjusters ca2
        LEFT JOIN insurance_adjusters ia2 ON ia2."id" = ca2."adjusterId"
        WHERE ca2."caseId" = c."id" AND ca2."removedAt" IS NULL
          AND (ia2."name" ILIKE ${like} OR ca2."name" ILIKE ${like})
      )
      OR cai."adjusterNameRaw" ILIKE ${like}
      OR ic."name" ILIKE ${like} OR cai."carrierNameRaw" ILIKE ${like}
    )`);
  }
  if (clinicId)   where.push(Prisma.sql`fa."clinicId" = ${clinicId}`);
  if (providerId) where.push(Prisma.sql`fa."providerId" = ${providerId}`);
  // Filtra por la cita MAS RECIENTE, igual que el color de la franja: si
  // filtrara por la primera, buscar "No show" devolveria filas que no se ven
  // como no-show y al reves.
  if (apptStatus) where.push(Prisma.sql`la."status"::text = ${apptStatus}`);
  if (pip)        where.push(Prisma.sql`COALESCE(cai."pipAvailable"::text, 'UNKNOWN') = ${pip}`);
  if (carrierId)  where.push(Prisma.sql`COALESCE(cai."carrierId", c."primaryInsuranceId") = ${carrierId}`);
  // `Prisma.raw` acá es seguro y es la única forma: un intervalo no se puede
  // parametrizar. El valor no sale del pedido sino de `DIAS_VALIDOS`, que son
  // cuatro enteros escritos arriba — lo mismo que ya se hace con `SORT_COLUMNS`.
  if (dias !== null) {
    where.push(Prisma.sql`fa."scheduledFor" >= NOW() - (${Prisma.raw(String(dias))} * INTERVAL '1 day')`);
  }

  if (flag === 'noPip')        where.push(Prisma.sql`COALESCE(cai."pipAvailable"::text, 'UNKNOWN') = 'UNKNOWN'`);
  if (flag === 'noAdjuster')   where.push(Prisma.sql`
    NOT EXISTS (SELECT 1 FROM case_adjusters ca WHERE ca."caseId" = c."id" AND ca."removedAt" IS NULL)
    AND (cai."adjusterNameRaw" IS NULL OR cai."adjusterNameRaw" = '')`);
  if (flag === 'noClaim')      where.push(Prisma.sql`cai."claimNum" IS NULL OR cai."claimNum" = ''`);
  if (flag === 'noAttorney')   where.push(Prisma.sql`c."attorneyId" IS NULL AND c."lawFirmId" IS NULL`);
  if (flag === 'completed')    where.push(Prisma.sql`ct."completedAt" IS NOT NULL`);
  if (flag === 'pending')      where.push(Prisma.sql`ct."completedAt" IS NULL`);

  const whereSql = Prisma.join(where, ' AND ');

  /**
   * Las tres vistas PARTEN el conjunto, no lo filtran: cada caso cae en una sola
   * y ninguno queda invisible. Archivar es lo único que saca una fila de la
   * cola; completar no.
   */
  const VISTAS = {
    seguimiento: Prisma.sql`ct."archivedAt" IS NULL AND NOT ${YA_VENIA_EN_TRATAMIENTO}`,
    repetidos:   Prisma.sql`ct."archivedAt" IS NULL AND ${YA_VENIA_EN_TRATAMIENTO}`,
    archivados:  Prisma.sql`ct."archivedAt" IS NOT NULL`,
  } as const;

  /**
   * `JOIN LATERAL` (no LEFT): un caso sin ninguna cita no es fila de esta
   * grilla. El Excel arranca en la cita, no en el caso.
   */
  const armarFrom = (vistaSql: Prisma.Sql) => Prisma.sql`
    FROM cases c
    /*
     * La PRIMERA visita del caso, y las canceladas van al final del orden.
     *
     * Antes era la cita mas vieja a secas, y cuando a alguien le MOVIAN la
     * primera visita la fila se quedaba viviendo en el dia de la cita anulada:
     * Edson la buscaba el 1-sep y el paciente venia el 4. Lo marco el en su
     * hoja ("her appointment was moved to Sep. 4"). Medido el 2026-09-17: 11
     * filas de 1.053 estaban en el dia equivocado, algunas por casi dos meses.
     *
     * El booleano ordena false primero, asi que una cancelada solo gana si NO
     * hay ninguna sin cancelar — y ahi tiene que ganar: el que anulo y no
     * volvio a reservar es justo a quien Edson persigue. Son 7 filas y se ven
     * tachadas.
     *
     * NO_SHOW no entra en esto. El que no vino SI tuvo su primera visita, y ese
     * dia es el dato.
     */
    JOIN LATERAL (
      SELECT a."id", a."scheduledFor", a."status", a."clinicId", a."providerId", a."createdByName"
      FROM appointments a
      WHERE a."caseId" = c."id"
      ORDER BY (a."status" = 'CANCELLED') ASC, a."scheduledFor" ASC
      LIMIT 1
    ) fa ON TRUE
    /*
     * La cita mas RECIENTE del caso. Las columnas de la fila siguen siendo las
     * de la PRIMERA —esta vista es el registro de primeras visitas— pero el
     * color y el tachado salen de esta: si el paciente no vino a la tercera
     * cita, eso es justo lo que Edson persigue y tiene que verlo de un vistazo.
     */
    JOIN LATERAL (
      SELECT a."status" FROM appointments a
      WHERE a."caseId" = c."id"
      ORDER BY a."scheduledFor" DESC
      LIMIT 1
    ) la ON TRUE
    JOIN patients p              ON p."id"  = c."patientId"
    LEFT JOIN clinics cl         ON cl."id" = fa."clinicId"
    LEFT JOIN providers pr       ON pr."id" = fa."providerId"
    LEFT JOIN lawyers lf         ON lf."id" = c."lawFirmId"
    LEFT JOIN lawyers at         ON at."id" = c."attorneyId"
    LEFT JOIN case_auto_insurances cai ON cai."caseId" = c."id"
    LEFT JOIN insurance_carriers ic    ON ic."id" = COALESCE(cai."carrierId", c."primaryInsuranceId")
    /*
     * TODOS los adjusters ACTIVOS del caso, en el orden en que se asignaron.
     * Antes salia del FK unico de case_auto_insurances, pero Edson pidio poder
     * anotar varios ("Kenneth Kelly or Patricia Leon"), asi que la asignacion
     * vive en case_adjusters.
     *
     * Dos cosas que esto arregla y hay que no volver a romper:
     *
     *  1. El JOIN a insurance_adjusters es LEFT. Era INNER, y como adjusterId es
     *     OPCIONAL —el adjuster se puede escribir a mano, sin ficha de catalogo—
     *     tiraba la fila entera. Medido el 2026-09-17: los 4 adjusters cargados
     *     en todo el sistema son a mano, o sea que la columna no mostro NUNCA a
     *     ninguno mientras el contador decia 1.
     *  2. Ya no es LIMIT 1. Si Edson anota dos, se ven los dos.
     *
     * El dato del catalogo gana campo por campo y lo escrito a mano es el
     * respaldo, que es lo que dice el schema de CaseAdjuster.
     *
     * OJO: nada de backticks en este comentario — vive dentro de un template
     * literal de Prisma.sql y lo cortarian a la mitad.
     */
    LEFT JOIN LATERAL (
      SELECT json_agg(
               json_build_object(
                 'name',  COALESCE(ia."name",      ca."name"),
                 'phone', COALESCE(ia."phone",     ca."phone"),
                 'ext',   COALESCE(ia."extension", ca."extension")
               ) ORDER BY ca."assignedAt" ASC
             ) AS lista
      FROM case_adjusters ca
      LEFT JOIN insurance_adjusters ia ON ia."id" = ca."adjusterId"
      WHERE ca."caseId" = c."id" AND ca."removedAt" IS NULL
    ) adj ON TRUE
    LEFT JOIN case_tracking ct         ON ct."caseId" = c."id"
    LEFT JOIN users cu                 ON cu."id" = c."createdByUserId"
    ${VISITA_MVA_ANTERIOR}
    WHERE ${whereSql} AND ${vistaSql}
  `;

  const from = armarFrom(VISTAS[vista]);

  const rowsQuery = Prisma.sql`
    SELECT
      c."id"            AS case_id,
      c."caseCode"      AS case_code,
      c."caseType"::text AS case_type,
      c."accidentDate"  AS case_accident_date,
      p."id"            AS patient_id,
      p."firstName"     AS patient_first,
      p."lastName"      AS patient_last,
      p."dateOfBirth"   AS patient_dob,
      p."phone"         AS patient_phone,
      -- El celular. Sin esto la columna de Tracking mostraba sin telefono a
      -- 1.048 pacientes con caso abierto que SI lo tienen, solo que cargado en
      -- el segundo campo (medido 2026-09-15). Ver lib/telefono-paciente.
      -- OJO: esto es un template literal de JS. Nada de backticks aca adentro,
      -- que cierran la cadena y rompen el archivo entero.
      p."phone2"        AS patient_phone2,

      fa."id"           AS appt_id,
      fa."scheduledFor" AS appt_at,
      fa."status"::text AS appt_status,
      la."status"::text AS latest_status,
      cl."name"         AS clinic_name,
      cl."color"        AS clinic_color,
      fa."createdByName" AS created_by,
      CASE WHEN pr."id" IS NULL THEN NULL
           ELSE TRIM(CONCAT(pr."firstName", ' ', pr."lastName")) END AS provider_name,

      c."lawFirmId"     AS law_firm_id,
      c."attorneyId"    AS attorney_id,
      lf."firmName"     AS firm_name,
      -- El del catalogo manda; el escrito a mano es el respaldo. Al elegir del
      -- catalogo el PATCH borra el texto libre, asi que nunca conviven.
      COALESCE(
        CASE WHEN at."id" IS NULL THEN NULL
             ELSE TRIM(CONCAT(COALESCE(at."firstName", ''), ' ', COALESCE(at."lastName", ''))) END,
        c."attorneyNameRaw"
      ) AS attorney_name,
      at."email"        AS attorney_email,

      -- Quien dio de alta el CASO. Ojo: solo lo tienen los casos creados en v3.
      -- Los migrados del v2 no traen autor, asi que hoy la mayoria sale vacia —
      -- es un hueco de DATOS, no de la consulta.
      NULLIF(TRIM(CONCAT(COALESCE(cu."firstName", ''), ' ', COALESCE(cu."lastName", ''))), '')
        AS case_created_by,

      -- La correccion de Edson gana sobre la respuesta del paciente, PERO no la
      -- pisa: el formulario firmado sigue diciendo lo suyo en consentsData.
      -- (Sin comillas invertidas: adentro de un Prisma.sql cierran el template.)
      COALESCE(
        ct."chiroReferral",
        NULLIF(c."consentsData" ->> 'chiropractor', '')
      ) AS chiropractor,

      -- Valor efectivo: la fila del seguro gana, el caso es el respaldo.
      COALESCE(ic."name", cai."carrierNameRaw")   AS carrier_name,
      COALESCE(cai."lossDate", c."accidentDate")  AS loss_date,
      cai."claimNum"                              AS claim_num,
      cai."comments"                              AS ins_comments,
      COALESCE(cai."pipAvailable"::text, 'UNKNOWN') AS pip,

      /*
       * La lista que pinta la columna. Los asignados mandan; el texto viejo de
       * case_auto_insurances entra como un adjuster mas SOLO si no hay ninguno
       * asignado, para que los 131 casos migrados se sigan viendo y se vean
       * IGUAL que los cargados a mano. Una sola forma en pantalla.
       */
      COALESCE(
        adj.lista,
        CASE WHEN COALESCE(cai."adjusterNameRaw", cai."adjusterPhoneRaw") IS NOT NULL
             THEN json_build_array(json_build_object(
                    'name',  cai."adjusterNameRaw",
                    'phone', cai."adjusterPhoneRaw",
                    'ext',   NULL))
        END
      ) AS adjusters,
      (SELECT COUNT(*)::int FROM case_adjusters ca
        WHERE ca."caseId" = c."id" AND ca."removedAt" IS NULL) AS adjuster_count,

      ct."completedAt"  AS completed_at,
      ct."archivedAt"   AS archived_at,
      (SELECT n."body"      FROM case_tracking_notes n WHERE n."caseId" = c."id" ORDER BY n."createdAt" DESC LIMIT 1) AS last_note,
      (SELECT n."createdAt" FROM case_tracking_notes n WHERE n."caseId" = c."id" ORDER BY n."createdAt" DESC LIMIT 1) AS last_note_at,
      (SELECT COUNT(*)::int FROM case_tracking_notes n WHERE n."caseId" = c."id") AS note_count,
      (SELECT COUNT(*)::int FROM case_managers cm
        WHERE cm."caseId" = c."id" AND cm."removedAt" IS NULL) AS manager_count,

      -- El tratamiento MVA que el paciente YA venia haciendo. Solo trae algo en
      -- la pestania de repetidos, y es lo que ahi explica cada fila.
      prev."scheduledFor" AS prev_visit_at,
      prev.case_id        AS prev_case_id,
      prev.case_code      AS prev_case_code
    ${from}
    ORDER BY ${Prisma.raw(orderBy)}, c."id" ASC
    LIMIT ${size} OFFSET ${offset}
  `;

  /**
   * Los números de las tres pestañas, con los MISMOS filtros puestos: si el tab
   * dice 19 y al entrar hay 19, el número se puede creer.
   *
   * Los tres salen de UN solo recorrido con `FILTER`. Tres COUNT separados
   * rehacían el join tres veces y medían 1,9 s contra la base real, el doble de
   * lo que tarda la página entera.
   *
   * No hay `countQuery` aparte porque `statsQuery` ya devuelve el total de la
   * vista actual sobre el mismo FROM: era la misma consulta dos veces.
   */
  const tabsQuery = Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE ct."archivedAt" IS NULL AND NOT ${YA_VENIA_EN_TRATAMIENTO})::int AS seguimiento,
      COUNT(*) FILTER (WHERE ct."archivedAt" IS NULL AND ${YA_VENIA_EN_TRATAMIENTO})::int     AS repetidos,
      COUNT(*) FILTER (WHERE ct."archivedAt" IS NOT NULL)::int                                AS archivados
    ${armarFrom(Prisma.sql`TRUE`)}
  `;

  // Los tiles resumen TODO el conjunto filtrado, no solo la página visible —
  // si contaran la página, "38 sin PIP" cambiaría al pasar de página.
  const statsQuery = Prisma.sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(cai."pipAvailable"::text, 'UNKNOWN') = 'UNKNOWN')::int AS no_pip,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM case_adjusters ca WHERE ca."caseId" = c."id" AND ca."removedAt" IS NULL
      ) AND (cai."adjusterNameRaw" IS NULL OR cai."adjusterNameRaw" = ''))::int AS no_adjuster,
      COUNT(*) FILTER (WHERE ct."completedAt" IS NOT NULL)::int AS completed,
      COUNT(*) FILTER (WHERE ct."completedAt" IS NOT NULL AND fa."scheduledFor" < NOW())::int AS archivable
    ${from}
  `;

  type Row = Record<string, unknown>;
  type Tabs = { seguimiento: number; repetidos: number; archivados: number };
  /** Un adjuster tal como lo pinta la columna: nombre arriba, teléfono abajo. */
  type Adjuster = { name: string | null; phone: string | null; ext: string | null };
  const [rows, statsRes, tabsRes] = await Promise.all([
    db.$queryRaw<Row[]>(rowsQuery),
    db.$queryRaw<Row[]>(statsQuery),
    db.$queryRaw<Tabs[]>(tabsQuery),
  ]);

  const total = Number(statsRes[0]?.total ?? 0);

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      caseId:   r.case_id,
      // Algunos casos migrados del v2 guardaron el código cifrado; nunca se
      // devuelve el `e:…` crudo.
      caseCode: isCipher(r.case_code as string) ? dec(r.case_code as string) : r.case_code,
      /*
       * Hoy siempre vale 'MVA' porque la vista filtra por eso. Viaja igual
       * porque la celda de Tipo lo necesita para mostrar el valor actual, y
       * porque el dia que la vista deje de estar clavada a MVA el dato ya esta.
       */
      caseType: r.case_type,
      patient: {
        id:        r.patient_id,
        firstName: r.patient_first,
        lastName:  r.patient_last,
        dateOfBirth: r.patient_dob,
        phone:     dec(r.patient_phone as string | null),
        phone2:    dec(r.patient_phone2 as string | null),
      },
      appointment: {
        id:          r.appt_id,
        scheduledFor: r.appt_at,
        status:      r.appt_status,
        latestStatus: r.latest_status,
        clinicName:  r.clinic_name,
        clinicColor: r.clinic_color,
        createdBy:   r.created_by,
        providerName: r.provider_name,
      },
      lawFirmId:     r.law_firm_id,
      attorneyId:    r.attorney_id,
      firmName:      r.firm_name,
      attorneyName:  (r.attorney_name as string | null)?.trim() || null,
      attorneyEmail: r.attorney_email,
      chiropractor:  r.chiropractor,
      caseCreatedBy: r.case_created_by,
      carrierName:   r.carrier_name,
      lossDate:      r.loss_date,
      claimNum:      r.claim_num,
      insComments:   r.ins_comments,
      pipAvailable:  r.pip,
      adjusters:     (r.adjusters ?? []) as Adjuster[],
      completedAt:   r.completed_at,
      archivedAt:    r.archived_at,
      lastNote:      r.last_note,
      lastNoteAt:    r.last_note_at,
      noteCount:     r.note_count,
      managerCount:  r.manager_count,
      adjusterCount: r.adjuster_count,
      // Por qué esta fila no es una primera visita. Null en la cola normal.
      prevVisitAt:   r.prev_visit_at,
      prevCaseId:    r.prev_case_id,
      prevCaseCode:  isCipher(r.prev_case_code as string) ? dec(r.prev_case_code as string) : r.prev_case_code,
    })),
    stats: statsRes[0] ?? { total: 0, no_pip: 0, no_adjuster: 0, completed: 0, archivable: 0 },
    tabs:  tabsRes[0]  ?? { seguimiento: 0, repetidos: 0, archivados: 0 },
    vista,
    page,
    size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
  });
}

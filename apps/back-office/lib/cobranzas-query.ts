import { db, Prisma } from '@precision-medical/database';

/**
 * La cola de COBRANZAS — todos los pacientes con su plata, no solo los que deben.
 *
 * ## Por qué es SQL crudo y no Prisma
 *
 * El orden que pidió Erick es "primero los que deben, y dentro de cada grupo
 * alfabético". Esa primera clave es un agregado sobre `appointment_billing`, y
 * Prisma no ordena por un agregado de una relación: habría que traerse los
 * 5.738 pacientes al proceso y ordenarlos en memoria en cada página.
 *
 * ## El join que importa
 *
 * El cargo se ata al caso por `caseId`, pero hay uno —medido: exactamente uno,
 * de $10— que lo tiene en NULL y solo llega por su cita. La pantalla del caso
 * ya lo contempla (`OR: [{caseId}, {appointment: {caseId}}]`), así que acá va
 * el mismo COALESCE. Sin eso el total del paciente no coincidiría con el de su
 * propio caso, que es de donde nacen los reclamos de "los números no dan".
 *
 * ## Cuatro números, no tres
 *
 *     total − pagado − descontado = deuda
 *
 * Hace falta una cuarta columna porque desde hoy se puede perdonar plata al
 * cobrar (`billing_payments.discount`), y sin ella la resta no cierra y la
 * tabla se lee como rota.
 *
 * ⚠️ `descontado` se DESPEJA de los otros tres (`total − pagado − deuda`), no
 * se suma de las columnas de descuento. Es a propósito.
 *
 * Sumando `appointment_billing.discount + billing_payments.discount` daba
 * **$4.228,59 de menos** contra la deuda real. El motivo, medido: **15 cargos
 * —todos migrados, en 10 casos— tienen `balanceDue = 0` con `totalCost −
 * discount − amountPaid > 0`**. Son 15 de los 16 que usan la columna de
 * descuento del cargo: el v2 cerró esas cuentas perdonando MÁS de lo que dejó
 * anotado, y la migración trajo el saldo en cero tal como estaba.
 *
 * Despejándolo, la columna dice lo que de verdad significa —"lo que no se
 * cobró ni se va a cobrar"— y para todo cargo sano da exactamente la suma de
 * los dos descuentos. La diferencia queda explicada en vez de aparecer como un
 * agujero de $4.228 que nadie puede justificar.
 *
 * `amountPaid` sí está sano: **cero** filas difieren de la suma de sus pagos
 * vigentes en toda la base.
 *
 * ## Qué NO cuenta
 *
 * Los casos borrados (`cases.deletedAt`). Los pagos anulados tampoco:
 * `amountPaid` y `balanceDue` ya los excluyen —los recalcula
 * `lib/saldo-del-cargo.ts`— y `descontado` los filtra por `status`.
 */

export interface FilaCobranza {
  patientId: string;
  patientCode: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  /** Costo facturado de TODOS sus casos. */
  total: number;
  /** Lo que entró de verdad. No incluye lo perdonado. */
  pagado: number;
  /** Lo que no se cobró ni se va a cobrar. Despejado — ver el docblock. */
  descontado: number;
  deuda: number;
  /** Cuántos casos suyos tienen saldo — decide si el cobro tiene que elegir. */
  casosConDeuda: number;
  /**
   * El caso a cobrar cuando hay UNO SOLO con saldo — el 95% de los que deben
   * (2.193 de 2.300, medido). Evita un viaje al servidor para abrir el modal.
   *
   * ⚠️ Solo es válido con `casosConDeuda === 1`. Con más, el valor es
   * arbitrario (`MIN` sobre un cuid) y el cobro tiene que preguntar contra cuál
   * caso va: mezclar dos casos en un pago rompe la regla de los circuitos.
   */
  unicoCaseId: string | null;
  /**
   * Quién paga, cuando se sabe: el bufete de los casos con saldo.
   *
   * Importa más que el nombre del paciente. Medido el 2026-09-16: de los
   * $1.377.546 de deuda, **$1.377.371 son de terceros** (seguro o abogado) y
   * $164,81 del mostrador. El que cobra casi nunca llama al paciente.
   */
  bufetes: string | null;
}

export interface ResumenCobranzas {
  pacientes: number;
  conDeuda: number;
  total: number;
  pagado: number;
  descontado: number;
  deuda: number;
}

/**
 * El agregado por paciente. Va como CTE y no como vista porque lo usan dos
 * consultas —la página y el resumen— y tienen que dar exactamente lo mismo.
 */
const AGREGADO = Prisma.sql`
  plata AS (
    SELECT
      cs."patientId"                                             AS pid,
      SUM(ab."totalCost")                                        AS total,
      SUM(ab."amountPaid")                                       AS pagado,
      SUM(ab."balanceDue")                                       AS deuda,
      COUNT(DISTINCT cs.id) FILTER (WHERE ab."balanceDue" > 0)   AS casos_con_deuda,
      MIN(cs.id) FILTER (WHERE ab."balanceDue" > 0)              AS unico_case_id,
      STRING_AGG(DISTINCT lw."firmName", ' · ')
        FILTER (WHERE ab."balanceDue" > 0 AND lw."firmName" IS NOT NULL) AS bufetes
    FROM appointment_billing ab
    JOIN appointments ap ON ap.id = ab."appointmentId"
    JOIN cases cs ON cs.id = COALESCE(ab."caseId", ap."caseId")
    LEFT JOIN lawyers lw ON lw.id = cs."lawFirmId"
    WHERE cs."deletedAt" IS NULL
    GROUP BY cs."patientId"
  )
`;

/** El filtro del buscador. Vacío = todos, para que la cola abra completa. */
function filtro(q: string | undefined): Prisma.Sql {
  const t = (q ?? '').trim();
  if (!t) return Prisma.sql`TRUE`;
  const like = `%${t}%`;
  return Prisma.sql`(
       pa."firstName" ILIKE ${like}
    OR pa."lastName"  ILIKE ${like}
    OR (pa."firstName" || ' ' || pa."lastName") ILIKE ${like}
    OR pa."patientCode" ILIKE ${like}
    OR pa.email ILIKE ${like}
    OR pa.phone ILIKE ${like}
  )`;
}

/**
 * Una página de la cola.
 *
 * El orden es el que pidió Erick (16-sep-2026): **los que deben arriba, y
 * dentro de cada grupo por apellido**. No por monto: el que cobra trabaja con
 * una lista de facturas en la mano y busca a la persona por nombre. Ordenar por
 * deuda lo obligaría a recorrer la tabla entera para encontrar a alguien.
 *
 * El desempate por `id` no es decorativo: sin una clave única al final, dos
 * homónimos pueden salir en distinto orden en dos consultas y la misma fila
 * aparece en dos páginas o en ninguna.
 */
export async function paginaDeCobranzas({
  q, page, pageSize,
}: { q?: string; page: number; pageSize: number }): Promise<{ filas: FilaCobranza[]; total: number }> {
  const donde = filtro(q);
  const offset = page * pageSize;

  const [filas, cuenta] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH ${AGREGADO}
      SELECT
        pa.id, pa."patientCode", pa."firstName", pa."lastName",
        pa.email, pa.phone, pa.phone2,
        COALESCE(pl.total, 0)::float8        AS total,
        COALESCE(pl.pagado, 0)::float8       AS pagado,
        (COALESCE(pl.total, 0) - COALESCE(pl.pagado, 0) - COALESCE(pl.deuda, 0))::float8 AS descontado,
        COALESCE(pl.deuda, 0)::float8        AS deuda,
        COALESCE(pl.casos_con_deuda, 0)::int AS casos_con_deuda,
        pl.unico_case_id,
        pl.bufetes
      FROM patients pa
      LEFT JOIN plata pl ON pl.pid = pa.id
      WHERE ${donde}
      ORDER BY (COALESCE(pl.deuda, 0) > 0) DESC, pa."lastName" ASC, pa."firstName" ASC, pa.id ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    db.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM patients pa WHERE ${donde}
    `),
  ]);

  return {
    filas: filas.map(f => ({
      patientId:     f.id as string,
      patientCode:   (f.patientCode as string | null) ?? null,
      firstName:     (f.firstName as string) ?? '',
      lastName:      (f.lastName as string) ?? '',
      email:         (f.email as string | null) ?? null,
      phone:         (f.phone as string | null) ?? null,
      phone2:        (f.phone2 as string | null) ?? null,
      total:         Number(f.total ?? 0),
      pagado:        Number(f.pagado ?? 0),
      descontado:    Number(f.descontado ?? 0),
      deuda:         Number(f.deuda ?? 0),
      casosConDeuda: Number(f.casos_con_deuda ?? 0),
      unicoCaseId:   (f.unico_case_id as string | null) ?? null,
      bufetes:       (f.bufetes as string | null) ?? null,
    })),
    total: Number(cuenta[0]?.n ?? 0),
  };
}

/**
 * Los totales de la BÚSQUEDA, no de la página.
 *
 * Es la diferencia entre "esta pantalla suma $12.000" y "la clínica tiene
 * $1,37M por cobrar". Sumar las diez filas visibles sería lo segundo escrito
 * como si fuera lo primero.
 */
export async function resumenDeCobranzas(q?: string): Promise<ResumenCobranzas> {
  const donde = filtro(q);
  const r = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    WITH ${AGREGADO}
    SELECT
      COUNT(*)::int                                            AS pacientes,
      COUNT(*) FILTER (WHERE COALESCE(pl.deuda, 0) > 0)::int   AS con_deuda,
      COALESCE(SUM(pl.total), 0)::float8                       AS total,
      COALESCE(SUM(pl.pagado), 0)::float8                      AS pagado,
      (COALESCE(SUM(pl.total), 0) - COALESCE(SUM(pl.pagado), 0) - COALESCE(SUM(pl.deuda), 0))::float8 AS descontado,
      COALESCE(SUM(pl.deuda), 0)::float8                       AS deuda
    FROM patients pa
    LEFT JOIN plata pl ON pl.pid = pa.id
    WHERE ${donde}
  `);
  const f = r[0] ?? {};
  return {
    pacientes:  Number(f.pacientes ?? 0),
    conDeuda:   Number(f.con_deuda ?? 0),
    total:      Number(f.total ?? 0),
    pagado:     Number(f.pagado ?? 0),
    descontado: Number(f.descontado ?? 0),
    deuda:      Number(f.deuda ?? 0),
  };
}

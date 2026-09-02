import { db } from '@precision-medical/database';

/**
 * Resumen de notas por provider — la banda de supervisión de `/notes` (F2).
 *
 * ─── Una sola consulta, y de ahí salen las dos bandas ───────────────────────
 *
 * Los KPIs de arriba son la suma de estas filas, no una consulta aparte: así el
 * encabezado y la tabla no pueden decir cosas distintas. Es el mismo problema
 * que ya nos pasó con "pendiente" escrito en dos lados.
 *
 * ─── Por qué SQL directo y no `getProviderMetrics` ──────────────────────────
 *
 * `getProviderMetrics` resuelve esto para UN provider y de paso trae citas,
 * labs y recetas: llamarlo por cada uno son cuatro consultas por médico. Acá
 * hacen falta cinco agregados por provider y nada más, y salen en una pasada.
 *
 * ─── Por qué `$queryRawUnsafe` con string plano ─────────────────────────────
 *
 * NO `Prisma.sql` + `$queryRaw`. Interpolar un fragmento `Prisma.sql` dentro de
 * un tagged template depende de un `instanceof Prisma.Sql`, y en `next dev` eso
 * falla porque Next carga `@prisma/client` en capas de módulo separadas — el
 * fragmento creado en una capa no es "un Sql" para la otra. Cuando falla NO tira
 * error: pasa el fragmento como parámetro y la consulta devuelve basura. En
 * Vercel no pasa (un solo bundle), así que sería un bug que aparece solo en
 * local. Ver la nota larga en `lib/catalog.ts`.
 *
 * Sin riesgo de inyección: el SQL es constante y todo lo variable viaja como
 * parámetro posicional.
 */

export interface ProviderNotesRow {
  providerId: string;
  providerName: string;
  /** Visitas atendidas sin NINGUNA nota escrita. El número que duele. */
  sinNota: number;
  borradores: number;
  firmadas: number;
  /** De las firmadas, cuántas se cerraron dentro de las 24 h de la visita. */
  dentro24h: number;
  /** Antigüedad en días de su pendiente más vieja. 0 si no debe nada. */
  masVieja: number;
}

export interface NotesSummary {
  providers: ProviderNotesRow[];
  /** Los cuatro KPIs, sumados de las filas de arriba. */
  totales: {
    pendientes: number;
    sinNota: number;
    masVieja: number;
    firmadas: number;
    /** % de firmadas cerradas dentro de 24 h. null si no hay ninguna firmada. */
    pctDentro24h: number | null;
  };
}

/**
 * El alcance del resumen.
 *
 * Deliberadamente NO incluye `estado`, `antigüedad` ni la búsqueda: esos filtran
 * la LISTA de abajo, y aplicarlos acá haría que elegir "firmadas" mostrara cero
 * pendientes — el encabezado se leería como que no hay deuda. El resumen
 * describe la foto completa del alcance; la lista es el detalle que se recorta.
 *
 * `providerId` sí entra, pero solo en los KPIs: la tabla sigue mostrando a todos
 * para poder comparar, con el elegido resaltado.
 */
export interface AlcanceResumen {
  clinicId?: string;
  desde?: Date;
  hasta?: Date;
  /** Recorta SOLO los KPIs, no la tabla. */
  providerId?: string;
}

interface Fila {
  id: string;
  firstName: string;
  lastName: string;
  sin_nota: number;
  borradores: number;
  firmadas: number;
  dentro24: number;
  mas_vieja: Date | null;
}

export async function getNotesSummary(alcance: AlcanceResumen): Promise<NotesSummary> {
  const params: unknown[] = [];
  const cond: string[] = [
    // El MISMO criterio de "cita que debe nota" que `lib/notes-audit.ts`,
    // escrito en SQL porque acá no hay Prisma que lo componga. Si cambia allá,
    // cambia acá — es la única copia y está a propósito al lado.
    `a."status"::text NOT IN ('CANCELLED','NO_SHOW')`,
    `(a."checkedInAt" IS NOT NULL OR a."status"::text IN ('IN_PROGRESS','COMPLETED'))`,
    /**
     * Solo providers ACTIVOS, y no es un detalle: el selector de "Provider" de
     * los filtros ya listaba solo los activos (`db.provider.findMany` con
     * `status: 'ACTIVE'`), pero esta tabla arrancaba desde las citas y traía a
     * cualquiera que tuviera una. Los dos se contradecían — aparecían en el
     * ranking providers que después no se podían elegir para filtrar.
     *
     * De paso saca del ranking a los de prueba dados de baja. Los que siguen
     * ACTIVOS (los "(PRUEBA)") NO se resuelven acá: son providers activos de
     * verdad en producción y esconderlos con un filtro por nombre se rompe con
     * el primero que se cree sin esa palabra. Se arreglan en el dato —
     * marcándolos INACTIVE en Configuración → Doctores— y ahí desaparecen de
     * esta pantalla, del calendario y de las métricas a la vez.
     */
    `p."status"::text = 'ACTIVE'`,
    `p."deletedAt" IS NULL`,
  ];

  if (alcance.clinicId) { params.push(alcance.clinicId); cond.push(`a."clinicId" = $${params.length}`); }
  if (alcance.desde)    { params.push(alcance.desde);    cond.push(`a."scheduledFor" >= $${params.length}`); }
  if (alcance.hasta)    { params.push(alcance.hasta);    cond.push(`a."scheduledFor" < $${params.length}`); }

  const sql = `
    SELECT
      p."id",
      p."firstName",
      p."lastName",
      COUNT(*) FILTER (WHERE vn."id" IS NULL)::int                      AS sin_nota,
      COUNT(*) FILTER (WHERE vn."status"::text = 'DRAFT')::int          AS borradores,
      COUNT(*) FILTER (WHERE vn."status"::text = 'SIGNED')::int         AS firmadas,
      COUNT(*) FILTER (
        WHERE vn."status"::text = 'SIGNED'
          AND vn."signedAt" IS NOT NULL
          AND vn."signedAt" <= a."scheduledFor" + interval '24 hours'
      )::int                                                            AS dentro24,
      MIN(a."scheduledFor") FILTER (
        WHERE vn."id" IS NULL OR vn."status"::text = 'DRAFT'
      )                                                                 AS mas_vieja
    FROM appointments a
    JOIN providers p       ON p."id" = a."providerId"
    LEFT JOIN visit_notes vn ON vn."appointmentId" = a."id"
    WHERE ${cond.join(' AND ')}
    GROUP BY p."id", p."firstName", p."lastName"
    ORDER BY sin_nota DESC, borradores DESC, p."lastName" ASC
  `;

  const filas = await db.$queryRawUnsafe<Fila[]>(sql, ...params);

  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);
  const dias = (d: Date | null): number =>
    d ? Math.max(0, Math.floor((inicioDeHoy.getTime() - new Date(d).getTime()) / 86_400_000)) : 0;

  const providers: ProviderNotesRow[] = filas.map((f) => ({
    providerId: f.id,
    providerName: `${f.firstName} ${f.lastName}`.trim(),
    sinNota: f.sin_nota,
    borradores: f.borradores,
    firmadas: f.firmadas,
    dentro24h: f.dentro24,
    masVieja: dias(f.mas_vieja),
  }));

  // Los KPIs se recortan al provider elegido; la tabla no. Elegir a alguien
  // convierte el encabezado en SUS números y deja la tabla para comparar.
  const alcanzados = alcance.providerId
    ? providers.filter((p) => p.providerId === alcance.providerId)
    : providers;

  const suma = (f: (p: ProviderNotesRow) => number): number =>
    alcanzados.reduce((s, p) => s + f(p), 0);

  const firmadas = suma((p) => p.firmadas);

  return {
    providers,
    totales: {
      pendientes: suma((p) => p.sinNota) + suma((p) => p.borradores),
      sinNota: suma((p) => p.sinNota),
      masVieja: alcanzados.reduce((m, p) => Math.max(m, p.masVieja), 0),
      firmadas,
      pctDentro24h: firmadas > 0 ? Math.round((suma((p) => p.dentro24h) / firmadas) * 100) : null,
    },
  };
}

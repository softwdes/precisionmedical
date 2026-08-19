/**
 * Grilla de tracking de Edson — B.12
 *
 * GET /api/admin/edson/tracking?q=&clinicId=&providerId=&apptStatus=&pip=
 *                              &carrierId=&flag=&archived=&sort=&dir=&page=&size=
 *
 * Una fila = un caso MVA, mostrando SOLO su PRIMERA cita (Edson no necesita ver
 * las visitas siguientes). Incluye las citas pasadas: no-shows y canceladas son
 * justo las que persigue.
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
  appointment: 'fa."scheduledFor"',
  patient:     'p."lastName"',
  lossDate:    'loss_date',
  carrier:     'carrier_name',
  claim:       'cai."claimNum"',
  created:     'c."createdAt"',
};

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
  const archived   = sp.get('archived') === 'true';

  const sortKey = SORT_COLUMNS[sp.get('sort') ?? ''] ?? SORT_COLUMNS.appointment;
  const dir     = sp.get('dir') === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
  const page    = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
  const size    = Math.min(MAX_SIZE, Math.max(1, parseInt(sp.get('size') ?? '25', 10) || 25));
  const offset  = (page - 1) * size;

  const where: Prisma.Sql[] = [
    Prisma.sql`c."deletedAt" IS NULL`,
    Prisma.sql`c."caseType" = 'MVA'`,
    // Archivar es lo único que saca una fila de la cola; completar no.
    archived
      ? Prisma.sql`ct."archivedAt" IS NOT NULL`
      : Prisma.sql`ct."archivedAt" IS NULL`,
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
      OR adj."name" ILIKE ${like} OR cai."adjusterNameRaw" ILIKE ${like}
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
   * `JOIN LATERAL` (no LEFT): un caso sin ninguna cita no es fila de esta
   * grilla. El Excel arranca en la cita, no en el caso.
   */
  const from = Prisma.sql`
    FROM cases c
    JOIN LATERAL (
      SELECT a."id", a."scheduledFor", a."status", a."clinicId", a."providerId"
      FROM appointments a
      WHERE a."caseId" = c."id"
      ORDER BY a."scheduledFor" ASC
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
     * Primer adjuster ACTIVO del caso. Antes salia del FK unico de
     * case_auto_insurances, pero Edson pidio poder anotar varios ("Kenneth
     * Kelly or Patricia Leon"), asi que la asignacion vive en case_adjusters.
     *
     * OJO: nada de backticks en este comentario — vive dentro de un template
     * literal de Prisma.sql y lo cortarian a la mitad.
     */
    LEFT JOIN LATERAL (
      SELECT ia."name", ia."phone", ia."extension"
      FROM case_adjusters ca
      JOIN insurance_adjusters ia ON ia."id" = ca."adjusterId"
      WHERE ca."caseId" = c."id" AND ca."removedAt" IS NULL
      ORDER BY ca."assignedAt" ASC
      LIMIT 1
    ) adj ON TRUE
    LEFT JOIN case_tracking ct         ON ct."caseId" = c."id"
    WHERE ${whereSql}
  `;

  const rowsQuery = Prisma.sql`
    SELECT
      c."id"            AS case_id,
      c."caseCode"      AS case_code,
      c."accidentDate"  AS case_accident_date,
      p."id"            AS patient_id,
      p."firstName"     AS patient_first,
      p."lastName"      AS patient_last,
      p."dateOfBirth"   AS patient_dob,
      p."phone"         AS patient_phone,

      fa."id"           AS appt_id,
      fa."scheduledFor" AS appt_at,
      fa."status"::text AS appt_status,
      la."status"::text AS latest_status,
      cl."name"         AS clinic_name,
      cl."color"        AS clinic_color,
      CASE WHEN pr."id" IS NULL THEN NULL
           ELSE TRIM(CONCAT(pr."firstName", ' ', pr."lastName")) END AS provider_name,

      c."lawFirmId"     AS law_firm_id,
      c."attorneyId"    AS attorney_id,
      lf."firmName"     AS firm_name,
      CASE WHEN at."id" IS NULL THEN NULL
           ELSE TRIM(CONCAT(COALESCE(at."firstName", ''), ' ', COALESCE(at."lastName", ''))) END AS attorney_name,
      c."consentsData" -> 'chiropractor' AS chiropractor,

      -- Valor efectivo: la fila del seguro gana, el caso es el respaldo.
      COALESCE(ic."name", cai."carrierNameRaw")   AS carrier_name,
      COALESCE(cai."lossDate", c."accidentDate")  AS loss_date,
      cai."claimNum"                              AS claim_num,
      COALESCE(cai."pipAvailable"::text, 'UNKNOWN') AS pip,
      COALESCE(adj."name", cai."adjusterNameRaw") AS adjuster_name,
      COALESCE(adj."phone", cai."adjusterPhoneRaw") AS adjuster_phone,
      adj."extension"                             AS adjuster_ext,
      (SELECT COUNT(*)::int FROM case_adjusters ca
        WHERE ca."caseId" = c."id" AND ca."removedAt" IS NULL) AS adjuster_count,

      ct."completedAt"  AS completed_at,
      ct."archivedAt"   AS archived_at,
      (SELECT n."body"      FROM case_tracking_notes n WHERE n."caseId" = c."id" ORDER BY n."createdAt" DESC LIMIT 1) AS last_note,
      (SELECT n."createdAt" FROM case_tracking_notes n WHERE n."caseId" = c."id" ORDER BY n."createdAt" DESC LIMIT 1) AS last_note_at,
      (SELECT COUNT(*)::int FROM case_tracking_notes n WHERE n."caseId" = c."id") AS note_count,
      (SELECT COUNT(*)::int FROM case_managers cm
        WHERE cm."caseId" = c."id" AND cm."removedAt" IS NULL) AS manager_count
    ${from}
    ORDER BY ${Prisma.raw(sortKey)} ${dir} NULLS LAST, c."id" ASC
    LIMIT ${size} OFFSET ${offset}
  `;

  const countQuery = Prisma.sql`SELECT COUNT(*)::int AS total ${from}`;

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
  const [rows, countRes, statsRes] = await Promise.all([
    db.$queryRaw<Row[]>(rowsQuery),
    db.$queryRaw<{ total: number }[]>(countQuery),
    db.$queryRaw<Row[]>(statsQuery),
  ]);

  const total = countRes[0]?.total ?? 0;

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      caseId:   r.case_id,
      // Algunos casos migrados del v2 guardaron el código cifrado; nunca se
      // devuelve el `e:…` crudo.
      caseCode: isCipher(r.case_code as string) ? dec(r.case_code as string) : r.case_code,
      patient: {
        id:        r.patient_id,
        firstName: r.patient_first,
        lastName:  r.patient_last,
        dateOfBirth: r.patient_dob,
        phone:     dec(r.patient_phone as string | null),
      },
      appointment: {
        id:          r.appt_id,
        scheduledFor: r.appt_at,
        status:      r.appt_status,
        latestStatus: r.latest_status,
        clinicName:  r.clinic_name,
        clinicColor: r.clinic_color,
        providerName: r.provider_name,
      },
      lawFirmId:     r.law_firm_id,
      attorneyId:    r.attorney_id,
      firmName:      r.firm_name,
      attorneyName:  (r.attorney_name as string | null)?.trim() || null,
      chiropractor:  r.chiropractor,
      carrierName:   r.carrier_name,
      lossDate:      r.loss_date,
      claimNum:      r.claim_num,
      pipAvailable:  r.pip,
      adjusterName:  r.adjuster_name,
      adjusterPhone: r.adjuster_phone,
      adjusterExt:   r.adjuster_ext,
      completedAt:   r.completed_at,
      archivedAt:    r.archived_at,
      lastNote:      r.last_note,
      lastNoteAt:    r.last_note_at,
      noteCount:     r.note_count,
      managerCount:  r.manager_count,
      adjusterCount: r.adjuster_count,
    })),
    stats: statsRes[0] ?? { total: 0, no_pip: 0, no_adjuster: 0, completed: 0, archivable: 0 },
    page,
    size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
  });
}

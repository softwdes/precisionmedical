/**
 * GET /api/admin/lab-orders/reporte?scope=mine|clinic
 *
 * El estado de TODAS las órdenes de laboratorio que todavía no salieron bien.
 *
 * ── Para qué ───────────────────────────────────────────────────────────────
 * Hoy los cuatro motivos por los que una orden no se emite se descubren de a
 * uno: apretás "Generar orden" y recibís el error. Con diez pacientes eso son
 * diez intentos y ninguna vista de conjunto. Esto lo da vuelta — antes de mandar
 * el lote a LabCorp se mira una lista y se ve qué falta y de quién es
 * (Erick, 2026-09-13).
 *
 * ── Sin filtro de fecha, a propósito ───────────────────────────────────────
 * Lo que falta no vence: un estudio pedido el martes y nunca emitido sigue mal
 * el jueves. Si el reporte se acotara al día visible, esa orden desaparecería y
 * nadie volvería a verla (decisión de Erick, mismo día).
 *
 * ── El estado que importa de verdad ────────────────────────────────────────
 * `ANULADA_SIN_REEMITIR` es el único donde se PERDIÓ trabajo ya hecho: alguien
 * anuló para corregir algo, se distrajo, y el grupo quedó sin hoja. El botón
 * vuelve a decir "Generar orden" como si nada, así que sin este reporte no se
 * entera nadie hasta que el paciente vuelve sin resultados. Va primero.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionProvider, getSessionRole, PORTAL_ONLY_ROLES } from '@/lib/get-session-provider';
import { getSessionUser } from '@/lib/session';
import { clasificarOrden, esOtroSeguro, type EstadoOrden } from '@/lib/reporte-labs';

interface Fila {
  groupId: string;
  appointmentId: string;
  fecha: string;
  paciente: string;
  patientCode: string | null;
  caseCode: string | null;
  /** La cita no tiene caso: la hoja se emite igual pero NO va a Documentos. */
  sinCaso: boolean;
  providerName: string | null;
  estudios: number;
  estado: EstadoOrden;
  numero: string | null;
  /** El seguro con el que salió la hoja, congelado en la requisición. */
  seguroHoja: string | null;
  /** El del caso, para comparar. */
  seguroCaso: string | null;
  /** La hoja se facturó a algo distinto del seguro del caso. */
  otroSeguro: boolean;
  anuladaNumero: string | null;
  anuladaMotivo: string | null;
}

interface FilaCruda {
  gid: string; appt: string; estudios: number; tipos: number; tipo: string;
  scheduled: Date; caseid: string | null;
  npi: string | null; pnom: string | null; pape: string | null;
  nom: string; ape: string; cod: string | null;
  casecode: string | null; poliza: string | null; seguro_caso: string | null;
  numero: string | null; seguro_hoja: string | null;
  anulada_num: string | null; anulada_motivo: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  /*
   * ── EL ALCANCE LO DECIDE EL ROL, NO EL PARÁMETRO ──────────────────────────
   *
   * Esta ruta devuelve nombre, código de paciente, caso y seguro de TODA la
   * clínica cuando el alcance es `clinic`. Y llega hasta acá un provider: las
   * rutas `lab-*` están deliberadamente FUERA de las que el middleware cierra,
   * porque las usa el portal médico (ver el comentario del middleware). O sea
   * que sin este chequeo, un provider pedía `?scope=clinic` —o no mandaba nada—
   * y recibía los pacientes de todos los demás.
   *
   * Dos candados, y el segundo es el que cierra:
   *  1. El default es `mine`. Una llamada sin parámetro falla hacia lo ANGOSTO.
   *  2. Un rol de portal (DOCTOR / PROVIDER) NUNCA obtiene `clinic`, pida lo que
   *     pida. La pantalla que manda `clinic` es Day Admission, que es del staff.
   *
   * Lo encontró pm-1a al revisar el commit, y tenía razón en que estaba abierto.
   */
  const pedido = req.nextUrl.searchParams.get('scope') === 'clinic' ? 'clinic' : 'mine';
  const rol = await getSessionRole();
  const esDePortal = !!rol && PORTAL_ONLY_ROLES.has(rol);
  const scope: 'mine' | 'clinic' = esDePortal ? 'mine' : pedido;

  /*
   * `mine` = las del provider de la sesión, igual que la cola de notas sin
   * cerrar. Se usa `getSessionProvider` (no `getOwnSessionProvider`) porque esto
   * vive DENTRO del portal médico: si un admin está mirando el portal de otro
   * doctor, tiene que ver el día de ese doctor, que es lo que está mirando.
   */
  const soloMias = scope === 'mine' ? await getSessionProvider() : null;
  if (scope === 'mine' && !soloMias) {
    return NextResponse.json({ resumen: vacio(), filas: [] });
  }

  const filtroProvider = soloMias?.id ?? null;

  const crudas = await db.$queryRaw<FilaCruda[]>`
    WITH grupos AS (
      SELECT lo."groupId"                                            AS gid,
             MIN(lo."appointmentId")                                 AS appt,
             COUNT(*)::int                                           AS estudios,
             COUNT(DISTINCT COALESCE(lo."billingType"::text, '~'))::int AS tipos,
             MIN(COALESCE(lo."billingType"::text, 'CLIENT'))         AS tipo,
             MAX(lo."orderedAt")                                     AS pedida
        FROM lab_orders lo
       WHERE lo."groupId" IS NOT NULL
         AND lo.status <> 'VOIDED'
       GROUP BY lo."groupId"
    )
    SELECT g.gid, g.appt, g.estudios, g.tipos, g.tipo,
           a."scheduledFor"          AS scheduled,
           a."caseId"                AS caseid,
           pr."npi"                  AS npi,
           pr."firstName"            AS pnom,
           pr."lastName"             AS pape,
           pa."firstName"            AS nom,
           pa."lastName"             AS ape,
           pa."patientCode"          AS cod,
           c."caseCode"              AS casecode,
           c."primaryPolicyNumber"   AS poliza,
           ic."name"                 AS seguro_caso,
           lr."number"               AS numero,
           lr."insuranceName"        AS seguro_hoja,
           anu."number"              AS anulada_num,
           anu."voidReason"          AS anulada_motivo
      FROM grupos g
      JOIN appointments a       ON a.id  = g.appt
      JOIN patients pa          ON pa.id = a."patientId"
      LEFT JOIN providers pr    ON pr.id = a."providerId"
      LEFT JOIN cases c         ON c.id  = a."caseId"
      LEFT JOIN insurance_carriers ic ON ic.id = c."primaryInsuranceId"
      -- La VIGENTE del grupo, si hay.
      LEFT JOIN lab_requisitions lr
             ON lr."groupId" = g.gid AND lr."voidedAt" IS NULL
      -- La última anulada que NUNCA se reemplazó. Con LATERAL porque puede
      -- haber varias anulaciones del mismo grupo y solo interesa la última.
      LEFT JOIN LATERAL (
        SELECT x."number", x."voidReason"
          FROM lab_requisitions x
         WHERE x."groupId" = g.gid
           AND x."voidedAt" IS NOT NULL
           AND x."replacedByNumber" IS NULL
         ORDER BY x."voidedAt" DESC
         LIMIT 1
      ) anu ON TRUE
     WHERE (${filtroProvider}::text IS NULL OR pr.id = ${filtroProvider})
     ORDER BY g.pedida DESC NULLS LAST
     LIMIT 500`;

  const filas: Fila[] = crudas.map((r) => {
    const emitida = !!r.numero;
    // La decisión vive en `lib/reporte-labs.ts`: acá adentro no se podría
    // probar, y lo que decide es justo lo que hay que probar.
    const estado: EstadoOrden = clasificarOrden({
      emitida,
      anuladaHuerfana: !!r.anulada_num,
      npi: r.npi,
      tipos: r.tipos,
      tipo: r.tipo,
      poliza: r.poliza,
    });

    const seguroCaso = r.seguro_caso?.trim() || null;
    const seguroHoja = r.seguro_hoja?.trim() || null;

    return {
      groupId: r.gid,
      appointmentId: r.appt,
      fecha: r.scheduled.toISOString(),
      paciente: `${r.ape}, ${r.nom}`,
      patientCode: r.cod,
      caseCode: r.casecode,
      sinCaso: r.caseid === null,
      providerName: r.pape ? `${r.pape}, ${r.pnom ?? ''}`.trim() : null,
      estudios: r.estudios,
      estado,
      numero: r.numero,
      seguroHoja,
      seguroCaso,
      otroSeguro: esOtroSeguro(emitida, seguroHoja, seguroCaso),
      anuladaNumero: r.anulada_num,
      anuladaMotivo: r.anulada_motivo,
    };
  });

  const cuenta = (e: EstadoOrden) => filas.filter((f) => f.estado === e).length;

  return NextResponse.json({
    resumen: {
      total: filas.length,
      anuladasSinReemitir: cuenta('ANULADA_SIN_REEMITIR'),
      sinNpi: cuenta('SIN_NPI'),
      sinPoliza: cuenta('SIN_POLIZA'),
      mezcladas: cuenta('MEZCLADO'),
      listas: cuenta('LISTA'),
      emitidas: cuenta('EMITIDA'),
      conOtroSeguro: filas.filter((f) => f.otroSeguro).length,
      sinCaso: filas.filter((f) => f.sinCaso).length,
    },
    filas,
  });
}

function vacio() {
  return {
    total: 0, anuladasSinReemitir: 0, sinNpi: 0, sinPoliza: 0,
    mezcladas: 0, listas: 0, emitidas: 0, conOtroSeguro: 0, sinCaso: 0,
  };
}

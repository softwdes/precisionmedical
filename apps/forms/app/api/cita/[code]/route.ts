/**
 * GET /api/cita/[code]
 *
 * Búsqueda pública de cita por código de caso (CASE-1127) o ID de appointment.
 * HIPAA: solo devuelve nombre de pila, clínica, especialista (nombre), fecha/hora.
 * NUNCA: apellido completo, DOB, diagnóstico, aseguradora, número de caso completo.
 *
 * ── Por qué el match es EXACTO ──────────────────────────────────────────────
 *
 * Buscaba con `contains`, seguramente para perdonarle al paciente que escriba
 * `1127` en vez de `CASE-1127`. El costo de esa amabilidad era el padrón:
 *
 *  · `caseCode` es SECUENCIAL (`CASE-<n>`, ver `nextCaseCode`). Recorrer
 *    `CASE-1` … `CASE-3000` devolvía, de cada paciente con cita próxima, su
 *    nombre de pila, su especialista, la clínica y la fecha y hora exactas.
 *  · Peor: con `contains`, pedir `/api/cita/CASE-` matcheaba TODOS y devolvía
 *    la próxima cita del sistema — sin conocer ningún código.
 *
 * La lista de campos que devuelve estaba bien pensada; el agujero nunca fue qué
 * campos, sino a cuántos pacientes se llegaba. Ahora el código se NORMALIZA
 * (que es lo que la amabilidad quería) y después se compara entero.
 *
 * El freno por IP es la segunda línea, no el arreglo: un código secuencial con
 * freno sigue siendo enumerable, solo que más despacio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

/**
 * Lleva lo que escribió el paciente a un `caseCode` canónico.
 *
 * Acepta `1127`, `case 1127`, `Case-1127`, `CASE-1127` → `CASE-1127`.
 * Devuelve null si no queda un código con forma de tal, y así ni se consulta.
 */
function normalizarCaseCode(raw: string): string | null {
  const limpio = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = /^(?:CASE[-_]?)?(\d{1,10})$/.exec(limpio);
  return m ? `CASE-${m[1]}` : null;
}

/** Un cuid de appointment: 25 caracteres, sin guiones. Nunca lo tipea nadie. */
function pareceId(raw: string): boolean {
  return /^[a-z0-9]{20,32}$/i.test(raw.trim());
}

function formatType(raw: string): string {
  const map: Record<string, string> = {
    FOLLOW_UP: 'Follow-up', INITIAL: 'Consulta inicial', TRIAGE: 'Triaje',
    PROCEDURE: 'Procedimiento', THERAPY: 'Terapia', EVALUATION: 'Evaluación',
    MVA: 'Accidente de tráfico', SLIP_AND_FALL: 'Caída', WORKERS_COMP: 'Comp. laboral',
  };
  return map[raw.toUpperCase()] ?? raw.replace(/_/g, ' ');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  // 20 consultas cada 10 minutos por IP. Un paciente que se equivoca al tipear
  // hace tres o cuatro; 20 no lo alcanza nunca y a un script le arruina el
  // rendimiento.
  const freno = rateLimit(claveDeIp(req, 'cita'), { max: 20, ventanaMs: 10 * 60_000 });
  if (!freno.ok) {
    return NextResponse.json(
      { ok: false, error: 'too_many_requests' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

  const caseCode = normalizarCaseCode(code);
  const apptId   = pareceId(code) ? code.trim() : null;

  // Ni código de caso ni id: no hay nada que consultar. Se responde igual que
  // "no encontrado" — decir "formato inválido" le enseña el formato a quien
  // está probando.
  if (!caseCode && !apptId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const now = new Date();

  // Buscar por caseCode EXACTO, o por ID directo de appointment
  const appt = await db.appointment.findFirst({
    where: {
      OR: [
        ...(caseCode ? [{ case: { caseCode } }] : []),
        ...(apptId   ? [{ id: apptId }]         : []),
      ],
      scheduledFor: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) }, // no mostrar citas de hace más de 2h
    },
    select: {
      id:           true,
      scheduledFor: true,
      status:       true,
      type: true,
      patient: { select: { firstName: true } },
      provider: { select: { firstName: true } },
      clinic:   { select: { name: true, address: true } },
      case:     { select: { caseCode: true, caseType: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  if (!appt) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const scheduledFor = appt.scheduledFor;
  const diffMs   = scheduledFor.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isToday  = diffDays <= 0;

  return NextResponse.json({
    ok: true,
    firstName:   appt.patient.firstName,
    doctorName:  appt.provider ? appt.provider.firstName : null,
    clinicName:  appt.clinic.name,
    clinicAddr:  appt.clinic.address,
    scheduledFor: scheduledFor.toISOString(),
    status:      appt.status,
    apptType:    formatType(appt.type ?? appt.case?.caseType ?? 'Follow-up'),
    caseCode:    appt.case?.caseCode ?? null,
    isToday,
    daysUntil:   Math.max(0, diffDays),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

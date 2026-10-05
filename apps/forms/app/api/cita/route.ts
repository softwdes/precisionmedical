/**
 * POST /api/cita   { code: "CASE-1127", dob: "1985-03-21" }
 *
 * Consulta pública de la próxima cita: el paciente prueba que es él con el
 * código de su caso Y su fecha de nacimiento.
 *
 * HIPAA: devuelve solo nombre de pila, clínica, especialista (nombre) y
 * fecha/hora. NUNCA apellido, nacimiento, diagnóstico, aseguradora.
 *
 * ── Por qué es POST y pide la fecha de nacimiento ───────────────────────────
 *
 * Antes era `GET /api/cita/[code]` y bastaba el código. El código es
 * SECUENCIAL (`CASE-<n>`), así que recorrerlo devolvía —de cada paciente con
 * cita próxima— su nombre de pila, su especialista, la clínica y la fecha y
 * hora exactas. El match exacto y el freno por IP lo encarecieron, no lo
 * cerraron: un código secuencial con freno sigue siendo enumerable, más
 * despacio.
 *
 * Ahora el código solo no abre nada: hace falta además la fecha de nacimiento,
 * que no sale de ningún contador. Va en el CUERPO y no en la URL para que no
 * quede en los logs, en el historial del navegador ni en el `Referer`.
 *
 * ── Qué se cierra ───────────────────────────────────────────────────────────
 *
 *  · "No existe", "existe pero la fecha no coincide" y "ya pasó" responden
 *    IGUAL (404 `not_found`): distinguirlos le dice a quien prueba que el
 *    código es real, que es justo lo que se está protegiendo.
 *  · La búsqueda por ID interno de la cita se quitó: nadie lo tipea, y el lobby
 *    público exponía esos ids, así que era una llave para saltarse el código.
 *  · Los fallos se cuentan POR CÓDIGO en la base (no en memoria): 5 fallos en
 *    30 minutos bloquean ese código, sin importar desde cuántas IPs ni en qué
 *    instancia caigan. El freno por IP en memoria sigue de primera línea, pero
 *    en serverless cada instancia tiene su contador — por eso no alcanza solo.
 *  · Cada consulta —buena o mala— deja una fila en el audit log: una divulgación
 *    de datos a un desconocido tiene que poder reconstruirse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, VIGENTES, writeAuditLog } from '@precision-medical/database';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

const BodySchema = z.object({
  code: z.string().min(1).max(40),
  dob:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Fallos por código que bloquean ese código, y por cuánto tiempo. */
const FALLOS_MAX    = 5;
const VENTANA_MS    = 30 * 60_000;

/**
 * El NÚMERO del código de caso que escribió el paciente, o null.
 *
 * Los códigos reales son `GM-3464` y `MVA-3464` (medido el 2026-10-05: 3.149
 * casos, TODOS `GM-#` o `MVA-#`; ninguno `CASE-#`). Esta ruta solo entendía
 * `CASE-<n>`, así que desde el cambio a match exacto no encontraba a NINGÚN
 * paciente real: la pantalla decía "código no encontrado" a todos.
 *
 * El número es una serie única compartida por todos los prefijos (0 repetidos
 * entre `GM` y `MVA`), así que alcanza con él: `3464`, `gm 3464`, `MVA-3464`
 * y `GM_3464` son el mismo caso. Y es la clave del freno por código: si el freno
 * fuera por texto completo, probar los tres prefijos triplicaría los intentos.
 */
function numeroDeCaso(raw: string): number | null {
  const limpio = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = /^(?:(?:GM|MVA|WI|CASE)[-_]?)?(\d{1,8})$/.exec(limpio);
  return m ? Number(m[1]) : null;
}

/** Los códigos que puede tener ese número (el prefijo no se le exige al paciente). */
const PREFIJOS = ['GM', 'MVA', 'WI', 'CASE'] as const;

/** ¿Es una fecha de calendario real? ("2024-02-31" pasa la forma y no existe.) */
function fechaReal(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d;
}

function formatType(raw: string): string {
  const map: Record<string, string> = {
    FOLLOW_UP: 'Follow-up', INITIAL: 'Consulta inicial', TRIAGE: 'Triaje',
    PROCEDURE: 'Procedimiento', THERAPY: 'Terapia', EVALUATION: 'Evaluación',
    MVA: 'Accidente de tráfico', SLIP_AND_FALL: 'Caída', WORKERS_COMP: 'Comp. laboral',
  };
  return map[raw.toUpperCase()] ?? raw.replace(/_/g, ' ');
}

const NO_STORE = { 'Cache-Control': 'no-store' };
const noEncontrado = () =>
  NextResponse.json({ ok: false, error: 'not_found' }, { status: 404, headers: NO_STORE });

export async function POST(req: NextRequest) {
  // Primera línea: 10 consultas cada 10 minutos por IP. Un paciente que se
  // equivoca al tipear hace dos o tres; 10 no lo alcanza nunca.
  const freno = rateLimit(claveDeIp(req, 'cita'), { max: 10, ventanaMs: 10 * 60_000 });
  if (!freno.ok) {
    return NextResponse.json(
      { ok: false, error: 'too_many_requests' },
      { status: 429, headers: { ...cabeceras429(freno), ...NO_STORE } },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400, headers: NO_STORE });
  }

  const numero = numeroDeCaso(body.code);
  // Sin código con forma de tal o con fecha imposible no hay nada que consultar.
  // Se responde igual que "no encontrado": decir "formato inválido" le enseña el
  // formato a quien está probando.
  if (numero === null || !fechaReal(body.dob)) return noEncontrado();
  const claveCaso = `caso:${numero}`;

  const ip = claveDeIp(req, 'cita').slice('cita:'.length);
  const ua = req.headers.get('user-agent')?.slice(0, 200) ?? null;

  // Segunda línea, la que sí se comparte entre instancias: los fallos por código
  // viven en la base. Aplica a CUALQUIER código, exista o no, para no delatar
  // cuáles existen.
  const fallos = await db.auditLog.count({
    where: {
      action: 'CITA_LOOKUP_FAILED',
      entityType: 'cases',
      entityId: claveCaso,
      createdAt: { gte: new Date(Date.now() - VENTANA_MS) },
    },
  });
  if (fallos >= FALLOS_MAX) {
    return NextResponse.json(
      { ok: false, error: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': String(VENTANA_MS / 1000), ...NO_STORE } },
    );
  }

  const now = new Date();
  const candidatas = await db.appointment.findMany({
    take: 10,
    where: {
      ...VIGENTES,
      case: { caseCode: { in: PREFIJOS.map(p => `${p}-${numero}`) } },
      scheduledFor: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) }, // no mostrar citas de hace más de 2h
    },
    select: {
      id:           true,
      scheduledFor: true,
      status:       true,
      type:         true,
      patient:  { select: { firstName: true, dateOfBirth: true } },
      provider: { select: { firstName: true } },
      clinic:   { select: { name: true, address: true } },
      case:     { select: { caseCode: true, caseType: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  // La fecha de nacimiento se guarda como instante UTC (a medianoche o entre
  // las 12 y las 19 h UTC: medido el 2026-10-05, 5.811 de 5.812 pacientes), así
  // que el día de calendario es el de `toISOString()`, sin zona. Con
  // `America/Denver` un nacido el 1-ene saldría 31-dic.
  const appt = candidatas.find(a => a.patient.dateOfBirth?.toISOString().slice(0, 10) === body.dob) ?? null;

  if (!appt) {
    await writeAuditLog(db, {
      actorType: 'SYSTEM', action: 'CITA_LOOKUP_FAILED',
      entityType: 'cases', entityId: claveCaso,
      ipAddress: ip, userAgent: ua,
      // Se anota si el código existía solo para que quien revise el log distinga
      // "tipeo mal" de "está probando fechas"; la RESPUESTA no lo distingue.
      metadata: { existe: candidatas.length > 0 },
    });
    return noEncontrado();
  }

  // La divulgación se registra ANTES de responder.
  await writeAuditLog(db, {
    actorType: 'SYSTEM', action: 'CITA_LOOKUP_OK',
    entityType: 'appointments', entityId: appt.id,
    ipAddress: ip, userAgent: ua,
    metadata: { caseCode: appt.case?.caseCode ?? null },
  });

  const diffMs   = appt.scheduledFor.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return NextResponse.json({
    ok: true,
    firstName:    appt.patient.firstName,
    doctorName:   appt.provider ? appt.provider.firstName : null,
    clinicName:   appt.clinic.name,
    clinicAddr:   appt.clinic.address,
    scheduledFor: appt.scheduledFor.toISOString(),
    status:       appt.status,
    apptType:     formatType(appt.type ?? appt.case?.caseType ?? 'Follow-up'),
    caseCode:     appt.case?.caseCode ?? null,
    isToday:      diffDays <= 0,
    daysUntil:    Math.max(0, diffDays),
  }, { headers: NO_STORE });
}

/**
 * POST /api/walkin/[clinicId]
 *
 * B.5 — Walk-in kiosk: crea un caso/paciente walk-in y devuelve el token de intake.
 * Sin auth requerida — es el punto de entrada público del kiosk de recepción.
 *
 * Flujo:
 *   1. Recibe firstName, lastName, phone y fecha de nacimiento del kiosk
 *   2. Si ya existe un paciente con ese teléfono Y la misma fecha de nacimiento
 *      Y el mismo apellido, lo reutiliza; si no, crea uno nuevo
 *   3. Crea Case con source=WALK_IN + portalToken único
 *   4. Devuelve { token } para redirigir al intake wizard /c/[token]
 *
 * HIPAA: No hay PHI en la respuesta — solo el token opaco.
 *
 * ── Por qué ya no alcanza con el teléfono ───────────────────────────────────
 *
 * Antes esta ruta buscaba al paciente SOLO por teléfono y le colgaba un caso
 * nuevo con un token. Ese token abre `/api/intake/[token]`, que devuelve la
 * ficha (nombre, nacimiento, teléfono, correo, dirección) y además ESCRIBE en
 * ella (el autosave del wizard pisa los datos del paciente). Y esta ruta es
 * pública: el id de la clínica está en la URL de la TV y en el QR. Con el
 * teléfono de cualquier paciente, un desconocido obtenía su ficha completa y
 * podía modificarla. Medido el 2026-10-05: 13 de los 32 casos walk-in se
 * habían colgado de un paciente que ya existía.
 *
 * Ahora una ficha existente solo se reutiliza si coinciden teléfono, apellido Y
 * fecha de nacimiento. Si no coincide —o si alguien está probando fechas— se
 * crea un paciente NUEVO y se responde exactamente igual: no hay forma de saber
 * desde afuera si el teléfono existía. El costo es un duplicado cuando un
 * paciente que vuelve se equivoca al escribir, que recepción puede juntar; el
 * costo del otro camino era regalar fichas.
 *
 * Los fallos de coincidencia se cuentan POR TELÉFONO en la base (no en memoria,
 * que en serverless no se comparte entre instancias): 5 en 30 minutos y ese
 * teléfono deja de reutilizar fichas, así que la fecha de nacimiento no se puede
 * adivinar por fuerza bruta.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z }  from 'zod';
import { db, writeAuditLog, nextCaseCode, nextPatientCode } from '@precision-medical/database';
import { randomBytes }       from 'crypto';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';
import { decryptFieldOrOriginal } from '@/lib/decrypt';
import { fechaNacimientoValida, elegirFichaReutilizable } from '@/lib/walkin-match';

const BodySchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName:  z.string().min(1).max(100).trim(),
  phone:     z.string().min(7).max(20).trim(),
  dob:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language:  z.enum(['es', 'en']).default('en'),
});

/** Fallos de coincidencia por teléfono que cortan la reutilización, y por cuánto. */
const FALLOS_MAX = 5;
const VENTANA_MS = 30 * 60_000;
/** Altas walk-in por hora entre TODAS las IPs: techo contra quien inunde la base. */
const ALTAS_MAX_POR_HORA = 60;

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

// Los códigos de caso y paciente salen de nextCaseCode/nextPatientCode
// (packages/database/src/codes.ts): consecutivos y compartidos con el resto
// del sistema. Antes esta ruta tenía sus propios formatos, `WI-2026-12345` y
// `PM-123456`, ninguno de los dos verificado contra duplicados.

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ clinicId: string }> },
): Promise<NextResponse> {
  const { clinicId } = await ctx.params;

  // Es el único endpoint público que CREA registros: sin freno, un script deja
  // la base con miles de pacientes y casos fantasma, y de paso quema la serie
  // de códigos consecutivos, que es global y no se recicla.
  //
  // 10 altas cada 15 minutos por IP. El kiosco es una tablet en el mostrador:
  // toda la recepción comparte esa IP, así que el techo se puso sobre lo que
  // da un mostrador ocupado, no sobre lo que tipea una persona.
  const freno = rateLimit(claveDeIp(req, 'walkin'), { max: 10, ventanaMs: 15 * 60_000 });
  if (!freno.ok) {
    return NextResponse.json(
      { ok: false, error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

  // Verify clinic exists
  const clinic = await db.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) return NextResponse.json({ ok: false, error: 'CLINIC_NOT_FOUND' }, { status: 404 });

  let parsed;
  try {
    const body = await req.json();
    parsed = BodySchema.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }
  if (!fechaNacimientoValida(parsed.dob)) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  // Techo compartido entre instancias: el freno por IP de arriba vive en memoria.
  const altasRecientes = await db.auditLog.count({
    where: { action: 'WALKIN_CASE_CREATED', createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
  });
  if (altasRecientes >= ALTAS_MAX_POR_HORA) {
    return NextResponse.json(
      { ok: false, error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  const token = generateToken();

  // ¿Hay una ficha que reutilizar? Solo si teléfono + apellido + nacimiento
  // coinciden, y solo mientras ese teléfono no haya acumulado fallos.
  const claveTelefono = `phone:${parsed.phone.replace(/\D/g, '').slice(-10)}`;
  const fallos = await db.auditLog.count({
    where: {
      action: 'WALKIN_MATCH_FAILED', entityType: 'patients', entityId: claveTelefono,
      createdAt: { gte: new Date(Date.now() - VENTANA_MS) },
    },
  });

  let reutilizable: { id: string } | null = null;
  if (fallos < FALLOS_MAX) {
    const candidatos = await db.patient.findMany({
      where: { phone: parsed.phone },
      select: { id: true, lastName: true, dateOfBirth: true },
      take: 10,
    });
    // El nacimiento se guarda como instante UTC: el día de calendario es el de
    // `toISOString()`, sin zona (ver /api/cita).
    reutilizable = elegirFichaReutilizable(candidatos, parsed.dob, parsed.lastName, decryptFieldOrOriginal);

    if (!reutilizable && candidatos.length > 0) {
      await writeAuditLog(db, {
        actorType: 'SYSTEM', action: 'WALKIN_MATCH_FAILED',
        entityType: 'patients', entityId: claveTelefono,
        ipAddress: claveDeIp(req, 'walkin').slice('walkin:'.length),
        userAgent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
        metadata: { clinicId },
      });
    }
  }

  // Paciente y caso en una sola transacción: es donde vive el advisory lock de
  // los códigos consecutivos, y además evita que un fallo al crear el caso deje
  // un paciente huérfano (antes eran dos escrituras sueltas).
  const newCase = await db.$transaction(async (tx) => {
    const patient = reutilizable ?? await tx.patient.create({
      data: {
        firstName:         parsed.firstName,
        lastName:          parsed.lastName,
        phone:             parsed.phone,
        dateOfBirth:       new Date(parsed.dob),
        preferredLanguage: parsed.language,
        patientCode:       await nextPatientCode(tx),
      },
      select: { id: true },
    });

    // Create case with WALK_IN source + unique portal token
    return tx.case.create({
      data: {
        patientId:   patient.id,
        caseCode:    await nextCaseCode(tx, 'WI'),
        source:      'WALK_IN',
        status:      'INTAKE_PENDING',
        portalToken: token,
        intakeFormSentAt: new Date(),
      },
      select: { id: true, caseCode: true },
    });
  });

  await writeAuditLog(db, {
    actorType:  'SYSTEM',
    actorUserId: null,
    action:     'WALKIN_CASE_CREATED',
    entityType: 'cases',
    entityId:   newCase.id,
    metadata: { caseCode: newCase.caseCode, clinicId, source: 'WALK_IN', fichaReutilizada: !!reutilizable },
  });

  return NextResponse.json({ ok: true, token });
}

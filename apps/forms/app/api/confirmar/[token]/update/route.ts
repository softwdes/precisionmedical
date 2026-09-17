/**
 * F1 — Confirmación de cita · PATCH de corrección de datos del paciente
 *
 * PATCH /api/confirmar/[token]/update
 *
 * Es el "Update" del v2: el paciente abre el documento de confirmación, ve que
 * su teléfono está viejo o que falta su contacto de emergencia, lo corrige ahí
 * mismo y recién entonces firma.
 *
 * Escribe los MISMOS campos de `Patient` que el paso 2/3 del wizard de
 * admisión, con las mismas protecciones. Cinco cosas que decide esta ruta:
 *
 *  · **El paciente sale del token, nunca del cuerpo del pedido.** Mismo criterio
 *    que la ruta de firma: si viniera del body, este link editaría la ficha de
 *    cualquiera.
 *  · **Se cierra cuando la cita ya está firmada.** El documento firmado no puede
 *    cambiar debajo de la firma.
 *  · **Los enums se validan contra una lista blanca.** Un valor inventado no
 *    tiene que llegar a Prisma como excepción sin mensaje.
 *  · **Los campos cifrados se protegen** — ver `lib/campos-cifrados.ts`. Sin
 *    esto, un paciente cuya ciudad sigue en `e:…` vería el campo vacío y al
 *    guardar destruiría el dato.
 *  · **El audit guarda ANTES y DESPUÉS.** Es un cambio de PHI hecho desde un
 *    link público minutos antes de una firma: si mañana alguien pregunta por qué
 *    cambió una dirección, esta es la única respuesta posible.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { protegerCifrados } from '@/lib/campos-cifrados';
import { formatPhone, isValidNANP } from '@/lib/telefono';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

/**
 * Más holgado que el de la firma: acá el paciente puede guardar varias veces
 * (corrige el teléfono, guarda, se acuerda del contacto de emergencia, guarda
 * de nuevo). Y la IP es la del WiFi de la sala de espera — ver el comentario
 * del freno en `app/confirmar/[token]/page.tsx`.
 */
const FRENO_UPDATE = { max: 40, ventanaMs: 10 * 60_000 };

// ─── Listas blancas ───────────────────────────────────────────────────────────

const SEXO      = ['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY'];
const CIVIL     = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED', 'OTHER'];
const RAZA      = ['AFRICAN_AMERICAN', 'AMERICAN_INDIAN_ALASKA_NATIVE', 'ASIAN',
                   'NATIVE_HAWAIIAN', 'PACIFIC_ISLANDER', 'WHITE', 'OTHER', 'PREFER_NOT_TO_SAY'];
const ETNIA     = ['HISPANIC_LATINO', 'NOT_HISPANIC_LATINO', 'PREFER_NOT_TO_SAY'];
const CONTACTO  = ['PHONE', 'EMAIL', 'TEXT', 'ANY'];
const IDIOMA    = ['es', 'en'];
const REFERIDO  = ['LAW_FIRM', 'WEB_SEARCH', 'ACCIDENT_CENTER', 'FACEBOOK', 'FAMILY',
                   'GOOGLE', 'GOOGLE_MAPS', 'INSTAGRAM', 'WEBSITE', 'CLINIC_STAFF',
                   'CHIROPRACTOR', 'REFERRAL', 'PATIENT_REFERRAL', 'INSURANCE', 'TIKTOK', 'OTHER'];

/**
 * La relación del contacto de emergencia es TEXTO LIBRE en la base, no un enum:
 * la data del v2 trae 167 valores distintos escritos a mano. Así que no hay
 * lista blanca — solo un tope de largo, como cualquier texto libre.
 */
const LARGO_MAX = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Texto libre: recortado, con tope, y `null` cuando queda vacío. */
function texto(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, LARGO_MAX);
  return s.length ? s : null;
}

/** Valor de enum: solo pasa si está en la lista; el vacío borra. */
function enumDe(v: unknown, lista: string[]): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return null;
  return lista.includes(s) ? s : undefined;
}

/**
 * Teléfono listo para guardar, con el MISMO formato que usa el wizard de
 * admisión: `(801) 555-0100`.
 *
 * No son los dígitos pelados, aunque para una base de datos serían más
 * prolijos. Si esta ruta guardara `8015550100` y el wizard `(801) 555-0100`, un
 * paciente que pasa por las dos puertas se reescribiría el teléfono solo en
 * cada vuelta — y el historial de la ficha se llenaría de "cambios" que nadie
 * hizo. Se detectó así: la primera prueba de esta pantalla dejó en el audit un
 * cambio de teléfono que el paciente no había tocado.
 *
 * Devuelve `undefined` (o sea: no se guarda) si lo escrito no es un teléfono
 * válido. El cliente ya valida y muestra el error; este es el freno del lado
 * del servidor, y ante la duda prefiere no pisar lo que había.
 */
function telefono(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return null;
  return isValidNANP(s) ? formatPhone(s) : undefined;
}

/** `YYYY-MM-DD` a mediodía local — la fecha de nacimiento no lleva zona. */
function fechaNacimiento(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split('-').map(Number);
  const fecha = new Date(y!, m! - 1, d!, 12, 0, 0, 0);
  // Una fecha imposible ("2026-02-31") rebota al mes siguiente: se descarta.
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m! - 1 || fecha.getDate() !== d) return undefined;
  // Ni el futuro ni 1890: el que se equivoca de año no tiene que enterarse
  // recién cuando el seguro le rechaza el reclamo.
  const hoy = new Date();
  if (fecha > hoy) return undefined;
  if (fecha.getFullYear() < 1900) return undefined;
  return fecha;
}

/** Correo: lo mínimo para no guardar basura. Vacío borra. */
function correo(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, LARGO_MAX);
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : undefined;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const freno = rateLimit(claveDeIp(req, 'confirmar-update'), FRENO_UPDATE);
  if (!freno.ok) {
    return NextResponse.json(
      { ok: false, error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

  const appt = await db.appointment.findUnique({
    where: { signToken: token },
    select: {
      id:                 true,
      status:             true,
      attendanceSignedAt: true,
      signTokenExpiresAt: true,
      case:    { select: { caseCode: true } },
      patient: {
        select: {
          id: true, patientCode: true,
          firstName: true, lastName: true, dateOfBirth: true,
          email: true, phone: true, phone2: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          sex: true, maritalStatus: true, race: true, ethnicity: true,
          preferredLanguage: true, communicationPreference: true,
          referralSource: true, referralSourceOther: true,
          preferredPharmacy: true, employer: true,
          emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
          emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
        },
      },
    },
  });

  if (!appt) {
    return NextResponse.json({ ok: false, error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }
  if (!appt.signTokenExpiresAt || appt.signTokenExpiresAt <= new Date()) {
    return NextResponse.json({ ok: false, error: 'TOKEN_EXPIRED' }, { status: 410 });
  }
  // Firmado es firmado: lo que se confirmó no se edita por esta puerta. La
  // corrección posterior la hace el staff desde la ficha, que queda a su nombre.
  if (appt.attendanceSignedAt) {
    return NextResponse.json({ ok: false, error: 'ALREADY_SIGNED' }, { status: 409 });
  }
  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') {
    return NextResponse.json({ ok: false, error: 'APPOINTMENT_NOT_SIGNABLE' }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const poner = (campo: string, valor: unknown) => {
    if (valor !== undefined) data[campo] = valor;
  };

  // Nombre y apellido son los únicos que NO pueden quedar vacíos: sin ellos la
  // ficha deja de ser identificable y el documento sale firmado por nadie.
  const nombre   = texto(body.firstName);
  const apellido = texto(body.lastName);
  if (nombre   !== undefined && nombre   === null) return NextResponse.json({ ok: false, error: 'NAME_REQUIRED' }, { status: 400 });
  if (apellido !== undefined && apellido === null) return NextResponse.json({ ok: false, error: 'NAME_REQUIRED' }, { status: 400 });
  poner('firstName', nombre);
  poner('lastName',  apellido);

  /**
   * La fecha de nacimiento tampoco se borra: decide quién puede firmar.
   *
   * Y solo se escribe si el DÍA cambió de verdad. Lo guardado es un `timestamp`
   * y acá se arma a mediodía local, así que reescribirlo con el mismo día le
   * movía la hora en cada guardado: un cambio invisible, que ensucia el
   * historial y que es justo de donde salen los off-by-one de un día.
   */
  if (typeof body.dateOfBirth === 'string' && body.dateOfBirth.trim()) {
    const dob = fechaNacimiento(body.dateOfBirth);
    if (!dob) return NextResponse.json({ ok: false, error: 'INVALID_DOB' }, { status: 400 });
    const yaGuardada = appt.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null;
    if (yaGuardada !== body.dateOfBirth.trim()) poner('dateOfBirth', dob);
  }

  const email = correo(body.email);
  if (email === undefined && body.email !== undefined && typeof body.email === 'string' && body.email.trim()) {
    return NextResponse.json({ ok: false, error: 'INVALID_EMAIL' }, { status: 400 });
  }
  poner('email', email);

  poner('phone',  telefono(body.phone));
  poner('phone2', telefono(body.phone2));

  poner('addressLine1', texto(body.addressLine1));
  poner('addressCity',  texto(body.addressCity));
  poner('addressState', texto(body.addressState));
  poner('addressZip',   texto(body.addressZip));

  poner('sex',           enumDe(body.sex, SEXO));
  poner('maritalStatus', enumDe(body.maritalStatus, CIVIL));
  poner('race',          enumDe(body.race, RAZA));
  poner('ethnicity',     enumDe(body.ethnicity, ETNIA));

  poner('preferredLanguage',       enumDe(body.preferredLanguage, IDIOMA));
  poner('communicationPreference', enumDe(body.communicationPreference, CONTACTO));

  // `referralSourceOther` solo existe cuando la fuente es OTHER; en cualquier
  // otro caso se limpia, para que no quede un texto huérfano contradiciendo al
  // enum. Mismo criterio que el paso 2 del wizard.
  const fuente = enumDe(body.referralSource, REFERIDO);
  if (fuente !== undefined) {
    data.referralSource = fuente;
    data.referralSourceOther = fuente === 'OTHER' ? (texto(body.referralSourceOther) ?? null) : null;
  }

  poner('preferredPharmacy', texto(body.preferredPharmacy));
  poner('employer',          texto(body.employer));

  poner('emergencyContactName',     texto(body.emergencyContactName));
  poner('emergencyContactPhone',    telefono(body.emergencyContactPhone));
  poner('emergencyContactRelation', texto(body.emergencyContactRelation));
  poner('emergency2Name',           texto(body.emergency2Name));
  poner('emergency2Phone',          telefono(body.emergency2Phone));
  poner('emergency2Relation',       texto(body.emergency2Relation));

  const guardado = appt.patient as unknown as Record<string, string | null>;
  protegerCifrados(data, guardado);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, sinCambios: true });
  }

  // Qué cambió DE VERDAD — el formulario manda la ficha entera, así que la
  // mayoría de los campos llegan iguales a lo guardado. Sin este filtro el
  // audit registraría veinte "cambios" por cada corrección de un teléfono.
  // `Prisma.JsonValue` y no `unknown`: son las columnas `before`/`after` del
  // audit, que son jsonb.
  const antes: Record<string, string | null> = {};
  const despues: Record<string, string | null> = {};
  for (const [campo, nuevo] of Object.entries(data)) {
    const viejo = (appt.patient as unknown as Record<string, unknown>)[campo] ?? null;
    const iguales = viejo instanceof Date && nuevo instanceof Date
      ? viejo.getTime() === nuevo.getTime()
      : viejo === nuevo;
    if (iguales) continue;
    // Todo lo editable es texto o fecha; la fecha va como `YYYY-MM-DD` para que
    // el historial se lea sin tener que interpretar una zona horaria.
    const comoTexto = (v: unknown): string | null =>
      v instanceof Date ? v.toISOString().slice(0, 10) : (v == null ? null : String(v));
    antes[campo]   = comoTexto(viejo);
    despues[campo] = comoTexto(nuevo);
  }

  if (Object.keys(despues).length === 0) {
    return NextResponse.json({ ok: true, sinCambios: true });
  }

  try {
    await db.patient.update({ where: { id: appt.patient.id }, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('P2002') || msg.includes('Unique constraint')) {
      // Pasa de verdad: en una familia se comparte el correo. El mensaje lo
      // arma el cliente en el idioma que eligió el paciente.
      const campo = msg.includes('email') ? 'email' : msg.includes('phone') ? 'phone' : 'unknown';
      return NextResponse.json({ ok: false, error: 'DUPLICATE_FIELD', field: campo }, { status: 409 });
    }
    console.error('[confirmar update] error:', msg);
    return NextResponse.json({ ok: false, error: 'SAVE_FAILED' }, { status: 500 });
  }

  // Con `await`, no best-effort: es PHI cambiada desde un link público. Si la
  // constancia no se puede escribir, mejor enterarse ahora que después.
  await writeAuditLog(db, {
    actorType:   'SYSTEM',
    actorUserId: null,
    action:      'PATIENT_SELF_UPDATE',
    entityType:  'Patient',
    entityId:    appt.patient.id,
    // `before`/`after` son COLUMNAS del audit, no metadata: es de donde sale el
    // historial de la ficha en el back-office. Meterlos adentro de `metadata`
    // los dejaría invisibles para ese lector.
    before:      antes,
    after:       despues,
    ipAddress:   req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
    userAgent:   req.headers.get('user-agent'),
    metadata: {
      via:           'PATIENT_QR',
      appointmentId: appt.id,
      caseCode:      appt.case?.caseCode ?? null,
      patientCode:   appt.patient.patientCode,
      campos:        Object.keys(despues),
      token:         token.slice(0, 8) + '…',
    },
  });

  return NextResponse.json({ ok: true, campos: Object.keys(despues) });
}

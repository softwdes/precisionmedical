import crypto from 'crypto';
import { db } from '@precision-medical/database';

/**
 * Cliente ScriptSure / DAW Systems (D4 — prescripción electrónica).
 * Solo staging por ahora — hosts de producción se agregan recién al certificar
 * (ver [[scriptsure-daw-integration]] en memoria).
 */

const HOSTS = {
  staging: {
    backendPlatform: 'https://spa.scriptsure.com',
    backendScriptSure: 'https://ssa.scriptsure.com',
    frontend: 'https://ssu.scriptsure.com',
    frontendPlatform: 'https://spu.scriptsure.com',
  },
} as const;

function hosts() {
  return HOSTS.staging;
}

function apiKey(): string {
  const key = process.env.SCRIPTSURE_API_KEY;
  if (!key) throw new Error('SCRIPTSURE_API_KEY no está configurado en .env.local');
  return key;
}

function secret(): string {
  const s = process.env.SCRIPTSURE_SECRET;
  if (!s) throw new Error('SCRIPTSURE_SECRET no está configurado en .env.local');
  return s;
}

/** apikey header: `<apiKey>~<hmac-sha1 hex de apiKey_secret_epochMs>~<epochMs>` */
function buildApiKeyHeader(): string {
  const key = apiKey();
  const epochMs = Date.now();
  const payload = `${key}_${secret()}_${epochMs}`;
  const hash = crypto.createHmac('sha1', secret()).update(payload).digest('hex');
  return `${key}~${hash}~${epochMs}`;
}

interface ScriptSureLoginResponse {
  sessionToken: string;
  [key: string]: unknown;
}

/**
 * Login real contra ScriptSure (Vendor Login). El sessionToken dura 12h y
 * queda atado a la identidad del `loginEmail` — no es intercambiable entre
 * usuarios. Se cachea en `ScriptSureSession` (obligatorio: prohibido re-loguear
 * si ya hay uno vigente).
 */
async function login(loginEmail: string): Promise<string> {
  const res = await fetch(`${hosts().backendPlatform}/v3/login/byapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: buildApiKeyHeader(),
    },
    body: JSON.stringify({ apikey: buildApiKeyHeader(), email: loginEmail }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ScriptSure login falló (${res.status}): ${text}`);
  }

  const data = (await res.json()) as ScriptSureLoginResponse;
  if (!data.sessionToken) throw new Error('ScriptSure login no devolvió sessionToken');

  await db.scriptSureSession.upsert({
    where: { loginEmail },
    create: {
      loginEmail,
      sessionToken: data.sessionToken,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
    update: {
      sessionToken: data.sessionToken,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  });

  return data.sessionToken;
}

/**
 * Devuelve un sessionToken vigente para `loginEmail`, reusando el cacheado si
 * todavía no vence (con 5 min de margen) — nunca relogueamos de más.
 */
export async function getSessionToken(loginEmail: string): Promise<string> {
  const cached = await db.scriptSureSession.findUnique({ where: { loginEmail } });
  const marginMs = 5 * 60 * 1000;
  if (cached && cached.expiresAt.getTime() - marginMs > Date.now()) {
    return cached.sessionToken;
  }
  return login(loginEmail);
}


/**
 * Una llamada a ScriptSure que sobrevive a los dos fallos que vimos de verdad.
 *
 * **401 — el token cacheado ya no vale.** Guardamos el `sessionToken` 12 h, pero
 * ese plazo lo calculamos NOSOTROS: si del lado de ellos la sesión se invalida
 * antes —y pasa, porque hoy varias personas comparten la misma cuenta de
 * ScriptSure y entrar o salir puede tumbar la sesión de los demás— seguimos
 * mandando un token muerto hasta que se cumpla nuestro reloj. Ahí se reloguea
 * UNA vez y se reintenta. Esto no contradice su regla de "no relogear si hay un
 * token válido": un token que ellos rechazan no es válido.
 *
 * **403 — su WAF.** Los 403 vienen del load balancer, no de la app, y se liberan
 * solos (rate-limiting documentado). Se reintenta UNA vez con el MISMO token,
 * sin relogear: relogear de más es justo lo que dispara el WAF.
 *
 * Un solo reintento, nunca un bucle: sus reglas de uso prohíben los reintentos
 * continuos y nos monitorean.
 */
async function llamarConSesion(
  loginEmail: string,
  hacer: (token: string) => Promise<Response>,
): Promise<Response> {
  const token = await getSessionToken(loginEmail);
  let res: Response;
  try {
    res = await hacer(token);
  } catch (err) {
    // Fallo de red: un reintento con el mismo token.
    await new Promise((r) => setTimeout(r, 400));
    return hacer(token);
  }

  if (res.status === 401) {
    const nuevo = await login(loginEmail);   // upsertea la sesión nueva
    return hacer(nuevo);
  }
  if (res.status === 403) {
    await new Promise((r) => setTimeout(r, 700));
    return hacer(token);
  }
  return res;
}

/**
 * Set Practice & Prescriber — obligatorio antes de cualquier otra llamada de
 * paciente/receta, y hay que repetirlo cada vez que cambia el prescriptor.
 */
export async function setPracticePrescriber(
  loginEmail: string,
  practiceId: number,
  prescriberId: number,
): Promise<void> {
  const res = await llamarConSesion(loginEmail, (token) => fetch(
    `${hosts().backendPlatform}/v3/user/practice/prescriber?sessiontoken=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceId, prescriberId }),
    },
  ));

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ScriptSure set practice/prescriber falló (${res.status}): ${text}`);
  }

  await db.scriptSureSession.update({
    where: { loginEmail },
    data: { practiceId, prescriberId },
  });
}

/** Nombres/apellidos: solo ASCII, letras/espacio/apóstrofe/guion — igual regla que usan para pacientes y prescriptores. */
function asciiName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z '-]/g, '')
    .trim();
}

const GENDER_MAP: Record<string, 'M' | 'F' | 'U'> = {
  MALE: 'M',
  FEMALE: 'F',
  NON_BINARY: 'U',
  OTHER: 'U',
  PREFER_NOT_TO_SAY: 'U',
};

/** ScriptSure exige el código postal USPS de 2 letras; la data migrada del v2 trae nombres completos ("Utah"). */
const US_STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'puerto rico': 'PR',
};

function toStateCode(state: string): string {
  const trimmed = state.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return US_STATE_CODES[trimmed.toLowerCase()] ?? trimmed;
}

export interface ScriptSurePatientInput {
  firstName: string;
  lastName: string;
  dob: Date;
  sex: string | null;
  addressLine1: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  phone: string | null;
  phone2: string | null;
}

/**
 * ScriptSure exige calle+ciudad+estado+ZIP para crear un paciente — no son
 * opcionales pese a que la doc dice "no manden campos vacíos" (eso aplica a
 * los campos que SÍ tenés, no los vuelve opcionales). Mucha data migrada del
 * v2 no tiene calle — ver [[scriptsure-daw-integration]].
 */
export class ScriptSurePatientDataError extends Error {
  constructor(public readonly missingFields: string[]) {
    super(`Al paciente le faltan campos obligatorios para ScriptSure: ${missingFields.join(', ')}`);
    this.name = 'ScriptSurePatientDataError';
  }
}

/**
 * Create Patient — obligatorio antes de lanzar cualquier widget atado a un
 * paciente (Drug List, Pharmacy, etc). Devuelve el `patientId` propio de
 * ScriptSure.
 */
async function createScriptSurePatient(
  loginEmail: string,
  practiceId: number,
  prescriberId: number,
  patient: ScriptSurePatientInput,
): Promise<number> {
  const missingFields: string[] = [];
  if (!patient.addressLine1) missingFields.push('addressLine1');
  if (!patient.addressCity) missingFields.push('city');
  if (!patient.addressState) missingFields.push('state');
  if (!patient.addressZip) missingFields.push('zip');
  if (missingFields.length > 0) throw new ScriptSurePatientDataError(missingFields);

  const payload: Record<string, unknown> = {
    preferredCommunicationId: 0,
    consent: true,
    patientStatusId: 0,
    practiceId,
    doctorId: prescriberId,
    firstName: asciiName(patient.firstName),
    lastName: asciiName(patient.lastName),
    dob: patient.dob.toISOString().slice(0, 10),
    gender: (patient.sex && GENDER_MAP[patient.sex]) || 'U',
    addressLine1: patient.addressLine1!.slice(0, 40),
    city: patient.addressCity,
    state: toStateCode(patient.addressState!),
    zip: patient.addressZip!.replace(/[^0-9]/g, '').slice(0, 9),
  };
  const cell = (patient.phone ?? patient.phone2 ?? '').replace(/[^0-9]/g, '');
  if (cell) payload.cell = cell;

  const res = await llamarConSesion(loginEmail, (token) => fetch(
    `${hosts().backendScriptSure}/v3/patient?sessiontoken=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  ));

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ScriptSure create patient falló (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { savedPatientObj?: { patientId?: number } };
  const patientId = data.savedPatientObj?.patientId;
  if (!patientId) throw new Error('ScriptSure create patient no devolvió patientId');
  return patientId;
}

/**
 * Devuelve el `scriptsurePatientId` del paciente, creándolo en ScriptSure la
 * primera vez que haga falta (sync on-demand, nunca masivo — regla de uso de
 * DAW). Persiste el id devuelto para no volver a crear el mismo paciente.
 */
export async function getOrCreateScriptSurePatientId(
  loginEmail: string,
  practiceId: number,
  prescriberId: number,
  patient: { id: string; scriptsurePatientId: string | null } & ScriptSurePatientInput,
): Promise<number> {
  if (patient.scriptsurePatientId) return Number(patient.scriptsurePatientId);

  const patientId = await createScriptSurePatient(loginEmail, practiceId, prescriberId, patient);

  await db.patient.update({
    where: { id: patient.id },
    data: { scriptsurePatientId: String(patientId) },
  });

  return patientId;
}

/**
 * Widgets atados a UN paciente — la URL lleva su id de ScriptSure.
 *
 * `medcart` abre el carrito ya cargado: es el widget del "repetir receta".
 */
export type ScriptSurePatientWidget =
  | 'drug-list'
  | 'pharmacy'
  | 'medcart'
  | 'allergy'
  | 'drug-history'
  | 'medicationdownload'
  | 'approve-queue';

/**
 * Widgets de la practice entera, sin paciente en la URL.
 *
 * `message` es la bandeja completa de recetas (renovaciones que pide la
 * farmacia, cola de aprobación, cambios, anulaciones y errores de envío) con
 * sus propias acciones — Represcribe, Approve, Deny, Edit. Es la pieza que del
 * lado nuestro no existía: sin ella, un rechazo de farmacia no se entera nadie.
 */
export type ScriptSurePracticeWidget =
  | 'message'
  | 'prescription-queue'
  | 'auditlog'
  | 'report'
  | 'setting';

export type ScriptSureWidget = ScriptSurePatientWidget | ScriptSurePracticeWidget;

/** El tema oscuro de ScriptSure es el que empata con el portal médico. */
const WIDGET_PARAMS = 'darkmode=on';

/**
 * URL para embeber un widget de paciente (iframe). Requiere que ya se haya
 * hecho login + Set Practice/Prescriber para `loginEmail` en esta sesión.
 */
export async function getScriptSureWidgetUrl(
  loginEmail: string,
  widget: ScriptSurePatientWidget,
  patientId: number,
): Promise<string> {
  const sessionToken = await getSessionToken(loginEmail);
  return `${hosts().frontend}/widgets/${widget}/${patientId}?sessiontoken=${sessionToken}&${WIDGET_PARAMS}`;
}

/**
 * URL de un widget de la practice — no lleva paciente.
 *
 * `providers=all` hace que la bandeja muestre lo de todos los prescriptores de
 * la practice, no solo el de la sesión: una renovación puede llegar mientras el
 * doctor que la firmó está de vacaciones, y alguien tiene que verla.
 */
export async function getScriptSurePracticeWidgetUrl(
  loginEmail: string,
  widget: ScriptSurePracticeWidget,
  practiceId: number,
): Promise<string> {
  const sessionToken = await getSessionToken(loginEmail);

  // La configuración es el único que rompe el patrón: su ruta es
  // `/widgets/setting/1/:practiceId` — el `1` es la pestaña inicial de su UI.
  const path = widget === 'setting' ? `setting/1/${practiceId}` : widget;

  const providers = widget === 'message' ? '&providers=all' : '';
  return `${hosts().frontend}/widgets/${path}?sessiontoken=${sessionToken}&${WIDGET_PARAMS}${providers}`;
}

export interface MedCartDrug {
  drugName: string;
  routedMedId: string | null;
  gcnSeqno: string | null;
  ndc: string | null;
  rxNorm: string | null;
  scriptsureDrugId: string | null;
  pharmacyId: string | null;
  quantityQualifier: string | null;
  quantity: number;
  refills: number;
  sig: string | null;
  daysSupply: number | null;
  /** Presentación del fármaco ("600 mg tablet") — `line1` en el modelo de ScriptSure */
  line1: string | null;
  /** Tipo del código RxNorm: SCD (genérico), SBD (marca), GPK, UN… */
  rxNormQualifier: string | null;
  /**
   * El objeto del fármaco tal como lo devolvió ScriptSure. Cuando está, se usa
   * como base del ítem del carrito — trae metadatos que su envío exige y que no
   * tienen columna propia.
   */
  raw?: Record<string, unknown> | null;
}

export interface MedCartResult {
  ok: boolean;
  /** Respuesta cruda de ScriptSure — se registra en auditoría para ajustar el
   *  mapeo si su formato no coincide con lo asumido. */
  raw: unknown;
  status: number;
  step: 'duplicates' | 'add' | 'read';
  /** Qué pasó al vaciar el carrito antes de cargar (queda en auditoría) */
  clear?: unknown;
}

/**
 * Vacía el carrito del paciente. Intenta el borrado masivo y, si no funciona,
 * cae a borrar ítem por ítem leyendo el carrito — no confiamos en que un solo
 * endpoint responda como esperamos, y el síntoma de que falle (recetas ajenas
 * apareciendo al repetir) es confuso para el doctor.
 */
async function clearMedCart(
  base: string,
  sessionToken: string,
  patientId: number,
): Promise<Record<string, unknown>> {
  const info: Record<string, unknown> = {};

  try {
    const res = await fetch(`${base}/v3/medcart/clear/${patientId}?sessiontoken=${sessionToken}`, {
      method: 'DELETE',
    });
    info.bulkStatus = res.status;
    info.bulkRaw = (await res.text()).slice(0, 300);
  } catch (err) {
    info.bulkError = String(err).slice(0, 200);
  }

  // Verificar qué quedó y borrar uno por uno lo que siga ahí
  try {
    const readRes = await fetch(`${base}/v3/medcart/patient/${patientId}?sessiontoken=${sessionToken}`);
    const readTxt = await readRes.text();
    info.afterBulkStatus = readRes.status;

    let items: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(readTxt) as Record<string, unknown>;
      const cart = (parsed.medcart ?? parsed) as Record<string, unknown>;
      const list = (cart.items ?? cart.prescriptions ?? parsed) as unknown;
      if (Array.isArray(list)) items = list as Array<Record<string, unknown>>;
    } catch { /* si no parsea, queda el crudo en info */ }

    info.remaining = items.length;
    if (items.length === 0) { info.rawAfterBulk = readTxt.slice(0, 300); return info; }

    const deleted: number[] = [];
    for (const it of items) {
      const rxId = it.rxId ?? it.prescriptionId ?? it.id;
      if (rxId === undefined || rxId === null) continue;
      const d = await fetch(`${base}/v3/medcart/${patientId}/${String(rxId)}?sessiontoken=${sessionToken}`, {
        method: 'DELETE',
      });
      deleted.push(d.status);
    }
    info.itemDeleteStatuses = deleted;
  } catch (err) {
    info.readError = String(err).slice(0, 200);
  }

  return info;
}

/**
 * Pre-carga un medicamento en el carrito de recetas del paciente (MedCart) para
 * que el widget abra con todo puesto — es el mecanismo oficial de ScriptSure
 * para "repetir" una receta.
 *
 * El esquema NO está en la documentación disponible: se dedujo campo por campo
 * leyendo su propia validación en intentos reales (2026-08-05). Por eso esta
 * función DEVUELVE LA RESPUESTA CRUDA — es lo que permite ajustar sin adivinar
 * cuando su contrato cambia o aparece un campo nuevo.
 *
 *   duplicates → { drugKeys: [...] }
 *   add        → { prescriptions: [...] }
 */
export async function addToMedCart(
  loginEmail: string,
  patientId: number,
  drug: MedCartDrug,
  ctx?: { practiceId?: number; doctorId?: number },
): Promise<MedCartResult> {
  const sessionToken = await getSessionToken(loginEmail);
  const base = hosts().backendScriptSure;

  // El carrito de ScriptSure es ACUMULATIVO y persiste entre sesiones: si no se
  // vacía, "repetir" una receta muestra también todo lo cargado antes (incluidos
  // los intentos fallidos). Es seguro vaciarlo: es un borrador, nada de lo ya
  // enviado a farmacia vive ahí.
  //
  // NO se silencia el resultado: la primera versión usaba `.catch(() => {})` y
  // cuando el clear falló nos quedamos sin saber por qué. Se reporta.
  const clearInfo = await clearMedCart(base, sessionToken, patientId);

  // El add NO deduplica solo (documentado): primero se consulta duplicados por
  // ROUTED_MED_ID + GCN_SEQNO para no cargar dos veces el mismo fármaco.
  //
  // Contrato deducido de su propia validación, un campo por intento (2026-08-05):
  //   1) array         -> "Expected object, received array"
  //   2) objeto plano  -> falta ["drugKeys"] (array)
  //   3) con drugKeys  -> falta ["prescriptions"] (array)
  // Quedan las dos listas: los identificadores a comparar y las recetas contra
  // las que comparar.
  const drugKey = {
    ROUTED_MED_ID: drug.routedMedId,
    GCN_SEQNO: drug.gcnSeqno,
    drugName: drug.drugName,
    Ndc: drug.ndc,
    RxNorm: drug.rxNorm,
  };
  const dupBody = { drugKeys: [drugKey] };

  const dupRes = await fetch(
    `${base}/v3/medcart/patient/${patientId}/duplicates/check?sessiontoken=${sessionToken}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dupBody) },
  );
  const dupRaw = await dupRes.text();
  if (!dupRes.ok) {
    return { ok: false, raw: dupRaw.slice(0, 1200), status: dupRes.status, step: 'duplicates', clear: clearInfo };
  }

  // Forma REAL del medicamento, capturada del flujo nativo del widget
  // (POST /v3/drughistory/prescription, 2026-08-05): `PrescriptionDrugs` vive
  // DENTRO de `prescription`, con ids numéricos y nombres en el casing exacto
  // de su modelo (ndc/rxnorm en minúscula, ROUTED_MED_ID/GCN_SEQNO en mayúscula).
  const num = (v: string | null): number | null => {
    if (v === null) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  // El objeto original que nos dio ScriptSure, si lo tenemos, es la mejor base:
  // trae los metadatos del fármaco (MED_NAME_TYPE_CD, MED_REF_*) y la indicación
  // estructurada que su mensaje a la farmacia exige y que no vale la pena
  // reconstruir a mano. Solo se normaliza el casing (su historial devuelve
  // `Ndc`/`RxNorm`, su carrito espera `ndc`/`rxnorm`) y se descarta lo que
  // pertenece al envío anterior.
  const raw = drug.raw ?? {};
  const { Ndc: _n, RxNorm: _r, prescriptionId: _pid, reconcileStatus: _rs, drugId: _did, ...rawRest } = raw;

  const prescriptionDrug = {
    ...rawRest,
    drugOrder: 1,
    drugName: drug.drugName,
    ndc: drug.ndc,
    rxnorm: drug.rxNorm,
    // Sin el calificador el mensaje NCPDP a la farmacia se rechaza: valida
    // contra un conjunto cerrado y el vacío no está en él. Si el historial no
    // lo trajo, se deduce del tipo de nombre (2 = genérico → SCD, 1 = marca).
    rxnormQualifier: drug.rxNormQualifier ?? 'SCD',
    ROUTED_MED_ID: num(drug.routedMedId),
    GCN_SEQNO: num(drug.gcnSeqno),
    quantity: drug.quantity,
    ...(drug.quantityQualifier ? { quantityQualifier: drug.quantityQualifier } : {}),
    calculate: true,
    useSubstitution: true,
    // line1 = presentación ("600 mg tablet"); epn = nombre + presentación
    ...(drug.line1 ? { line1: drug.line1, epn: `${drug.drugName} ${drug.line1}`.trim() } : {}),
    // drugDuration es una FECHA en texto ("2026-08-15" = hoy + días de
    // suministro), no un número — así lo manda su propio widget y así lo
    // exige su validación ("Expected string, received number").
    ...(drug.daysSupply
      ? { drugDuration: new Date(Date.now() + drug.daysSupply * 86400000).toISOString().slice(0, 10) }
      : {}),
  };

  const addBody = {
    prescriptions: [{
      prescription: {
        ...(drug.sig ? { PrescriptionScript: { drugFormat: drug.sig } } : {}),
        PrescriptionDrugs: [prescriptionDrug],
        // patientId es obligatorio y NUMÉRICO — su validación lo dijo con esas
        // palabras ("patientId must be a number"). doctorId y practiceId van
        // por adelantado: son los que suele pedir a continuación.
        patientId,
        ...(ctx?.doctorId ? { doctorId: ctx.doctorId, userId: ctx.doctorId } : {}),
        ...(ctx?.practiceId ? { practiceId: ctx.practiceId } : {}),
        refill: drug.refills,
        // La farmacia se resuelve por su código NCPDP; el nombre es solo texto
        ...(drug.pharmacyId ? { pharmacyId: drug.pharmacyId } : {}),
        ...(drug.daysSupply ? { duration: drug.daysSupply } : {}),

        // fillDate/writtenDate SÍ los acepta aunque su eco no los devuelva —
        // con ellos la UI mostraba Fill Date y al quitarlos volvió a "—".
        // Lección: el eco del add no es un espejo completo.
        fillDate: new Date().toISOString(),
        writtenDate: new Date().toISOString(),
      },
    }],
  };

  const addRes = await fetch(
    `${base}/v3/medcart/add/${patientId}?sessiontoken=${sessionToken}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addBody) },
  );
  const addRaw = await addRes.text();
  if (!addRes.ok) {
    return { ok: false, raw: addRaw.slice(0, 1200), status: addRes.status, step: 'add', clear: clearInfo };
  }

  return { ok: true, raw: addRaw.slice(0, 1200), status: addRes.status, step: 'add', clear: clearInfo };
}

/**
 * Recetas que ScriptSure tiene registradas para el paciente (lo mismo que
 * muestra su widget `drug-history`). Endpoint descubierto observando las
 * llamadas del propio widget — no está en la doc que pudimos leer.
 *
 * Se llama SOLO por acción del usuario (al cerrar el widget de prescripción),
 * nunca en bucle ni por temporizador: DAW prohíbe el polling.
 */
export async function fetchScriptSureDrugHistory(
  loginEmail: string,
  patientId: number,
): Promise<Array<Record<string, unknown>>> {
  const res = await llamarConSesion(loginEmail, (token) => fetch(
    `${hosts().backendScriptSure}/v3/drughistory/current/${patientId}/0?sessiontoken=${token}`,
  ));

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ScriptSure drug history falló (${res.status}): ${text.slice(0, 200)}`);
  }

  const data: unknown = await res.json();
  // Devuelve un array plano, pero por si envuelven la lista más adelante
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const wrapped = (data as Record<string, unknown>)?.prescriptions ?? (data as Record<string, unknown>)?.items;
  return Array.isArray(wrapped) ? (wrapped as Array<Record<string, unknown>>) : [];
}

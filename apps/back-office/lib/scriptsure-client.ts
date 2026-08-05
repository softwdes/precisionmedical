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
 * Set Practice & Prescriber — obligatorio antes de cualquier otra llamada de
 * paciente/receta, y hay que repetirlo cada vez que cambia el prescriptor.
 */
export async function setPracticePrescriber(
  loginEmail: string,
  practiceId: number,
  prescriberId: number,
): Promise<void> {
  const sessionToken = await getSessionToken(loginEmail);
  const res = await fetch(
    `${hosts().backendPlatform}/v3/user/practice/prescriber?sessiontoken=${sessionToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceId, prescriberId }),
    },
  );

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

  const sessionToken = await getSessionToken(loginEmail);

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

  const res = await fetch(`${hosts().backendScriptSure}/v3/patient?sessiontoken=${sessionToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

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

/** `medcart` abre el carrito ya cargado — es el widget del "repetir receta". */
export type ScriptSureWidget = 'drug-list' | 'pharmacy' | 'medcart';

/**
 * URL para embeber un widget de ScriptSure (iframe). Requiere que ya se haya
 * hecho login + Set Practice/Prescriber para `loginEmail` en esta sesión.
 */
export async function getScriptSureWidgetUrl(
  loginEmail: string,
  widget: ScriptSureWidget,
  patientId: number,
): Promise<string> {
  const sessionToken = await getSessionToken(loginEmail);
  return `${hosts().frontend}/widgets/${widget}/${patientId}?sessiontoken=${sessionToken}&darkmode=on`;
}

export interface MedCartDrug {
  drugName: string;
  routedMedId: string | null;
  gcnSeqno: string | null;
  ndc: string | null;
  rxNorm: string | null;
  scriptsureDrugId: string | null;
  quantity: number;
  refills: number;
  sig: string | null;
  daysSupply: number | null;
}

export interface MedCartResult {
  ok: boolean;
  /** Respuesta cruda de ScriptSure — se registra en auditoría para ajustar el
   *  mapeo si su formato no coincide con lo asumido. */
  raw: unknown;
  status: number;
  step: 'duplicates' | 'add' | 'read';
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
): Promise<MedCartResult> {
  const sessionToken = await getSessionToken(loginEmail);
  const base = hosts().backendScriptSure;

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
    return { ok: false, raw: dupRaw.slice(0, 1200), status: dupRes.status, step: 'duplicates' };
  }

  // Cada entrada de `prescriptions` lleva los datos del fármaco afuera y un
  // objeto `prescription` adentro con los del envío — la misma forma que usa su
  // historial (ahí el anidado se llama `Prescription`, acá en minúscula).
  // Confirmado por su validación: path ["prescriptions", 0, "prescription"].
  const addBody = {
    prescriptions: [{
      drugName: drug.drugName,
      ROUTED_MED_ID: drug.routedMedId,
      GCN_SEQNO: drug.gcnSeqno,
      Ndc: drug.ndc,
      RxNorm: drug.rxNorm,
      drugId: drug.scriptsureDrugId,
      quantity: drug.quantity,
      prescription: {
        quantity: drug.quantity,
        refill: drug.refills,
        ...(drug.sig ? { directions: drug.sig, sig: drug.sig } : {}),
        ...(drug.daysSupply ? { duration: drug.daysSupply, daysSupply: drug.daysSupply } : {}),
      },
    }],
  };

  const addRes = await fetch(
    `${base}/v3/medcart/add/${patientId}?sessiontoken=${sessionToken}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addBody) },
  );
  const addRaw = await addRes.text();
  if (!addRes.ok) {
    return { ok: false, raw: addRaw.slice(0, 1200), status: addRes.status, step: 'add' };
  }

  return { ok: true, raw: addRaw.slice(0, 1200), status: addRes.status, step: 'add' };
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
  const sessionToken = await getSessionToken(loginEmail);
  const res = await fetch(
    `${hosts().backendScriptSure}/v3/drughistory/current/${patientId}/0?sessiontoken=${sessionToken}`,
  );

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

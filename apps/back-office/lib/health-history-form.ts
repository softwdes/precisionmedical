/**
 * Health History — el cuestionario "Comprehensive Adult New Patient Health
 * History" de la clínica, como VISTA del Historial Médico del paciente.
 *
 * No es un dato nuevo: lo que el modal edita y el PDF imprime vive en
 * `Patient.medicalHistory` (el mismo JSON de "Medical history"). Este módulo
 * hace dos traducciones, y las dos son puras (sin DB, sin React) para que las
 * use igual el modal del navegador y el PDF del servidor:
 *
 *   · `armarVista`  — ficha + historial + intake  →  lo que el formulario muestra.
 *   · `armarPatch`  — lo que el usuario editó     →  el patch de `updateMedicalHistory`.
 *
 * ## Las 46 condiciones y los 45 síntomas son FILAS FIJAS
 *
 * El formulario trae listas cerradas (Actual / Resuelto por condición, casilla
 * por síntoma); nuestro historial guarda listas libres. Se cruzan por nombre
 * (`re`, sin acentos, en español e inglés). Lo que no cruza NO se pierde:
 * queda como "Other" en el PDF y se conserva intacto al guardar.
 *
 * Actual = fila en `problems`; Resuelto = fila en `history`. Cambiar el estado
 * MUEVE la fila (con su fecha y sus comentarios) en vez de borrar y recrear.
 */

import type { MedicalHistoryData } from '@/app/(admin)/patients/medical-history-dialog';

// ── Listas fijas del formulario ──────────────────────────────────────────────

export type CondicionDef = { key: string; en: string; es: string; re: RegExp };

const c = (key: string, en: string, es: string, re: RegExp): CondicionDef => ({ key, en, es, re });

/** En el orden y con los nombres del PDF. */
export const CONDICIONES: readonly CondicionDef[] = [
  c('substance',   'Alcohol/drug abuse',                 'Abuso de alcohol/drogas',         /alcohol|drug abuse|adicci|sustancia|substance/),
  c('allergy',     'Allergy (hay fever)',                'Alergia (fiebre del heno)',       /hay fever|rinitis alerg|allergic rhinitis|^allerg(y|ies)$|^alergia/),
  c('anemia',      'Anemia',                             'Anemia',                          /anemi/),
  c('anxiety',     'Anxiety',                            'Ansiedad',                        /anxi|ansied/),
  c('arthritis',   'Arthritis (Rheumatoid / Osteo)',     'Artritis (reumatoide / osteo)',   /arthrit|artrit|rheumat|reumat|osteoarthr|osteoartr/),
  c('asthma',      'Asthma',                             'Asma',                            /asthm|asma/),
  c('bladder',     'Bladder / Kidney Problems',          'Problemas de vejiga / riñón',     /bladder|vejiga|urinary|urinari|uti\b/),
  c('clot',        'Blood Clot (Leg / Lung)',            'Coágulo (pierna / pulmón)',       /clot|coagul|thrombo|trombo|\bdvt\b|embol/),
  c('transfusion', 'Blood Transfusion',                  'Transfusión de sangre',           /transfus/),
  c('breastlump',  'Breast Lump',                        'Bulto en el seno',                /breast lump|bulto.*seno|nodulo.*mama|breast mass/),
  c('cancer',      'Cancer',                             'Cáncer',                          /cancer|carcinoma|lymphoma|linfoma|leuk|leuc|melanoma|tumou?r/),
  c('cataracts',   'Cataracts',                          'Cataratas',                       /catarat/),
  c('chickenpox',  'Chicken Pox',                        'Varicela',                        /chicken ?pox|varicela/),
  c('colonpolyp',  'Colon Polyp',                        'Pólipo de colon',                 /colon polyp|polipo/),
  c('cad',         'Coronary Artery Disease',            'Enfermedad coronaria',            /coronary|coronari|\bcad\b|angina/),
  c('depression',  'Depression',                         'Depresión',                       /depress|depresi/),
  c('diabetes',    'Diabetes',                           'Diabetes',                        /diabet/),
  c('diverticul',  'Diverticulitis',                     'Diverticulitis',                  /diverticul/),
  c('copd',        'Emphysema (COPD)',                   'Enfisema (EPOC)',                 /emphysem|enfisem|\bcopd\b|\bepoc\b/),
  c('fracture',    'Fractures (broken bones)',           'Fracturas (huesos rotos)',        /fractur/),
  c('gallbladder', 'Gallbladder Disease',                'Enfermedad de la vesícula',       /gallbladder|gall bladder|vesicula|cholecyst|colecist/),
  c('gerd',        'GERD / Heartburn',                   'Reflujo / agruras',               /gerd|reflux|reflujo|heartburn|agruras|acidez/),
  c('glaucoma',    'Glaucoma',                           'Glaucoma',                        /glaucom/),
  c('gout',        'Gout',                               'Gota',                            /\bgout\b|\bgota\b/),
  c('gyn',         'Gynecological Conditions (Endometriosis / Fibroids / Other)', 'Condiciones ginecológicas (endometriosis / fibromas / otras)', /gyn|endometri|fibroid|fibroma|ovar|pcos/),
  c('heartattack', 'Heart Attack',                       'Infarto',                         /heart attack|infarto|myocardial|miocard|\bmi\b/),
  c('hepatitis',   'Hepatitis (A / B / C / Other)',      'Hepatitis (A / B / C / otra)',    /hepatit/),
  c('hbp',         'High Blood Pressure',                'Presión alta',                    /hypertens|hipertens|high blood pressure|presion alta|\bhtn\b/),
  c('cholesterol', 'High Cholesterol',                   'Colesterol alto',                 /cholesterol|colesterol|hyperlipid|hiperlipid|dyslipid|dislipid/),
  c('hipfracture', 'Hip Fracture',                       'Fractura de cadera',              /hip fracture|fractura.*cadera/),
  c('ibd',         'Irritable Bowel Disease',            'Colon irritable',                 /irritable bowel|\bibs\b|\bibd\b|colon irritable|crohn|colitis/),
  c('kidneydis',   'Kidney Disease / Failure',           'Enfermedad / falla renal',        /kidney (disease|failure)|renal|nefro|insuficiencia renal|\bckd\b/),
  c('kidneystone', 'Kidney Stones',                      'Cálculos renales',                /kidney stone|calculo|litiasis|nephrolith|lithiasis/),
  c('liver',       'Liver Disease',                      'Enfermedad del hígado',           /liver|higado|cirrho|cirros|hepatic/),
  c('migraine',    'Migraine Headaches',                 'Migrañas',                        /migrain|migran/),
  c('osteoporosis','Osteoporosis',                       'Osteoporosis',                    /osteopor/),
  c('pneumonia',   'Pneumonia',                          'Neumonía',                        /pneumon|neumon/),
  c('prostate',    'Prostate (Enlargement / Nodules)',   'Próstata (agrandada / nódulos)',  /prostat|\bbph\b/),
  c('seizure',     'Seizure / Epilepsy',                 'Convulsiones / epilepsia',        /seizure|epilep|convuls/),
  c('skin',        'Skin Condition (Eczema / Psoriasis / Moles)', 'Condición de la piel (eczema / psoriasis / lunares)', /eczema|psoria|dermat|skin|piel|\bmole|lunar/),
  c('apnea',       'Sleep Apnea',                        'Apnea del sueño',                 /apnea|apnoea/),
  c('ulcer',       'Stomach Ulcer',                      'Úlcera de estómago',              /ulcer|ulcera/),
  c('stroke',      'Stroke',                             'Derrame cerebral',                /stroke|derrame cerebral|\bcva\b|\btia\b|ictus/),
  c('thyroidnod',  'Thyroid (Nodule)',                   'Tiroides (nódulo)',               /thyroid nod|nodulo.*tiroid|goit|bocio/),
  c('hypothyroid', 'Hypothyroidism',                     'Hipotiroidismo',                  /hypothyroid|hipotiroid/),
  c('hyperthyroid','Hyperthyroidism',                    'Hipertiroidismo',                 /hyperthyroid|hipertiroid|graves/),
];

export type SintomaDef = { en: string; es: string };
const sy = (en: string, es: string): SintomaDef => ({ en, es });

/** Tres columnas de 15, en el orden del PDF (se lee por columna). */
export const SINTOMAS: readonly (readonly SintomaDef[])[] = [
  [
    sy('Weight gain / loss', 'Aumento / pérdida de peso'), sy('Fatigue', 'Fatiga'), sy('Weakness', 'Debilidad'),
    sy('Fever', 'Fiebre'), sy('Body aches', 'Dolores de cuerpo'), sy('Numbness / tingling', 'Entumecimiento / hormigueo'),
    sy('Joint pain / swelling', 'Dolor / hinchazón de articulaciones'), sy('Muscle weakness', 'Debilidad muscular'),
    sy('Ear pain / ringing', 'Dolor / zumbido de oído'), sy('Loss of hearing', 'Pérdida de audición'),
    sy('Eye pain / redness / dryness', 'Dolor / enrojecimiento / resequedad de ojos'), sy('Double or blurry vision', 'Visión doble o borrosa'),
    sy('Sore throat', 'Dolor de garganta'), sy('Difficulty swallowing', 'Dificultad para tragar'),
    sy('Nasal congestion / sneezing', 'Congestión nasal / estornudos'),
  ],
  [
    sy('Headaches', 'Dolores de cabeza'), sy('Dizziness', 'Mareos'), sy('Fainting / loss of consciousness', 'Desmayo / pérdida del conocimiento'),
    sy('Memory loss', 'Pérdida de memoria'), sy('Nausea / vomiting', 'Náuseas / vómito'), sy('Heartburn / acid reflux', 'Agruras / reflujo'),
    sy('Abdominal pain', 'Dolor abdominal'), sy('Increasing constipation', 'Estreñimiento creciente'), sy('Persistent diarrhea', 'Diarrea persistente'),
    sy('Chest pain', 'Dolor de pecho'), sy('Heart palpitations', 'Palpitaciones'), sy('Shortness of breath', 'Falta de aire'),
    sy('Fainting', 'Desmayos'), sy('Swelling in legs or feet', 'Hinchazón de piernas o pies'), sy('Cough', 'Tos'),
  ],
  [
    sy('Blood in stools', 'Sangre en las heces'), sy('Black stools', 'Heces negras'), sy('Skin redness / rash', 'Enrojecimiento / sarpullido'),
    sy('Skin bumps / lesions / nodules', 'Bultos / lesiones / nódulos en la piel'), sy('Hair loss', 'Caída del cabello'),
    sy('Frequent / painful urination', 'Orina frecuente / dolorosa'), sy('Blood in urine', 'Sangre en la orina'), sy('Depression', 'Depresión'),
    sy('Anxiety', 'Ansiedad'), sy('Trouble sleeping', 'Problemas para dormir'), sy('Loss of appetite', 'Pérdida de apetito'),
    sy('Loss of libido / ED', 'Pérdida de libido / DE'), sy('Stress', 'Estrés'), sy('Poor concentration', 'Poca concentración'),
    sy('Suicidal thoughts', 'Pensamientos suicidas'),
  ],
];

/** Las 4 vacunas del PDF y cómo se reconocen en la lista libre `vaccines`. */
export const VACUNAS: readonly { key: 'pneumovax' | 'meningitis' | 'zostavax' | 'hpv'; label: string; re: RegExp }[] = [
  { key: 'pneumovax',  label: 'Pneumovax',  re: /pneumo|neumo/ },
  { key: 'meningitis', label: 'Meningitis', re: /mening/ },
  { key: 'zostavax',   label: 'Zostavax',   re: /zost|shingl|culebrilla|herpes z/ },
  { key: 'hpv',        label: 'HPV',        re: /\bhpv\b|papilom/ },
];

/** Nombre (EN o ES, sin acentos) → nombre canónico EN del síntoma. */
const SINTOMA_POR_NOMBRE = new Map<string, string>();
for (const col of SINTOMAS) for (const x of col) { SINTOMA_POR_NOMBRE.set(norm(x.en), x.en); SINTOMA_POR_NOMBRE.set(norm(x.es), x.en); }

export const TIPOS_TABACO = ['Cigarettes', 'Cigars', 'Chew', 'Other'] as const;
export const TIPOS_ALCOHOL = ['Beer', 'Wine', 'Liquor', 'Other'] as const;
export const ANTICONCEPTIVOS = ['Condom', 'Pill', 'IUD', 'Vasectomy', 'Other'] as const;
export const HIJOS = ['None', '1', '2', '3', '4', '5', '6 or more'] as const;

// ── Utilidades ───────────────────────────────────────────────────────────────

export function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export function nuevoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `hh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Índice de la condición fija a la que corresponde un texto libre, o -1. */
export function condicionDe(texto: string): number {
  const n = norm(texto);
  // El nombre exacto del PDF gana sobre cualquier regex (evita que "Hip Fracture"
  // caiga en "Fractures").
  const exacto = CONDICIONES.findIndex(d => norm(d.en) === n || norm(d.es) === n);
  if (exacto >= 0) return exacto;
  // "Hip fracture" antes que "Fracture"; "Kidney stones" antes que "Kidney disease".
  const orden = [CONDICIONES.findIndex(d => d.key === 'hipfracture'), CONDICIONES.findIndex(d => d.key === 'kidneystone')];
  for (const i of orden) if (CONDICIONES[i].re.test(n)) return i;
  return CONDICIONES.findIndex(d => d.re.test(n));
}

// ── La vista ─────────────────────────────────────────────────────────────────

export type Rating = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
export type EstadoCondicion = 'CURRENT' | 'RESOLVED' | null;

export type FilaMed   = { id: string; name: string; dose: string; timesDaily: string; refills: string; patientReported?: boolean; instructions?: string };
export type FilaCirugia = { id: string; procedure: string; year: string; notes: string };
export type FilaFamilia = { id: string; relation: string; condition: string };
export type FilaProveedor = { id: string; name: string; specialty: string; lastVisit: string };
export type Tamizaje = { date: string; location: string; abnormal: boolean | null };

export type FormView = {
  patient: { name: string; dob: string; sex: string; marital: string };
  visit: { referredBy: string; mainReason: string; otherConcerns: string; goals: string; rating: Rating | null };
  meds: { none: boolean; brought: boolean; rows: FilaMed[] };
  allergies: { text: string; none: boolean };
  vaccines: Record<'pneumovax' | 'meningitis' | 'zostavax' | 'hpv', boolean>;
  exams: {
    bloodDate: string; bloodResults: boolean | null;
    colonYear: string; colonLocation: string; colonAbnormal: boolean | null;
  };
  screenings: { mammogram: Tamizaje; pap: Tamizaje; boneDensity: Tamizaje };
  conditions: Record<string, { state: EstadoCondicion; comment: string }>;
  /** Filas del historial que no cruzan con ninguna fija. */
  otherConditions: { id: string; text: string; resolved: boolean }[];
  noSignificant: boolean;
  surgeries: FilaCirugia[];
  family: FilaFamilia[];
  providers: FilaProveedor[];
  symptoms: string[];         // nombres EN marcados
  otherSymptoms: string[];    // los libres que no cruzan — se conservan
  weightLbs: string;
  social: {
    workStatus: 'NO' | 'FULL' | 'PART' | ''; workType: string; children: string;
    tobacco: 'NEVER' | 'FORMER' | 'CURRENT' | ''; tobaccoTypes: string[]; packsPerDay: string; tobaccoYears: string;
    quitDate: string; secondhand: boolean | null; readyToQuit: boolean | null;
    alcohol: 'NEVER' | 'FORMER' | 'CURRENT' | ''; drinksPerWeek: string; alcoholTypes: string[];
    drugs: 'NEVER' | 'FORMER' | 'CURRENT' | ''; drugType: string;
    sexual: 'CURRENT' | 'NOT_CURRENT' | 'NEVER' | ''; sexualWith: 'MALE' | 'FEMALE' | 'BOTH' | '';
    birthControl: string[]; birthControlOther: string;
    military: boolean | null; school: boolean | null;
  };
  women: {
    pregnancies: string; births: string; miscarriages: string; menarcheAge: string; menopauseAge: string;
    notApplicable: boolean; periodConcerns: boolean | null; periodEveryDays: string; periodLastDays: string;
    periodFlow: 'LIGHT' | 'NORMAL' | 'HEAVY' | ''; periodIrregular: boolean | null; periodPattern: string;
  };
  /** De dónde vino lo que NO estaba en el historial (para la etiqueta del modal). */
  fromIntake: { allergies: boolean; meds: boolean; surgeries: boolean; rating: boolean };
};

/** Lo que `armarVista` necesita — todo ya descifrado. */
export type EntradaVista = {
  patient: {
    firstName: string; lastName: string; dateOfBirth: string | null; sex: string | null;
    maritalStatus: string | null; referralSource: string | null; referralSourceOther: string | null;
  };
  mh: MedicalHistoryData | null;
  intake: {
    healthStatus: string | null; hasMedications: boolean; medications: string | null;
    hasAllergies: boolean; allergies: string | null; hasPreviousInjuries: boolean; previousInjuries: string | null;
  } | null;
};

const MARITAL: Record<string, string> = {
  SINGLE: 'Single', MARRIED: 'Married', DIVORCED: 'Divorced', WIDOWED: 'Widowed', SEPARATED: 'Separated',
};

function embellecerFuente(v: string | null, otro: string | null): string {
  if (!v) return '';
  if (v === 'OTHER') return otro?.trim() || 'Other';
  return v.toLowerCase().split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** 1–10 del Historial Médico ⇄ las 4 palabras del formulario. */
export function ratingDe(n: number | null | undefined): Rating | null {
  if (n == null) return null;
  return n >= 9 ? 'EXCELLENT' : n >= 7 ? 'GOOD' : n >= 4 ? 'FAIR' : 'POOR';
}
export const NOTA_DE_RATING: Record<Rating, number> = { EXCELLENT: 10, GOOD: 7, FAIR: 5, POOR: 2 };

function fechaVista(iso: string | null): string {
  if (!iso) return '';
  // Cumpleaños = fecha de calendario: se toma el día tal cual, sin zona.
  return iso.slice(0, 10);
}

const tam = (t?: { date?: string; location?: string; abnormal?: boolean }): Tamizaje =>
  ({ date: t?.date ?? '', location: t?.location ?? '', abnormal: t?.abnormal ?? null });

/** Tope del nombre corto en el esquema (`corto` en medical-history-schema). */
const TOPE_NOMBRE = 120;

/**
 * Líneas sueltas del texto libre del intake ("Ibuprofen 400mg; Lisinopril").
 *
 * El intake guarda ORACIONES ("Tuve un accidente en 2019 y me lastimé el
 * cuello…"), y el nombre de una fila del historial tiene tope de 120: una línea
 * larga hacía fallar el guardado entero con "The text is longer than allowed".
 * Lo que no cabe en el título NO se recorta: pasa a `resto` (notas).
 */
function partirTextoLibre(txt: string | null | undefined): { titulo: string; resto: string }[] {
  return (txt ?? '').split(/[\n;]+/).map(x => x.trim()).filter(Boolean).slice(0, 20).map(l => {
    if (l.length <= TOPE_NOMBRE) return { titulo: l, resto: '' };
    const corte = l.lastIndexOf(' ', TOPE_NOMBRE - 1);
    const n = corte > 40 ? corte : TOPE_NOMBRE;
    return { titulo: l.slice(0, n).trim(), resto: l.slice(n).trim().slice(0, 2000) };
  });
}

export function armarVista({ patient, mh: mhIn, intake }: EntradaVista): FormView {
  const mh: MedicalHistoryData = mhIn ?? {};
  const fromIntake = { allergies: false, meds: false, surgeries: false, rating: false };

  // Visita
  let rating = ratingDe(mh.healthInfo?.selfRating ?? null);
  if (!rating && intake?.healthStatus) {
    const r = intake.healthStatus.toUpperCase();
    if (r === 'EXCELLENT' || r === 'GOOD' || r === 'FAIR' || r === 'POOR') { rating = r; fromIntake.rating = true; }
  }

  // Medicamentos (solo los en uso: el formulario pregunta lo que toma HOY)
  const enUso = (mh.medications ?? []).filter(m => m.status !== 'HISTORY');
  let medRows: FilaMed[] = enUso.map(m => ({
    id: m.id, name: m.name ?? '', dose: m.dose ?? '', timesDaily: m.timesDaily ?? '', refills: m.refills ?? '',
    patientReported: m.externalPrescriber,
  }));
  if (!medRows.length && intake?.hasMedications) {
    const lineas = partirTextoLibre(intake.medications);
    if (lineas.length) {
      medRows = lineas.map(l => ({ id: nuevoId(), name: l.titulo, dose: '', timesDaily: '', refills: '', patientReported: true, instructions: l.resto || undefined }));
      fromIntake.meds = true;
    }
  }

  // Alergias
  let alergia = (mh.allergies ?? '').trim();
  if (!alergia && intake?.hasAllergies && intake.allergies?.trim()) { alergia = intake.allergies.trim(); fromIntake.allergies = true; }

  // Condiciones fijas
  const conditions: FormView['conditions'] = {};
  for (const d of CONDICIONES) conditions[d.key] = { state: null, comment: '' };
  const otras: FormView['otherConditions'] = [];
  const pasar = (lista: NonNullable<MedicalHistoryData['problems']>, resolved: boolean) => {
    for (const p of lista) {
      const i = condicionDe(p.condition ?? '');
      if (i < 0) { otras.push({ id: p.id, text: p.condition, resolved }); continue; }
      const def = CONDICIONES[i];
      // Si ya hay una fila ACTUAL para esa condición, la resuelta no la pisa.
      if (conditions[def.key].state === 'CURRENT') continue;
      conditions[def.key] = { state: resolved ? 'RESOLVED' : 'CURRENT', comment: p.comments ?? '' };
    }
  };
  pasar(mh.history ?? [], true);
  pasar(mh.problems ?? [], false);

  // Cirugías
  let cirugias: FilaCirugia[] = (mh.surgeries ?? []).map(s => ({
    id: s.id, procedure: s.procedure, year: (s.date ?? '').slice(0, 4), notes: s.notes ?? '',
  }));
  if (!cirugias.length && intake?.hasPreviousInjuries && intake.previousInjuries?.trim()) {
    cirugias = partirTextoLibre(intake.previousInjuries).map(l => ({ id: nuevoId(), procedure: l.titulo, year: '', notes: l.resto }));
    fromIntake.surgeries = cirugias.length > 0;
  }

  // Vacunas
  const vac = { pneumovax: false, meningitis: false, zostavax: false, hpv: false };
  for (const v of mh.vaccines ?? []) {
    const n = norm(v);
    for (const d of VACUNAS) if (d.re.test(n)) vac[d.key] = true;
  }

  // Síntomas
  const conocidos = SINTOMA_POR_NOMBRE;
  const marcados: string[] = []; const sueltos: string[] = [];
  for (const s of mh.systemsReview ?? []) {
    const en = conocidos.get(norm(s));
    if (en) { if (!marcados.includes(en)) marcados.push(en); } else if (s.trim()) sueltos.push(s);
  }

  const sh = mh.socialHistory ?? {};
  const wh = mh.womensHealth ?? {};
  const ex = mh.healthExams ?? {};
  const sc = mh.screenings ?? {};

  return {
    patient: {
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      dob: fechaVista(patient.dateOfBirth),
      sex: patient.sex ?? '',
      marital: patient.maritalStatus ? (MARITAL[patient.maritalStatus] ?? '') : '',
    },
    visit: {
      referredBy: mh.visitInfo?.referredBy?.trim() || embellecerFuente(patient.referralSource, patient.referralSourceOther),
      mainReason: mh.visitInfo?.mainReason ?? '',
      otherConcerns: mh.visitInfo?.otherConcerns ?? '',
      goals: mh.healthInfo?.goals ?? '',
      rating,
    },
    meds: {
      none: !!mh.visitInfo?.noCurrentMeds || !!mh.noCurrentMedications,
      brought: !!mh.visitInfo?.broughtMedList,
      rows: medRows,
    },
    allergies: { text: alergia, none: !!mh.noKnownAllergies },
    vaccines: vac,
    exams: {
      bloodDate: ex.bloodTestDate ?? '', bloodResults: ex.resultsAvailable ?? null,
      colonYear: ex.colonoscopyYear ?? '', colonLocation: ex.colonoscopyLocation ?? '', colonAbnormal: ex.abnormal ?? null,
    },
    screenings: { mammogram: tam(sc.mammogram), pap: tam(sc.pap), boneDensity: tam(sc.boneDensity) },
    conditions,
    otherConditions: otras,
    noSignificant: !!mh.visitInfo?.noSignificantHistory,
    surgeries: cirugias,
    family: (mh.familyHistory ?? []).map(f => ({ id: f.id, relation: f.relation, condition: f.condition })),
    providers: (mh.providers ?? []).map(p => ({ id: p.id, name: p.name, specialty: p.specialty ?? '', lastVisit: p.lastVisit ?? '' })),
    symptoms: marcados,
    otherSymptoms: sueltos,
    weightLbs: mh.healthInfo?.reviewWeightLbs ?? '',
    social: {
      workStatus: sh.workStatus ?? '', workType: sh.work ?? '', children: sh.children ?? '',
      tobacco: (sh.tobacco ?? '') as FormView['social']['tobacco'], tobaccoTypes: sh.tobaccoTypes ?? [], packsPerDay: sh.packsPerDay ?? '', tobaccoYears: sh.tobaccoYears ?? '',
      quitDate: sh.quitDate ?? '', secondhand: sh.secondhandSmoke ?? null, readyToQuit: sh.readyToQuit ?? null,
      alcohol: (sh.alcohol ?? '') as FormView['social']['alcohol'], drinksPerWeek: sh.drinksPerWeek ?? '', alcoholTypes: sh.alcoholTypes ?? [],
      drugs: (sh.drugs ?? '') as FormView['social']['drugs'], drugType: sh.drugType ?? '',
      sexual: sh.sexual ?? '', sexualWith: sh.sexualWith ?? '',
      birthControl: sh.birthControl ?? [], birthControlOther: sh.birthControlOther ?? '',
      military: sh.military ?? null, school: sh.school ?? null,
    },
    women: {
      pregnancies: wh.pregnancies ?? '', births: wh.births ?? '', miscarriages: wh.miscarriages ?? '',
      menarcheAge: wh.menarcheAge ?? '', menopauseAge: wh.menopauseAge ?? '',
      notApplicable: !!wh.notApplicable, periodConcerns: wh.periodConcerns ?? null,
      periodEveryDays: wh.periodEveryDays ?? '', periodLastDays: wh.periodLastDays ?? '',
      periodFlow: wh.periodFlow ?? '', periodIrregular: wh.periodIrregular ?? null, periodPattern: wh.periodPattern ?? '',
    },
    fromIntake,
  };
}

// ── De la vista editada al patch ─────────────────────────────────────────────

const sinVacios = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && !v.length))) as Partial<T>;

/**
 * Convierte la vista editada en el patch de `updateMedicalHistory`.
 *
 * Devuelve SOLO las secciones que el formulario gobierna y que cambiaron
 * respecto de `mh`; el servidor las vuelve a validar. Lo que el formulario no
 * muestra (medicamentos ya suspendidos, comentarios, dispositivos implantados,
 * estado cognitivo…) no se toca.
 */
export function armarPatch(v: FormView, mhIn: MedicalHistoryData | null): Partial<MedicalHistoryData> {
  const mh = mhIn ?? {};
  const patch: Partial<MedicalHistoryData> = {};
  const limpio = (x: unknown): unknown => {
    const y = x === undefined ? null : JSON.parse(JSON.stringify(x));
    return y === '' || (Array.isArray(y) && !y.length) || (y && typeof y === 'object' && !Array.isArray(y) && !Object.keys(y).length) ? null : y;
  };
  const igual = (a: unknown, b: unknown) => JSON.stringify(limpio(a)) === JSON.stringify(limpio(b));
  const poner = <K extends keyof MedicalHistoryData>(k: K, val: MedicalHistoryData[K]) => {
    if (!igual(val, mh[k])) patch[k] = val;
  };

  // visitInfo / healthInfo — se conservan los campos que el formulario no toca.
  poner('visitInfo', {
    ...mh.visitInfo,
    referredBy: v.visit.referredBy.trim() || undefined,
    mainReason: v.visit.mainReason.trim() || undefined,
    otherConcerns: v.visit.otherConcerns.trim() || undefined,
    // La casilla "no toma" también la sella el servidor (`noCurrentMedications`):
    // si ya está sellada no se re-escribe este espejo.
    noCurrentMeds: v.meds.none ? (mh.noCurrentMedications ? mh.visitInfo?.noCurrentMeds : true) : undefined,
    broughtMedList: v.meds.brought || undefined,
    noSignificantHistory: v.noSignificant || undefined,
  });
  poner('healthInfo', {
    ...mh.healthInfo,
    goals: v.visit.goals.trim() || undefined,
    // Un 8 sigue siendo "Good": solo se re-escribe si la palabra cambió.
    selfRating: v.visit.rating === ratingDe(mh.healthInfo?.selfRating ?? null)
      ? (mh.healthInfo?.selfRating ?? null)
      : (v.visit.rating ? NOTA_DE_RATING[v.visit.rating] : null),
    reviewWeightLbs: v.weightLbs.trim() || undefined,
  });

  // Alergias. La casilla "no tiene" la sella el SERVIDOR (quién y cuándo): acá solo
  // se pide ponerla o quitarla — ver el comentario en `updateMedicalHistory`.
  poner('allergies', v.allergies.text.trim());
  if (v.allergies.none && !mh.noKnownAllergies) patch.noKnownAllergies = { at: new Date().toISOString() };
  if (!v.allergies.none && mh.noKnownAllergies) patch.noKnownAllergies = null;
  if (v.meds.none && !mh.noCurrentMedications) patch.noCurrentMedications = { at: new Date().toISOString() };
  if (!v.meds.none && mh.noCurrentMedications) patch.noCurrentMedications = null;

  // Medicamentos: los suspendidos no se tocan; los en uso se actualizan por id.
  const historicos = (mh.medications ?? []).filter(m => m.status === 'HISTORY');
  const previosPorId = new Map((mh.medications ?? []).map(m => [m.id, m]));
  const enUso = v.meds.rows.filter(r => r.name.trim()).map(r => {
    const prev = previosPorId.get(r.id);
    return {
      ...(prev ?? {}),
      id: r.id, name: r.name.trim(), status: 'IN_USE' as const,
      dose: r.dose.trim() || undefined, instructions: r.instructions?.trim() || prev?.instructions || undefined, timesDaily: r.timesDaily.trim() || undefined, refills: r.refills.trim() || undefined,
      ...(prev ? {} : { externalPrescriber: true }),
    };
  });
  poner('medications', [...enUso, ...historicos]);

  // Condiciones: cada fila existente se queda DONDE ESTÁ (orden, fecha, estado) salvo que
  // el usuario la haya movido o quitado; las nuevas se agregan al final.
  const problems = mh.problems ?? [];
  const history = mh.history ?? [];
  type FilaCond = NonNullable<MedicalHistoryData['problems']>[number];
  const claveDe = (f: FilaCond): string | null => { const i = condicionDe(f.condition); return i < 0 ? null : CONDICIONES[i].key; };
  // Una condición del formulario "pertenece" a su primera fila (actuales primero).
  const reclamada = new Map<string, string>();
  for (const f of [...problems, ...history]) { const k = claveDe(f); if (k && !reclamada.has(k)) reclamada.set(k, f.id); }
  const otrasPorId = new Map(v.otherConditions.map(o => [o.id, o]));
  const outP: FilaCond[] = []; const outH: FilaCond[] = []; const alFinalP: FilaCond[] = []; const alFinalH: FilaCond[] = [];
  const procesar = (f: FilaCond, lista: 'P' | 'H') => {
    const aqui = lista === 'P' ? outP : outH;
    const k = claveDe(f);
    if (!k) {
      const o = otrasPorId.get(f.id);
      if (!o || !o.text.trim()) return;                       // la quitó
      const destino = o.resolved ? 'H' : 'P';
      if (destino === lista) { aqui.push({ ...f, condition: o.text.trim() }); return; }
      (destino === 'P' ? alFinalP : alFinalH).push({ ...f, condition: o.text.trim(), status: o.resolved ? 'Resolved' : 'Current' });
      return;
    }
    const st = v.conditions[k].state;
    if (reclamada.get(k) !== f.id) { if (st) aqui.push(f); return; }   // fila repetida: queda mientras la condición siga marcada
    if (!st) return;                                                    // la desmarcó
    const comentario = v.conditions[k].comment.trim() || undefined;
    const destino = st === 'CURRENT' ? 'P' : 'H';
    if (destino === lista) { aqui.push({ ...f, comments: comentario }); return; }
    (destino === 'P' ? alFinalP : alFinalH).push({ ...f, comments: comentario, status: st === 'CURRENT' ? 'Current' : 'Resolved' });
  };
  problems.forEach(f => procesar(f, 'P'));
  history.forEach(f => procesar(f, 'H'));
  for (const d of CONDICIONES) {
    const st = v.conditions[d.key].state;
    if (!st || reclamada.has(d.key)) continue;
    (st === 'CURRENT' ? alFinalP : alFinalH).push({
      id: nuevoId(), condition: d.en, comments: v.conditions[d.key].comment.trim() || undefined, status: st === 'CURRENT' ? 'Current' : 'Resolved',
    });
  }
  const existentes = new Set([...problems, ...history].map(f => f.id));
  for (const o of v.otherConditions) {
    if (existentes.has(o.id) || !o.text.trim()) continue;
    (o.resolved ? alFinalH : alFinalP).push({ id: o.id, condition: o.text.trim(), status: o.resolved ? 'Resolved' : 'Current' });
  }
  poner('problems', [...outP, ...alFinalP]);
  poner('history', [...outH, ...alFinalH]);

  // Cirugías / familia / proveedores
  const cirPrev = new Map((mh.surgeries ?? []).map(s => [s.id, s]));
  poner('surgeries', v.surgeries.filter(s => s.procedure.trim()).map(s => {
    const prev = cirPrev.get(s.id);
    const year = s.year.trim();
    return {
      ...(prev ?? {}), id: s.id, procedure: s.procedure.trim(),
      // El año se escribe como año; si la fila ya traía fecha completa del mismo año, se respeta.
      date: year ? (prev?.date?.startsWith(year) ? prev.date : year) : undefined,
      notes: s.notes.trim() || undefined,
    };
  }));
  const famPrev = new Map((mh.familyHistory ?? []).map(f => [f.id, f]));
  poner('familyHistory', v.family.filter(f => f.relation.trim() && f.condition.trim()).map(f => ({
    ...(famPrev.get(f.id) ?? {}), id: f.id, relation: f.relation.trim(), condition: f.condition.trim(),
  })));
  const provPrev = new Map((mh.providers ?? []).map(p => [p.id, p]));
  poner('providers', v.providers.filter(p => p.name.trim()).map(p => ({
    ...(provPrev.get(p.id) ?? {}), id: p.id, name: p.name.trim(),
    specialty: p.specialty.trim() || undefined, lastVisit: p.lastVisit.trim() || undefined,
  })));

  // Vacunas: las 4 del formulario + las que ya había y no son de las 4.
  const vacDe = (x: string) => VACUNAS.find(d => d.re.test(norm(x)));
  const vacMantenidas = (mh.vaccines ?? []).filter(x => { const d = vacDe(x); return !d || v.vaccines[d.key]; });
  const yaEstan = new Set(vacMantenidas.map(x => vacDe(x)?.key).filter(Boolean));
  poner('vaccines', [...vacMantenidas, ...VACUNAS.filter(d => v.vaccines[d.key] && !yaEstan.has(d.key)).map(d => d.label)]);

  // Síntomas: los marcados + los libres que ya había.
  const sinDe = (x: string) => SINTOMA_POR_NOMBRE.get(norm(x));
  const sinMantenidos = (mh.systemsReview ?? []).filter(x => { const c = sinDe(x); return c ? v.symptoms.includes(c) : v.otherSymptoms.includes(x); });
  const sinYa = new Set(sinMantenidos.map(sinDe).filter(Boolean));
  poner('systemsReview', [...sinMantenidos, ...v.symptoms.filter(x => !sinYa.has(x))]);

  // Estudios
  poner('healthExams', sinVacios({
    ...mh.healthExams,
    bloodTestDate: v.exams.bloodDate || undefined, resultsAvailable: v.exams.bloodResults ?? undefined,
    colonoscopyYear: v.exams.colonYear || undefined, colonoscopyLocation: v.exams.colonLocation.trim() || undefined,
    abnormal: v.exams.colonAbnormal ?? undefined,
  }) as MedicalHistoryData['healthExams']);
  const t = (x: Tamizaje) => {
    const o = sinVacios({ date: x.date || undefined, location: x.location.trim() || undefined, abnormal: x.abnormal ?? undefined });
    return Object.keys(o).length ? o : undefined;
  };
  poner('screenings', sinVacios({
    mammogram: t(v.screenings.mammogram), pap: t(v.screenings.pap), boneDensity: t(v.screenings.boneDensity),
  }) as MedicalHistoryData['screenings']);

  // Historia social y de la mujer
  const so = v.social;
  poner('socialHistory', sinVacios({
    ...mh.socialHistory,
    workStatus: so.workStatus || undefined, work: so.workType.trim() || undefined, children: so.children || undefined,
    tobacco: so.tobacco || undefined, tobaccoTypes: so.tobaccoTypes, packsPerDay: so.packsPerDay.trim() || undefined,
    tobaccoYears: so.tobaccoYears.trim() || undefined, quitDate: so.quitDate || undefined,
    secondhandSmoke: so.secondhand ?? undefined, readyToQuit: so.readyToQuit ?? undefined,
    alcohol: so.alcohol || undefined, drinksPerWeek: so.drinksPerWeek.trim() || undefined, alcoholTypes: so.alcoholTypes,
    drugs: so.drugs || undefined, drugType: so.drugType.trim() || undefined,
    sexual: so.sexual || undefined, sexualWith: so.sexualWith || undefined,
    birthControl: so.birthControl, birthControlOther: so.birthControlOther.trim() || undefined,
    military: so.military ?? undefined, school: so.school ?? undefined,
  }) as MedicalHistoryData['socialHistory']);
  const w = v.women;
  poner('womensHealth', sinVacios({
    pregnancies: w.pregnancies.trim() || undefined, births: w.births.trim() || undefined, miscarriages: w.miscarriages.trim() || undefined,
    menarcheAge: w.menarcheAge.trim() || undefined, menopauseAge: w.menopauseAge.trim() || undefined,
    notApplicable: w.notApplicable || undefined, periodConcerns: w.periodConcerns ?? undefined,
    periodEveryDays: w.periodEveryDays.trim() || undefined, periodLastDays: w.periodLastDays.trim() || undefined,
    periodFlow: w.periodFlow || undefined, periodIrregular: w.periodIrregular ?? undefined, periodPattern: w.periodPattern.trim() || undefined,
  }) as MedicalHistoryData['womensHealth']);

  // Sin `undefined` en el cable: el servidor valida `.strict()`.
  return JSON.parse(JSON.stringify(patch)) as Partial<MedicalHistoryData>;
}

/** El formulario sin ningún dato — para imprimirlo y llenarlo a mano. */
export function vistaEnBlanco(): FormView {
  return armarVista({
    patient: { firstName: '', lastName: '', dateOfBirth: null, sex: null, maritalStatus: null, referralSource: null, referralSourceOther: null },
    mh: null,
    intake: null,
  });
}

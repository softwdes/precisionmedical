'use client';

/**
 * F1 — Confirmación de cita · "Actualizar información"
 *
 * El modal que abre el botón `Actualizar` del documento de confirmación. Es el
 * equivalente del "Edit patient" del v2: el paciente corrige su ficha ahí mismo
 * y firma con los datos ya buenos, en vez de avisarle a recepción y esperar.
 *
 * Por qué está: medido contra la base el 17-sep, sobre los 733 pacientes con
 * cita en los últimos 90 días — 27% sin contacto de emergencia, 45% sin farmacia
 * preferida, 39% sin medio de contacto, 13% sin un correo usable. Esta pantalla
 * los agarra parados en el mostrador con el teléfono en la mano.
 *
 * Tres decisiones de forma:
 *
 *  · **Todo en un solo modal, no un asistente por pasos.** El paciente viene a
 *    corregir UNA cosa; obligarlo a pasar por cinco pantallas para llegar a su
 *    teléfono es peor que un scroll largo.
 *  · **La ciudad tiene salida de texto libre.** El desplegable cerrado del v2 es
 *    exactamente lo que dejó a una paciente sin poder cargar Shelbyville, TN.
 *  · **16px en todo campo que se pueda tocar.** Debajo de eso el iPhone acerca
 *    la pantalla solo al enfocar, y desde que se desbloqueó el zoom en
 *    `app/layout.tsx` ya no hay nada que lo frene. No es una decisión de diseño.
 */

import { useMemo, useState } from 'react';
import { normalizeRelation, type RelationCode } from '@precision-medical/database/relations';
import { US_STATES, CITIES_BY_STATE, CITY_ZIP } from '@/lib/us-locations';
import { formatPhone, isValidNANP, phoneFromDb } from '@/lib/telefono';

type Lang = 'es' | 'en';

/** Valor centinela de "mi ciudad no está en la lista" — `__` para que no pueda
 *  chocar con el nombre de una ciudad real, que es el valor del `<select>`. */
const OTRA_CIUDAD = '__OTRA__';

export interface DatosEditables {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;     // YYYY-MM-DD
  email: string | null;
  phone: string | null;
  phone2: string | null;
  addressLine1: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  sex: string | null;
  maritalStatus: string | null;
  race: string | null;
  ethnicity: string | null;
  preferredLanguage: string | null;
  communicationPreference: string | null;
  referralSource: string | null;
  referralSourceOther: string | null;
  preferredPharmacy: string | null;
  employer: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  emergency2Name: string | null;
  emergency2Phone: string | null;
  emergency2Relation: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Textos
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  es: {
    titulo: 'Actualizar información',
    bajada: 'Corrija lo que esté mal o complete lo que falte. Se guarda al tocar "Guardar cambios".',
    secPersonal: 'Información personal',
    secDireccion: 'Dirección',
    secDemografia: 'Información demográfica',
    secAdicional: 'Información adicional',
    secEmergencia: 'Contactos de emergencia',
    emergencia1: 'Contacto principal',
    emergencia2: 'Contacto secundario',
    nombres: 'Nombres',
    apellidos: 'Apellidos',
    nacimiento: 'Fecha de nacimiento',
    email: 'Correo electrónico',
    telefono: 'Teléfono',
    movil: 'Celular',
    calle: 'Dirección',
    estadoUS: 'Estado',
    ciudad: 'Ciudad',
    zip: 'Código postal',
    genero: 'Género',
    estadoCivil: 'Estado civil',
    raza: 'Raza',
    etnia: 'Etnia',
    idioma: 'Idioma preferido',
    contactoPref: '¿Cómo prefiere que lo contactemos?',
    comoNosConocio: '¿Cómo nos conoció?',
    especifique: 'Especifique…',
    especifiqueRelacion: 'Especifique la relación…',
    farmacia: 'Farmacia preferida',
    empleador: 'Empleador',
    nombre: 'Nombre',
    relacion: 'Relación',
    seleccionar: 'Seleccionar',
    seleccioneEstado: 'Primero elija el estado',
    otraCiudad: 'Otra / No está en la lista',
    volverALaLista: 'Volver a la lista',
    cancelar: 'Cancelar',
    guardar: 'Guardar cambios',
    guardando: 'Guardando…',
    cerrar: 'Cerrar',
    // Errores
    errNombre: 'Escriba nombres y apellidos.',
    errNacimiento: 'Revise la fecha de nacimiento.',
    errEmail: 'Ese correo no parece válido.',
    errTelefono: 'El teléfono debe tener 10 dígitos.',
    errFuente: 'Cuéntenos cómo nos conoció.',
    errRelacion: 'Escriba cuál es la relación.',
    errDuplicadoEmail: 'Ese correo ya está registrado en otro paciente. Si lo comparte con un familiar, use otro o déjelo vacío.',
    errDuplicado: 'Ese dato ya está registrado en otro paciente.',
    errFirmada: 'La cita ya fue firmada, así que estos datos ya no se pueden cambiar acá. Avísele a recepción.',
    errVencido: 'El enlace venció. Pídale uno nuevo a recepción.',
    errMuchosIntentos: 'Espere unos segundos y vuelva a intentarlo.',
    errGenerico: 'No se pudieron guardar los cambios. Muéstrele esta pantalla a recepción.',
    revise: 'Revise los campos marcados.',
  },
  en: {
    titulo: 'Update information',
    bajada: 'Fix anything that is wrong or fill in what is missing. Nothing is saved until you tap "Save changes".',
    secPersonal: 'Personal information',
    secDireccion: 'Address',
    secDemografia: 'Demographic information',
    secAdicional: 'Additional information',
    secEmergencia: 'Emergency contacts',
    emergencia1: 'Primary contact',
    emergencia2: 'Secondary contact',
    nombres: 'First name',
    apellidos: 'Last name',
    nacimiento: 'Date of birth',
    email: 'Email',
    telefono: 'Phone',
    movil: 'Cell phone',
    calle: 'Address',
    estadoUS: 'State',
    ciudad: 'City',
    zip: 'ZIP code',
    genero: 'Gender',
    estadoCivil: 'Marital status',
    raza: 'Race',
    etnia: 'Ethnicity',
    idioma: 'Preferred language',
    contactoPref: 'How would you like to be contacted?',
    comoNosConocio: 'How did you hear about us?',
    especifique: 'Please specify…',
    especifiqueRelacion: 'Specify the relationship…',
    farmacia: 'Preferred pharmacy',
    empleador: 'Employer',
    nombre: 'Name',
    relacion: 'Relationship',
    seleccionar: 'Select',
    seleccioneEstado: 'Select a state first',
    otraCiudad: 'Other / Not in list',
    volverALaLista: 'Back to the list',
    cancelar: 'Cancel',
    guardar: 'Save changes',
    guardando: 'Saving…',
    cerrar: 'Close',
    errNombre: 'Please enter first and last name.',
    errNacimiento: 'Please check the date of birth.',
    errEmail: 'That email does not look valid.',
    errTelefono: 'The phone number must have 10 digits.',
    errFuente: 'Please tell us how you heard about us.',
    errRelacion: 'Please write the relationship.',
    errDuplicadoEmail: 'That email is already registered to another patient. If you share it with a relative, use a different one or leave it blank.',
    errDuplicado: 'That value is already registered to another patient.',
    errFirmada: 'This appointment has already been signed, so the information can no longer be changed here. Please let the front desk know.',
    errVencido: 'This link expired. Please ask the front desk for a new one.',
    errMuchosIntentos: 'Please wait a few seconds and try again.',
    errGenerico: 'The changes could not be saved. Please show this screen to the front desk.',
    revise: 'Please check the highlighted fields.',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Opciones — mismas listas y mismo wording que el wizard de admisión, para que
// un paciente que llenó el intake no vea otros nombres para lo mismo.
// ─────────────────────────────────────────────────────────────────────────────

type Opcion = { value: string; es: string; en: string };

const SEXO: Opcion[] = [
  { value: 'MALE',              es: 'Masculino',        en: 'Male' },
  { value: 'FEMALE',            es: 'Femenino',         en: 'Female' },
  { value: 'NON_BINARY',        es: 'No binario',       en: 'Non-binary' },
  { value: 'OTHER',             es: 'Otro',             en: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', es: 'Prefiero no decir', en: 'Prefer not to say' },
];

const CIVIL: Opcion[] = [
  { value: 'SINGLE',    es: 'Soltero/a',     en: 'Single' },
  { value: 'MARRIED',   es: 'Casado/a',      en: 'Married' },
  { value: 'DIVORCED',  es: 'Divorciado/a',  en: 'Divorced' },
  { value: 'WIDOWED',   es: 'Viudo/a',       en: 'Widowed' },
  { value: 'SEPARATED', es: 'Separado/a',    en: 'Separated' },
  { value: 'OTHER',     es: 'Otro',          en: 'Other' },
];

const RAZA: Opcion[] = [
  { value: 'WHITE',                         es: 'Blanco / Caucásico',          en: 'White / Caucasian' },
  { value: 'AFRICAN_AMERICAN',              es: 'Negro / Afroamericano',       en: 'Black / African American' },
  { value: 'ASIAN',                         es: 'Asiático',                    en: 'Asian' },
  { value: 'AMERICAN_INDIAN_ALASKA_NATIVE', es: 'Indígena americano / Alaska', en: 'American Indian / Alaska Native' },
  { value: 'NATIVE_HAWAIIAN',               es: 'Nativo hawaiano',             en: 'Native Hawaiian' },
  { value: 'PACIFIC_ISLANDER',              es: 'Isleño del Pacífico',         en: 'Pacific Islander' },
  { value: 'OTHER',                         es: 'Otro',                        en: 'Other' },
  { value: 'PREFER_NOT_TO_SAY',             es: 'Prefiero no decir',           en: 'Prefer not to say' },
];

const ETNIA: Opcion[] = [
  { value: 'HISPANIC_LATINO',     es: 'Hispano / Latino',     en: 'Hispanic / Latino' },
  { value: 'NOT_HISPANIC_LATINO', es: 'No hispano / Latino',  en: 'Not Hispanic / Latino' },
  { value: 'PREFER_NOT_TO_SAY',   es: 'Prefiero no decir',    en: 'Prefer not to say' },
];

/**
 * `PHONE` dice "Llamada telefónica" y no "Teléfono": en la misma lista está
 * "Mensaje de texto", que también llega al teléfono. Con "Teléfono" a secas las
 * dos opciones se solapan y quien después lo llama no sabe qué le pidió.
 */
const CONTACTO: Opcion[] = [
  { value: 'PHONE', es: 'Llamada telefónica', en: 'Phone call' },
  { value: 'EMAIL', es: 'Email',              en: 'Email' },
  { value: 'TEXT',  es: 'Mensaje de texto',   en: 'Text message' },
  { value: 'ANY',   es: 'Cualquiera',         en: 'Any' },
];

const IDIOMA: Opcion[] = [
  { value: 'es', es: 'Español', en: 'Spanish' },
  { value: 'en', es: 'Inglés',  en: 'English' },
];

const REFERIDO: Opcion[] = [
  { value: 'LAW_FIRM',         es: 'Abogado / Bufete de abogados', en: 'Attorney / Law firm' },
  { value: 'WEB_SEARCH',       es: 'Búsqueda web',                 en: 'Web search' },
  { value: 'ACCIDENT_CENTER',  es: 'Centro de accidentes Axcess',  en: 'Axcess Accident Center' },
  { value: 'FACEBOOK',         es: 'Facebook',                     en: 'Facebook' },
  { value: 'FAMILY',           es: 'Familia',                      en: 'Family' },
  { value: 'GOOGLE',           es: 'Google',                       en: 'Google' },
  { value: 'GOOGLE_MAPS',      es: 'Google Maps',                  en: 'Google Maps' },
  { value: 'INSTAGRAM',        es: 'Instagram',                    en: 'Instagram' },
  { value: 'WEBSITE',          es: 'Página web',                   en: 'Website' },
  { value: 'CLINIC_STAFF',     es: 'Personal de la clínica',       en: 'Clinic staff' },
  { value: 'CHIROPRACTOR',     es: 'Quiropráctico',                en: 'Chiropractor' },
  { value: 'REFERRAL',         es: 'Recomendación',                en: 'Referral' },
  { value: 'PATIENT_REFERRAL', es: 'Recomendación de paciente',    en: 'Referral from patient' },
  { value: 'INSURANCE',        es: 'Seguro',                       en: 'Insurance' },
  { value: 'TIKTOK',           es: 'TikTok',                       en: 'TikTok' },
  { value: 'OTHER',            es: 'Otro',                         en: 'Other' },
];

/**
 * La relación del contacto de emergencia se guarda como TEXTO LIBRE: la data
 * del v2 trae 167 valores distintos escritos a mano ("Mother", "Esposa",
 * "Spuse"). Por eso el desplegable ofrece el catálogo canónico y lo que no
 * entra cae en "Otro" conservando el texto original — de eso se encarga
 * `normalizeRelation`, que es la MISMA función que usa el wizard de admisión.
 */
const RELACIONES: Opcion[] = [
  { value: 'SPOUSE',   es: 'Cónyuge / Pareja', en: 'Spouse / Partner' },
  { value: 'PARENT',   es: 'Padre / Madre',    en: 'Parent' },
  { value: 'CHILD',    es: 'Hijo / Hija',      en: 'Child' },
  { value: 'SIBLING',  es: 'Hermano / Hermana', en: 'Sibling' },
  { value: 'FRIEND',   es: 'Amigo / Amiga',    en: 'Friend' },
  { value: 'EMPLOYER', es: 'Jefe / Empleador', en: 'Employer / Boss' },
  { value: 'NEIGHBOR', es: 'Vecino / Vecina',  en: 'Neighbor' },
  { value: 'OTHER',    es: 'Otro',             en: 'Other' },
];

/**
 * Los códigos que este desplegable REALMENTE ofrece. Hay que pasárselos a
 * `normalizeRelation`: por defecto reconoce trece (abuelo, primo, sobrino…) y
 * devolver un código que el `<select>` no lista lo dejaría en blanco sin avisar.
 */
const RELACIONES_OFRECIDAS = RELACIONES.map(o => o.value) as RelationCode[];

// ─────────────────────────────────────────────────────────────────────────────
// Estilo — mismos colores que el documento de confirmación
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  panel:  '#0f1827',
  borde:  'rgba(255,255,255,0.10)',
  campo:  'rgba(255,255,255,0.05)',
  texto:  'rgba(255,255,255,0.92)',
  suave:  'rgba(255,255,255,0.55)',
  tenue:  'rgba(255,255,255,0.38)',
  cyan:   '#06B6D4',
  rojo:   '#f87171',
};

const S = {
  /**
   * 16px es el piso del campo de texto en iOS: por debajo, Safari acerca la
   * pantalla solo al enfocar y el paciente tiene que alejarla a mano en cada
   * campo. No se baja "porque se ve mejor".
   */
  input: {
    width: '100%', boxSizing: 'border-box' as const,
    padding: '11px 12px', fontSize: 16, lineHeight: 1.3,
    borderRadius: 9, border: `1px solid ${C.borde}`,
    background: C.campo, color: C.texto,
    fontFamily: 'inherit',
  },
  select: {
    width: '100%', boxSizing: 'border-box' as const,
    padding: '11px 12px', fontSize: 16, lineHeight: 1.3,
    borderRadius: 9, border: `1px solid ${C.borde}`,
    background: '#1a2236', color: C.texto,
    fontFamily: 'inherit',
  },
};

// ─────────────────────────────────────────────────────────────────────────────

type Errores = Partial<Record<keyof Estado, string>>;

interface Estado {
  firstName: string; lastName: string; dateOfBirth: string;
  email: string; phone: string; phone2: string;
  addressLine1: string; addressCity: string; addressState: string; addressZip: string;
  sex: string; maritalStatus: string; race: string; ethnicity: string;
  preferredLanguage: string; communicationPreference: string;
  referralSource: string; referralSourceOther: string;
  preferredPharmacy: string; employer: string;
  emergencyContactName: string; emergencyContactPhone: string;
  emergencyContactRelation: string; emergencyContactRelationOther: string;
  emergency2Name: string; emergency2Phone: string;
  emergency2Relation: string; emergency2RelationOther: string;
}

function inicial(d: DatosEditables): Estado {
  const fuenteConocida = REFERIDO.some(o => o.value === d.referralSource);
  const rel1 = normalizeRelation(d.emergencyContactRelation, RELACIONES_OFRECIDAS);
  const rel2 = normalizeRelation(d.emergency2Relation, RELACIONES_OFRECIDAS);
  return {
    firstName:    d.firstName ?? '',
    lastName:     d.lastName ?? '',
    dateOfBirth:  d.dateOfBirth ?? '',
    email:        d.email ?? '',
    // Los teléfonos pasan por `phoneFromDb`: la data migrada trae `NONE`, `N/A`
    // y `0000000000` en esa columna, y precargarlos deja al paciente trabado con
    // un error de validación sobre algo que él no escribió.
    phone:        phoneFromDb(d.phone),
    phone2:       phoneFromDb(d.phone2),
    addressLine1: d.addressLine1 ?? '',
    addressCity:  d.addressCity ?? '',
    addressState: d.addressState ?? '',
    addressZip:   d.addressZip ?? '',
    sex:          d.sex ?? '',
    maritalStatus: d.maritalStatus ?? '',
    race:         d.race ?? '',
    ethnicity:    d.ethnicity ?? '',
    preferredLanguage: IDIOMA.some(o => o.value === d.preferredLanguage) ? d.preferredLanguage! : '',
    communicationPreference: d.communicationPreference ?? '',
    referralSource: fuenteConocida ? d.referralSource! : (d.referralSource ? 'OTHER' : ''),
    // La data del v2 metía el texto libre directo en `referralSource`, sin
    // columna propia. Ese valor se conserva en vez de perderse.
    referralSourceOther: d.referralSourceOther ?? (fuenteConocida ? '' : (d.referralSource ?? '')),
    preferredPharmacy: d.preferredPharmacy ?? '',
    employer:     d.employer ?? '',
    emergencyContactName:          d.emergencyContactName ?? '',
    emergencyContactPhone:         phoneFromDb(d.emergencyContactPhone),
    emergencyContactRelation:      rel1.code as string,
    emergencyContactRelationOther: rel1.other,
    emergency2Name:                d.emergency2Name ?? '',
    emergency2Phone:               phoneFromDb(d.emergency2Phone),
    emergency2Relation:            rel2.code as string,
    emergency2RelationOther:       rel2.other,
  };
}

export function EditarDatos({
  datos, token, lang, onCancelar, onGuardado,
}: {
  datos: DatosEditables;
  token: string;
  lang: Lang;
  onCancelar: () => void;
  /** Le avisa al documento que refresque desde el servidor y cierre. */
  onGuardado: () => void;
}) {
  const t = T[lang];

  const [f, setF]           = useState<Estado>(() => inicial(datos));
  const [err, setErr]       = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [guardando, setGuardando]       = useState(false);

  const set = <K extends keyof Estado>(campo: K, valor: Estado[K]) => {
    setF(prev => ({ ...prev, [campo]: valor }));
    setErr(prev => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  };

  const codigoEstado = useMemo(
    () => US_STATES.find(s => s.name === f.addressState || s.code === f.addressState)?.code ?? '',
    [f.addressState],
  );
  const ciudades = CITIES_BY_STATE[codigoEstado] ?? [];

  /**
   * Arranca en texto libre si la ciudad guardada no figura en el catálogo del
   * estado — si no, un paciente migrado con una ciudad chica vería el
   * desplegable en blanco y parecería que nunca la cargó.
   */
  const [ciudadALaMano, setCiudadALaMano] = useState(() => {
    const ciudad = datos.addressCity?.trim();
    if (!ciudad) return false;
    const cod = US_STATES.find(s => s.name === datos.addressState || s.code === datos.addressState)?.code ?? '';
    const lista = CITIES_BY_STATE[cod] ?? [];
    return !lista.some(c => c.toLowerCase() === ciudad.toLowerCase());
  });

  // ── Validación ─────────────────────────────────────────────────────────────
  function validar(): boolean {
    const e: Errores = {};

    if (!f.firstName.trim()) e.firstName = t.errNombre;
    if (!f.lastName.trim())  e.lastName  = t.errNombre;

    if (f.dateOfBirth) {
      const d = new Date(`${f.dateOfBirth}T12:00:00`);
      if (Number.isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900) {
        e.dateOfBirth = t.errNacimiento;
      }
    }

    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = t.errEmail;

    for (const campo of ['phone', 'phone2', 'emergencyContactPhone', 'emergency2Phone'] as const) {
      if (f[campo].trim() && !isValidNANP(f[campo])) e[campo] = t.errTelefono;
    }

    if (f.referralSource === 'OTHER' && !f.referralSourceOther.trim()) e.referralSourceOther = t.errFuente;

    // "Otro" sin decir qué es guarda literalmente la palabra OTHER, que no le
    // sirve a nadie el día que haya que llamar a ese contacto.
    if (f.emergencyContactRelation === 'OTHER' && !f.emergencyContactRelationOther.trim()) {
      e.emergencyContactRelationOther = t.errRelacion;
    }
    if (f.emergency2Relation === 'OTHER' && !f.emergency2RelationOther.trim()) {
      e.emergency2RelationOther = t.errRelacion;
    }

    setErr(e);
    if (Object.keys(e).length) {
      setErrorGeneral(t.revise);
      return false;
    }
    setErrorGeneral('');
    return true;
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  async function guardar() {
    if (!validar()) return;
    setGuardando(true);
    setErrorGeneral('');
    try {
      // La relación se manda ya resuelta: el código cuando está en el catálogo,
      // y el texto que escribió el paciente cuando eligió "Otro". Es una sola
      // columna de texto libre en la base — mismo criterio que el wizard.
      const relacion = (code: string, otro: string) =>
        code === 'OTHER' ? (otro.trim() || 'OTHER') : code;

      const res = await fetch(`/api/confirmar/${token}/update`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...f,
          emergencyContactRelation: relacion(f.emergencyContactRelation, f.emergencyContactRelationOther),
          emergency2Relation:       relacion(f.emergency2Relation, f.emergency2RelationOther),
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; field?: string };

      if (!res.ok || !json.ok) {
        if (json.error === 'DUPLICATE_FIELD') {
          setErrorGeneral(json.field === 'email' ? t.errDuplicadoEmail : t.errDuplicado);
          if (json.field === 'email') setErr(prev => ({ ...prev, email: t.errDuplicado }));
        } else if (json.error === 'ALREADY_SIGNED')  setErrorGeneral(t.errFirmada);
        else if (json.error === 'TOKEN_EXPIRED')     setErrorGeneral(t.errVencido);
        else if (res.status === 429)                 setErrorGeneral(t.errMuchosIntentos);
        else                                          setErrorGeneral(t.errGenerico);
        return;
      }
      onGuardado();
    } catch {
      setErrorGeneral(t.errGenerico);
    } finally {
      setGuardando(false);
    }
  }

  const opciones = (lista: Opcion[]) =>
    lista.map(o => <option key={o.value} value={o.value}>{lang === 'es' ? o.es : o.en}</option>);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.titulo}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', padding: '20px 14px 40px',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget && !guardando) onCancelar(); }}
    >
      <div style={{
        width: '100%', maxWidth: 560, borderRadius: 16,
        background: C.panel, border: `1px solid ${C.borde}`,
        color: C.texto, padding: '20px 18px 22px',
      }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t.titulo}</div>
            <div style={{ fontSize: 12.5, color: C.tenue, marginTop: 4, lineHeight: 1.5 }}>{t.bajada}</div>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            aria-label={t.cerrar}
            style={{
              flexShrink: 0, background: 'none', border: 'none', color: C.suave,
              fontSize: 22, lineHeight: 1, cursor: guardando ? 'default' : 'pointer', padding: 4,
            }}
          >✕</button>
        </div>

        {/* ── Personal ─────────────────────────────────────────────────── */}
        <Grupo titulo={t.secPersonal}>
          <Dos>
            <Campo label={t.nombres} req error={err.firstName}>
              <input style={S.input} value={f.firstName} autoComplete="given-name"
                onChange={e => set('firstName', e.target.value)} />
            </Campo>
            <Campo label={t.apellidos} req error={err.lastName}>
              <input style={S.input} value={f.lastName} autoComplete="family-name"
                onChange={e => set('lastName', e.target.value)} />
            </Campo>
          </Dos>
          <Dos>
            <Campo label={t.nacimiento} error={err.dateOfBirth}>
              <input type="date" style={S.input} value={f.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => set('dateOfBirth', e.target.value)} />
            </Campo>
            <Campo label={t.email} error={err.email}>
              <input type="email" inputMode="email" style={S.input} value={f.email}
                autoComplete="email" onChange={e => set('email', e.target.value)} />
            </Campo>
          </Dos>
          <Dos>
            <Campo label={t.telefono} error={err.phone}>
              <input type="tel" inputMode="tel" style={S.input} value={f.phone}
                placeholder="(000) 000-0000" autoComplete="tel"
                onChange={e => set('phone', formatPhone(e.target.value))} />
            </Campo>
            <Campo label={t.movil} error={err.phone2}>
              <input type="tel" inputMode="tel" style={S.input} value={f.phone2}
                placeholder="(000) 000-0000"
                onChange={e => set('phone2', formatPhone(e.target.value))} />
            </Campo>
          </Dos>
        </Grupo>

        {/* ── Dirección ────────────────────────────────────────────────── */}
        <Grupo titulo={t.secDireccion}>
          <Campo label={t.calle}>
            <input style={S.input} value={f.addressLine1} autoComplete="street-address"
              onChange={e => set('addressLine1', e.target.value)} />
          </Campo>
          <Dos>
            <Campo label={t.estadoUS}>
              <select
                style={S.select}
                value={f.addressState}
                onChange={e => {
                  // Al cambiar de estado la ciudad guardada deja de tener
                  // sentido: se limpia junto con el modo de texto libre.
                  set('addressState', e.target.value);
                  set('addressCity', '');
                  setCiudadALaMano(false);
                }}
              >
                <option value="">{t.seleccionar}</option>
                {US_STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
              </select>
            </Campo>
            <Campo label={t.ciudad}>
              {ciudadALaMano ? (
                <input style={S.input} value={f.addressCity}
                  onChange={e => set('addressCity', e.target.value)} />
              ) : (
                <select
                  style={S.select}
                  disabled={!f.addressState}
                  value={f.addressCity}
                  onChange={e => {
                    const ciudad = e.target.value;
                    if (ciudad === OTRA_CIUDAD) {
                      setCiudadALaMano(true);
                      set('addressCity', '');
                      return;
                    }
                    set('addressCity', ciudad);
                    // El C.P. solo se pisa si hay uno mapeado: borrarle al
                    // paciente el que ya escribió sería peor que dejarlo.
                    const zip = CITY_ZIP[ciudad];
                    if (zip) set('addressZip', zip);
                  }}
                >
                  <option value="">{f.addressState ? t.seleccionar : t.seleccioneEstado}</option>
                  {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
                  {f.addressState && <option value={OTRA_CIUDAD}>{t.otraCiudad}</option>}
                </select>
              )}
              {ciudadALaMano && f.addressState && (
                <button type="button"
                  onClick={() => { setCiudadALaMano(false); set('addressCity', ''); }}
                  style={{
                    marginTop: 6, background: 'none', border: 'none', padding: 0,
                    color: 'rgba(6,182,212,0.75)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{t.volverALaLista}</button>
              )}
            </Campo>
          </Dos>
          <Campo label={t.zip}>
            <input inputMode="numeric" style={S.input} value={f.addressZip} autoComplete="postal-code"
              onChange={e => set('addressZip', e.target.value.replace(/[^\d-]/g, '').slice(0, 10))} />
          </Campo>
        </Grupo>

        {/* ── Demografía ───────────────────────────────────────────────── */}
        <Grupo titulo={t.secDemografia}>
          <Dos>
            <Campo label={t.genero}>
              <select style={S.select} value={f.sex} onChange={e => set('sex', e.target.value)}>
                <option value="">—</option>{opciones(SEXO)}
              </select>
            </Campo>
            <Campo label={t.estadoCivil}>
              <select style={S.select} value={f.maritalStatus} onChange={e => set('maritalStatus', e.target.value)}>
                <option value="">—</option>{opciones(CIVIL)}
              </select>
            </Campo>
          </Dos>
          <Dos>
            <Campo label={t.raza}>
              <select style={S.select} value={f.race} onChange={e => set('race', e.target.value)}>
                <option value="">—</option>{opciones(RAZA)}
              </select>
            </Campo>
            <Campo label={t.etnia}>
              <select style={S.select} value={f.ethnicity} onChange={e => set('ethnicity', e.target.value)}>
                <option value="">—</option>{opciones(ETNIA)}
              </select>
            </Campo>
          </Dos>
        </Grupo>

        {/* ── Adicional ────────────────────────────────────────────────── */}
        <Grupo titulo={t.secAdicional}>
          <Dos>
            <Campo label={t.idioma}>
              <select style={S.select} value={f.preferredLanguage}
                onChange={e => set('preferredLanguage', e.target.value)}>
                <option value="">—</option>{opciones(IDIOMA)}
              </select>
            </Campo>
            <Campo label={t.contactoPref}>
              <select style={S.select} value={f.communicationPreference}
                onChange={e => set('communicationPreference', e.target.value)}>
                <option value="">—</option>{opciones(CONTACTO)}
              </select>
            </Campo>
          </Dos>
          <Campo label={t.comoNosConocio} error={err.referralSourceOther}>
            <select style={S.select} value={f.referralSource}
              onChange={e => { set('referralSource', e.target.value); set('referralSourceOther', ''); }}>
              <option value="">—</option>{opciones(REFERIDO)}
            </select>
            {f.referralSource === 'OTHER' && (
              <input style={{ ...S.input, marginTop: 8 }} placeholder={t.especifique}
                value={f.referralSourceOther}
                onChange={e => set('referralSourceOther', e.target.value)} />
            )}
          </Campo>
          <Dos>
            <Campo label={t.farmacia}>
              <input style={S.input} value={f.preferredPharmacy}
                onChange={e => set('preferredPharmacy', e.target.value)} />
            </Campo>
            <Campo label={t.empleador}>
              <input style={S.input} value={f.employer}
                onChange={e => set('employer', e.target.value)} />
            </Campo>
          </Dos>
        </Grupo>

        {/* ── Emergencia ───────────────────────────────────────────────── */}
        <Grupo titulo={t.secEmergencia}>
          {([0, 1] as const).map(i => {
            const nombreK = i === 0 ? 'emergencyContactName'          : 'emergency2Name';
            const telK    = i === 0 ? 'emergencyContactPhone'         : 'emergency2Phone';
            const relK    = i === 0 ? 'emergencyContactRelation'      : 'emergency2Relation';
            const otroK   = i === 0 ? 'emergencyContactRelationOther' : 'emergency2RelationOther';
            return (
              <div key={i} style={{ marginBottom: i === 0 ? 14 : 0 }}>
                <div style={{
                  fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: C.tenue, fontWeight: 700, marginBottom: 8,
                }}>
                  {i === 0 ? t.emergencia1 : t.emergencia2}
                </div>
                <Campo label={t.nombre}>
                  <input style={S.input} value={f[nombreK]}
                    onChange={e => set(nombreK, e.target.value)} />
                </Campo>
                <Dos>
                  <Campo label={t.telefono} error={err[telK]}>
                    <input type="tel" inputMode="tel" style={S.input} value={f[telK]}
                      placeholder="(000) 000-0000"
                      onChange={e => set(telK, formatPhone(e.target.value))} />
                  </Campo>
                  <Campo label={t.relacion} error={err[otroK]}>
                    <select style={S.select} value={f[relK]}
                      onChange={e => { set(relK, e.target.value); set(otroK, ''); }}>
                      <option value="">—</option>{opciones(RELACIONES)}
                    </select>
                    {f[relK] === 'OTHER' && (
                      <input style={{ ...S.input, marginTop: 8 }} placeholder={t.especifiqueRelacion}
                        value={f[otroK]} onChange={e => set(otroK, e.target.value)} />
                    )}
                  </Campo>
                </Dos>
              </div>
            );
          })}
        </Grupo>

        {errorGeneral && (
          <div style={{
            marginTop: 14, background: 'rgba(248,113,113,0.10)',
            border: '1px solid rgba(248,113,113,0.30)', borderRadius: 9,
            padding: '11px 13px', fontSize: 13, color: C.rojo, lineHeight: 1.5,
          }}>
            {errorGeneral}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            style={{
              flex: '0 0 auto', padding: '13px 18px', borderRadius: 10,
              border: `1px solid ${C.borde}`, background: 'transparent',
              color: C.suave, fontSize: 15, fontWeight: 700,
              cursor: guardando ? 'default' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {t.cancelar}
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            style={{
              flex: 1, padding: '13px 18px', borderRadius: 10, border: 'none',
              background: guardando ? 'rgba(6,182,212,0.45)' : C.cyan,
              color: '#04202a', fontSize: 15.5, fontWeight: 800,
              cursor: guardando ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {guardando ? t.guardando : t.guardar}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas
// ─────────────────────────────────────────────────────────────────────────────

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: C.suave,
        marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.borde}`,
      }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

/**
 * Dos columnas que se apilan solas en pantalla angosta.
 *
 * `auto-fit` + `minmax` y no `1fr 1fr`: con dos columnas fijas los campos se
 * aplastan en un celular, y en las iPad viejas del mostrador el grid de dos
 * columnas fijas fue justo lo que dejó de dibujarse.
 */
function Dos({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
      {children}
    </div>
  );
}

function Campo({
  label, req, error, children,
}: {
  label: string; req?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: C.suave, marginBottom: 5 }}>
        {label} {req && <span style={{ color: C.rojo }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11.5, color: C.rojo, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

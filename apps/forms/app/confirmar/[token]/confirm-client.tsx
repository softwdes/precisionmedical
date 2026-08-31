'use client';

/**
 * F1 — Confirmación de cita · lo que ve y firma el paciente.
 *
 * Bilingüe con `useState` local, como el resto de `apps/forms`: el paciente
 * entra por un link, no hay rutas i18n que resolver (ver `app/layout.tsx`).
 *
 * Decisiones de la pantalla:
 *  · **Mobile-first y la firma anclada al pie.** El v2 mete todo en un scroll
 *    largo: en un celular hay que bajar tres pantallas para llegar al botón.
 *  · **Si el paciente es MENOR, firma el apoderado** y hay que escribir su
 *    nombre. Sin esto el documento sale firmado a nombre del menor — es el
 *    mismo bug que ya tuvimos en la firma del lien.
 *  · Los datos se muestran en solo lectura. Los dos modales de corrección
 *    ("Actualizar información" y "Seguros") son la fase siguiente: un botón que
 *    todavía no hace nada es peor que no tenerlo.
 */

import { useCallback, useMemo, useState } from 'react';
import { isMinor } from '@precision-medical/database/age';
import { FirmaCanvas } from '@/components/FirmaCanvas';

// ─────────────────────────────────────────────────────────────────────────────
// Datos que arma el server component
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosConfirmacion {
  appointmentId: string;
  token: string;
  expiresAt: string;
  yaFirmada: boolean;
  firmadaEl: string | null;

  cita: {
    scheduledFor: string;
    durationMinutes: number;
    status: string;
    type: string;
    notes: string | null;
    ingresoHecho: boolean;
  };
  clinica: { nombre: string; direccion: string | null; telefono: string | null; email: string | null };
  provider: { nombre: string; especialidad: string | null } | null;
  paciente: {
    nombre: string; codigo: string; estado: string;
    nacimiento: string | null;
    telefono: string | null; movil: string | null; email: string | null;
    direccion: string | null; ciudad: string | null; estadoUS: string | null; zip: string | null;
    sexo: string | null; estadoCivil: string | null; raza: string | null; etnia: string | null;
    idioma: string | null; contactoPref: string | null;
    farmacia: string | null; empleador: string | null;
  };
  emergencia: Array<{ nombre: string | null; telefono: string | null; relacion: string | null }>;
  caso: { codigo: string; tipo: string; estado: string; creado: string; accidenteEl: string | null } | null;
  consentimientos: Array<{ llave: string; aceptado: boolean }>;
}

type Lang = 'es' | 'en';

// ─────────────────────────────────────────────────────────────────────────────
// Textos
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  es: {
    marca: 'Sistema EHR integral',
    titulo: 'Documento de confirmación de cita',
    bajada: 'Revise la información de la cita, del paciente y del caso antes de firmar. Si algo es incorrecto, avísele a recepción antes de confirmar.',
    secCita: 'Detalles de la cita',
    secCitaSub: 'Información completa sobre la cita programada',
    secClinica: 'Información de la clínica',
    secProvider: 'Especialista',
    secNotas: 'Notas de la cita',
    secPaciente: 'Información del paciente',
    secPacienteSub: 'Datos personales, de contacto y demográficos',
    secContacto: 'Información de contacto',
    secDireccion: 'Dirección',
    secDemografia: 'Información demográfica',
    secAdicional: 'Información adicional',
    secEmergencia: 'Contactos de emergencia',
    emergenciaPrincipal: 'Contacto de emergencia principal',
    emergenciaSecundario: 'Contacto de emergencia secundario',
    secCaso: 'Información médica del caso',
    secCasoSub: 'Detalles sobre el caso médico asociado con esta cita',
    secConsent: 'Consentimientos y autorizaciones firmados',
    fecha: 'Fecha de la cita',
    horaInicio: 'Hora de inicio',
    horaFin: 'Hora de finalización',
    estado: 'Estado',
    tipo: 'Tipo',
    estadoIngreso: 'Estado del ingreso',
    nombreClinica: 'Nombre de la clínica',
    direccion: 'Dirección',
    telefono: 'Teléfono',
    email: 'Correo electrónico',
    nombreProvider: 'Nombre del especialista',
    especialidad: 'Especialidad',
    nombreCompleto: 'Nombre completo',
    codigoPaciente: 'Código de paciente',
    nacimiento: 'Fecha de nacimiento',
    estadoCuenta: 'Estado de la cuenta',
    movil: 'Móvil',
    calle: 'Dirección de calle',
    ciudad: 'Ciudad',
    estadoUS: 'Estado',
    zip: 'Código postal',
    genero: 'Género',
    estadoCivil: 'Estado civil',
    etnia: 'Etnia',
    raza: 'Raza',
    idioma: 'Idioma principal',
    contactoPref: 'Método de notificación preferido',
    farmacia: 'Farmacia preferida',
    empleador: 'Empleador',
    nombre: 'Nombre',
    relacion: 'Relación',
    idCaso: 'ID del caso',
    tipoCaso: 'Tipo de caso',
    estadoCaso: 'Estado del caso',
    casoCreado: 'Caso creado',
    accidente: 'Fecha del accidente',
    aceptado: 'Aceptado',
    pendiente: 'Pendiente',
    registrado: 'Registrado',
    noEspecificado: 'No especificado',
    firmaTitulo: 'Firme abajo para confirmar su cita',
    firmaTexto: 'Su firma confirma que revisó la información proporcionada y que acepta asistir en el horario programado.',
    firmaLabel: 'Firma del paciente',
    firmaLabelTutor: 'Firma del padre, madre o apoderado',
    limpiar: 'Limpiar',
    hint: 'Firme en el área de arriba.',
    firmante: 'Nombre de quien firma',
    firmantePh: 'Nombre y apellido',
    menorAviso: 'El paciente es menor de edad: la confirmación la firma su padre, madre o apoderado.',
    firmar: 'Firmar cita',
    firmando: 'Firmando…',
    alFirmar: 'Al firmar, confirma su cita y acepta los términos.',
    faltaFirma: 'Firme en el recuadro antes de continuar.',
    faltaNombre: 'Escriba el nombre de quien firma.',
    errorGenerico: 'No se pudo guardar la firma. Muéstrele esta pantalla a recepción.',
    errorMuchosIntentos: 'Su firma sigue dibujada. Espere unos segundos y toque "Firmar cita" de nuevo.',
    yaFirmadaTitulo: 'Cita confirmada',
    yaFirmadaTexto: 'Ya recibimos su firma. Puede acercarse a recepción.',
    firmadaEl: 'Firmada el',
    listoTitulo: '¡Gracias!',
    listoTexto: 'Su cita quedó confirmada. Acérquese a recepción cuando lo llamen.',
    consentNombres: {
      hipaa: 'Divulgación de información médica',
      assignedParties: 'Divulgación de información médica a partes cesionadas',
      treatment: 'Consentimiento para tratamiento',
      financial: 'Política y acuerdo de cargos de crédito y financiamiento',
      medicalHistory: 'Autoridad de historial médico',
    } as Record<string, string>,
  },
  en: {
    marca: 'Integrated EHR system',
    titulo: 'Appointment confirmation document',
    bajada: 'Review the appointment, patient and case information before signing. If anything is incorrect, let the front desk know before confirming.',
    secCita: 'Appointment details',
    secCitaSub: 'Complete information about the scheduled appointment',
    secClinica: 'Clinic information',
    secProvider: 'Provider',
    secNotas: 'Appointment notes',
    secPaciente: 'Patient information',
    secPacienteSub: 'Personal, contact and demographic data',
    secContacto: 'Contact information',
    secDireccion: 'Address',
    secDemografia: 'Demographic information',
    secAdicional: 'Additional information',
    secEmergencia: 'Emergency contacts',
    emergenciaPrincipal: 'Primary emergency contact',
    emergenciaSecundario: 'Secondary emergency contact',
    secCaso: 'Medical case information',
    secCasoSub: 'Details about the medical case linked to this appointment',
    secConsent: 'Signed consents and authorizations',
    fecha: 'Appointment date',
    horaInicio: 'Start time',
    horaFin: 'End time',
    estado: 'Status',
    tipo: 'Type',
    estadoIngreso: 'Check-in status',
    nombreClinica: 'Clinic name',
    direccion: 'Address',
    telefono: 'Phone',
    email: 'Email',
    nombreProvider: 'Provider name',
    especialidad: 'Specialty',
    nombreCompleto: 'Full name',
    codigoPaciente: 'Patient code',
    nacimiento: 'Date of birth',
    estadoCuenta: 'Account status',
    movil: 'Mobile',
    calle: 'Street address',
    ciudad: 'City',
    estadoUS: 'State',
    zip: 'ZIP code',
    genero: 'Gender',
    estadoCivil: 'Marital status',
    etnia: 'Ethnicity',
    raza: 'Race',
    idioma: 'Primary language',
    contactoPref: 'Preferred notification method',
    farmacia: 'Preferred pharmacy',
    empleador: 'Employer',
    nombre: 'Name',
    relacion: 'Relationship',
    idCaso: 'Case ID',
    tipoCaso: 'Case type',
    estadoCaso: 'Case status',
    casoCreado: 'Case created',
    accidente: 'Accident date',
    aceptado: 'Accepted',
    pendiente: 'Pending',
    registrado: 'Checked in',
    noEspecificado: 'Not specified',
    firmaTitulo: 'Sign below to confirm your appointment',
    firmaTexto: 'Your signature confirms that you reviewed the information provided and agree to attend at the scheduled time.',
    firmaLabel: 'Patient signature',
    firmaLabelTutor: 'Parent or guardian signature',
    limpiar: 'Clear',
    hint: 'Sign in the area above.',
    firmante: 'Name of the person signing',
    firmantePh: 'First and last name',
    menorAviso: 'The patient is a minor: a parent or legal guardian signs this confirmation.',
    firmar: 'Sign appointment',
    firmando: 'Signing…',
    alFirmar: 'By signing, you confirm your appointment and accept the terms.',
    faltaFirma: 'Please sign in the box before continuing.',
    faltaNombre: 'Please enter the name of the person signing.',
    errorGenerico: 'The signature could not be saved. Please show this screen to the front desk.',
    errorMuchosIntentos: 'Your signature is still drawn. Wait a few seconds and tap "Sign appointment" again.',
    yaFirmadaTitulo: 'Appointment confirmed',
    yaFirmadaTexto: 'We already have your signature. You may check in at the front desk.',
    firmadaEl: 'Signed on',
    listoTitulo: 'Thank you!',
    listoTexto: 'Your appointment is confirmed. Please wait to be called at the front desk.',
    consentNombres: {
      hipaa: 'Release of medical information',
      assignedParties: 'Release of medical information to assigned parties',
      treatment: 'Consent to treatment',
      financial: 'Credit charge and financing policy agreement',
      medicalHistory: 'Medical history authority',
    } as Record<string, string>,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Etiquetas de enums — el paciente no tiene que leer NOT_HISPANIC_LATINO
// ─────────────────────────────────────────────────────────────────────────────

const ENUMS: Record<string, Record<string, { es: string; en: string }>> = {
  sexo: {
    MALE:              { es: 'Varón', en: 'Male' },
    FEMALE:            { es: 'Mujer', en: 'Female' },
    NON_BINARY:        { es: 'No binario', en: 'Non-binary' },
    OTHER:             { es: 'Otro', en: 'Other' },
    PREFER_NOT_TO_SAY: { es: 'Prefiere no decirlo', en: 'Prefer not to say' },
  },
  estadoCivil: {
    SINGLE:    { es: 'Soltero/a', en: 'Single' },
    MARRIED:   { es: 'Casado/a', en: 'Married' },
    DIVORCED:  { es: 'Divorciado/a', en: 'Divorced' },
    WIDOWED:   { es: 'Viudo/a', en: 'Widowed' },
    SEPARATED: { es: 'Separado/a', en: 'Separated' },
    OTHER:     { es: 'Otro', en: 'Other' },
  },
  raza: {
    AFRICAN_AMERICAN:              { es: 'Afroamericano', en: 'African American' },
    AMERICAN_INDIAN_ALASKA_NATIVE: { es: 'Indígena americano / nativo de Alaska', en: 'American Indian / Alaska Native' },
    ASIAN:                         { es: 'Asiático', en: 'Asian' },
    NATIVE_HAWAIIAN:               { es: 'Nativo de Hawái', en: 'Native Hawaiian' },
    PACIFIC_ISLANDER:              { es: 'Isleño del Pacífico', en: 'Pacific Islander' },
    WHITE:                         { es: 'Blanco', en: 'White' },
    OTHER:                         { es: 'Otro', en: 'Other' },
    PREFER_NOT_TO_SAY:             { es: 'Prefiere no decirlo', en: 'Prefer not to say' },
  },
  etnia: {
    HISPANIC_LATINO:     { es: 'Hispano/Latino', en: 'Hispanic/Latino' },
    NOT_HISPANIC_LATINO: { es: 'No hispano/latino', en: 'Not Hispanic/Latino' },
    PREFER_NOT_TO_SAY:   { es: 'Prefiere no decirlo', en: 'Prefer not to say' },
  },
  contactoPref: {
    PHONE: { es: 'Teléfono', en: 'Phone' },
    EMAIL: { es: 'Correo electrónico', en: 'Email' },
    TEXT:  { es: 'Mensaje de texto', en: 'Text message' },
    ANY:   { es: 'Cualquiera', en: 'Any' },
  },
  estadoCita: {
    SCHEDULED:   { es: 'Programada', en: 'Scheduled' },
    CONFIRMED:   { es: 'Confirmada', en: 'Confirmed' },
    CHECKED_IN:  { es: 'Registrada', en: 'Checked in' },
    IN_PROGRESS: { es: 'En consulta', en: 'In progress' },
    COMPLETED:   { es: 'Completada', en: 'Completed' },
    PENDING:     { es: 'Pendiente', en: 'Pending' },
  },
  tipoCita: {
    AUTO_ACCIDENT:  { es: 'Accidente de tráfico', en: 'Auto accident' },
    FAMILY_PRACTICE: { es: 'Medicina familiar', en: 'Family practice' },
    URGENT_CARE:    { es: 'Atención urgente', en: 'Urgent care' },
    FOLLOW_UP:      { es: 'Control', en: 'Follow-up' },
    CONSULTATION:   { es: 'Consulta', en: 'Consultation' },
  },
  estadoCuenta: {
    NEW:        { es: 'Nuevo', en: 'New' },
    ACTIVE:     { es: 'Activo', en: 'Active' },
    COMPLETED:  { es: 'Completado', en: 'Completed' },
    DISCHARGED: { es: 'Dado de alta', en: 'Discharged' },
    INACTIVE:   { es: 'Inactivo', en: 'Inactive' },
  },
  /**
   * `CaseStatus` en lenguaje de paciente. Los estados internos del flujo
   * (INTAKE_PENDING, MMI, SETTLED…) no le dicen nada a quien está en el
   * mostrador y filtran cómo trabaja la clínica por dentro, así que los diez
   * colapsan en tres. No se inventa nada: activo, cerrado o cancelado.
   */
  estadoCaso: {
    NEW_REFERRAL:     { es: 'Activo', en: 'Active' },
    INTAKE_PENDING:   { es: 'Activo', en: 'Active' },
    INTAKE_COMPLETED: { es: 'Activo', en: 'Active' },
    CONFIRMED:        { es: 'Activo', en: 'Active' },
    ACTIVE:           { es: 'Activo', en: 'Active' },
    MMI:              { es: 'Activo', en: 'Active' },
    CLOSED:           { es: 'Cerrado', en: 'Closed' },
    SETTLED:          { es: 'Cerrado', en: 'Closed' },
    ARCHIVED:         { es: 'Cerrado', en: 'Closed' },
    CANCELLED:        { es: 'Cancelado', en: 'Cancelled' },
  },
  /**
   * `emergencyContactRelation` es texto libre, no un enum: la data migrada trae
   * "SPOUSE" pero también puede traer "Esposa" escrito a mano. Lo que no está
   * en el mapa se muestra tal cual — `etiqueta()` cae al valor original.
   */
  relacion: {
    SPOUSE:      { es: 'Cónyuge', en: 'Spouse' },
    PARENT:      { es: 'Padre / Madre', en: 'Parent' },
    MOTHER:      { es: 'Madre', en: 'Mother' },
    FATHER:      { es: 'Padre', en: 'Father' },
    CHILD:       { es: 'Hijo/a', en: 'Child' },
    SIBLING:     { es: 'Hermano/a', en: 'Sibling' },
    GRANDPARENT: { es: 'Abuelo/a', en: 'Grandparent' },
    FRIEND:      { es: 'Amigo/a', en: 'Friend' },
    GUARDIAN:    { es: 'Apoderado/a', en: 'Guardian' },
    OTHER:       { es: 'Otro', en: 'Other' },
    SELF:        { es: 'Titular', en: 'Self' },
  },
  /** `preferredLanguage` guarda el código ISO, no el nombre. */
  idioma: {
    en: { es: 'Inglés', en: 'English' },
    es: { es: 'Español', en: 'Spanish' },
    pt: { es: 'Portugués', en: 'Portuguese' },
  },
};

const C = {
  fondo:   '#0a1224',
  tarjeta: 'rgba(255,255,255,0.03)',
  borde:   'rgba(255,255,255,0.08)',
  texto:   'rgba(255,255,255,0.92)',
  suave:   'rgba(255,255,255,0.55)',
  tenue:   'rgba(255,255,255,0.38)',
  cyan:    '#06B6D4',
  verde:   '#10B981',
  rojo:    '#f87171',
  ambar:   '#fbbf24',
};

const ZONA = 'America/Denver';

export function ConfirmarClient({ datos }: { datos: DatosConfirmacion }) {
  const [lang, setLang]       = useState<Lang>('es');
  const [firma, setFirma]     = useState<string | null>(null);
  const [enviando, setEnv]    = useState(false);
  const [error, setError]     = useState('');
  const [listo, setListo]     = useState(false);

  const t = T[lang];
  const esMenor = isMinor(datos.paciente.nacimiento);

  const [firmante, setFirmante] = useState(esMenor ? '' : datos.paciente.nombre);

  // ── Formato ────────────────────────────────────────────────────────────────
  const loc = lang === 'es' ? 'es-US' : 'en-US';

  const fFecha = useCallback((iso: string) => new Date(iso).toLocaleDateString(loc, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA,
  }), [loc]);

  const fFechaCorta = useCallback((iso: string) => new Date(iso).toLocaleDateString(loc, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA,
  }), [loc]);

  const fHora = useCallback((iso: string) => new Date(iso).toLocaleTimeString(loc, {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA,
  }), [loc]);

  /**
   * La fecha de nacimiento NO lleva zona: llega como `YYYY-MM-DD` y se formatea
   * a mano. Pasarla por `toLocaleDateString` con `timeZone` la corre un día.
   */
  const fNacimiento = useCallback((ymd: string | null) => {
    if (!ymd) return null;
    const [y, m, d] = ymd.split('-');
    return lang === 'es' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
  }, [lang]);

  const fin = useMemo(
    () => new Date(new Date(datos.cita.scheduledFor).getTime() + datos.cita.durationMinutes * 60_000).toISOString(),
    [datos.cita.scheduledFor, datos.cita.durationMinutes],
  );

  /**
   * Etiqueta legible de un valor de enum. Prueba el valor tal cual y después
   * normalizado, porque no todo viene del mismo lado: los enums de Prisma
   * llegan en MAYÚSCULAS pero `preferredLanguage` y la relación del contacto de
   * emergencia son texto libre ('en', 'Spouse'). Lo que no está en el mapa se
   * muestra tal cual, nunca vacío.
   */
  const etiqueta = (grupo: string, valor: string | null): string | null => {
    if (!valor?.trim()) return null;
    const mapa = ENUMS[grupo];
    const hit =
      mapa?.[valor] ??
      mapa?.[valor.toUpperCase()] ??
      mapa?.[valor.toLowerCase()];
    return hit?.[lang] ?? valor.replace(/_/g, ' ');
  };

  // ── Firmar ─────────────────────────────────────────────────────────────────
  const firmar = async () => {
    setError('');
    if (!firma)             { setError(t.faltaFirma); return; }
    if (!firmante.trim())   { setError(t.faltaNombre); return; }

    setEnv(true);
    try {
      const res = await fetch(`/api/confirmar/${datos.token}/sign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signatureSvg: firma, signerName: firmante.trim() }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        // El 429 no es un fallo: hay que esperar. Y lo importante es decirle que
        // NO tiene que volver a dibujar — el trazo sigue en el canvas.
        setError(res.status === 429 ? t.errorMuchosIntentos : t.errorGenerico);
        return;
      }
      setListo(true);
    } catch {
      setError(t.errorGenerico);
    } finally {
      setEnv(false);
    }
  };

  // ── Pantallas terminales ───────────────────────────────────────────────────
  if (listo || datos.yaFirmada) {
    const yaEstaba = datos.yaFirmada && !listo;
    return (
      <Marco lang={lang} setLang={setLang} t={t}>
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 46, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            {yaEstaba ? t.yaFirmadaTitulo : t.listoTitulo}
          </div>
          <div style={{ fontSize: 14, color: C.suave, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
            {yaEstaba ? t.yaFirmadaTexto : t.listoTexto}
          </div>
          {datos.firmadaEl && (
            <div style={{ marginTop: 18, fontSize: 12, color: C.tenue }}>
              {t.firmadaEl} {fFechaCorta(datos.firmadaEl)} · {fHora(datos.firmadaEl)}
            </div>
          )}
        </div>
      </Marco>
    );
  }

  const p = datos.paciente;

  return (
    <Marco lang={lang} setLang={setLang} t={t}>
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.cyan, fontWeight: 700, marginBottom: 8 }}>
          PRECISION MEDICAL CARE
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.25, marginBottom: 10 }}>{t.titulo}</h1>
        <p style={{ fontSize: 14, color: C.suave, lineHeight: 1.65 }}>{t.bajada}</p>
      </div>

      {/* ── Cita ─────────────────────────────────────────────────────────── */}
      <Seccion icono="📅" titulo={t.secCita} sub={t.secCitaSub}>
        <Campos items={[
          { label: t.fecha,      valor: fFecha(datos.cita.scheduledFor) },
          { label: t.horaInicio, valor: fHora(datos.cita.scheduledFor) },
          { label: t.horaFin,    valor: fHora(fin) },
        ]} />
        <Campos items={[
          { label: t.estado,        valor: etiqueta('estadoCita', datos.cita.status) },
          { label: t.tipo,          valor: etiqueta('tipoCita', datos.cita.type) },
          { label: t.estadoIngreso, valor: datos.cita.ingresoHecho ? t.registrado : t.pendiente },
        ]} />
      </Seccion>

      {/* ── Clínica ──────────────────────────────────────────────────────── */}
      <Seccion icono="🏥" titulo={t.secClinica}>
        <Campos items={[
          { label: t.nombreClinica, valor: datos.clinica.nombre },
          { label: t.direccion,     valor: datos.clinica.direccion },
          { label: t.telefono,      valor: datos.clinica.telefono },
          { label: t.email,         valor: datos.clinica.email },
        ]} />
      </Seccion>

      {/* ── Provider ─────────────────────────────────────────────────────── */}
      {datos.provider && (
        <Seccion icono="🩺" titulo={t.secProvider}>
          <Campos items={[
            { label: t.nombreProvider, valor: datos.provider.nombre },
            { label: t.especialidad,   valor: datos.provider.especialidad },
          ]} />
        </Seccion>
      )}

      {/* ── Notas ────────────────────────────────────────────────────────── */}
      {datos.cita.notes && (
        <Seccion icono="📝" titulo={t.secNotas}>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borde}`,
            borderRadius: 8, padding: '12px 14px', fontSize: 14,
          }}>
            {datos.cita.notes}
          </div>
        </Seccion>
      )}

      {/* ── Paciente ─────────────────────────────────────────────────────── */}
      <Seccion icono="👤" titulo={t.secPaciente} sub={t.secPacienteSub}>
        <Campos items={[
          { label: t.nombreCompleto, valor: p.nombre, fuerte: true },
          { label: t.nacimiento,     valor: fNacimiento(p.nacimiento) },
          { label: t.codigoPaciente, valor: p.codigo },
          { label: t.estadoCuenta,   valor: etiqueta('estadoCuenta', p.estado) },
        ]} />

        <SubTitulo>{t.secContacto}</SubTitulo>
        <Campos items={[
          { label: t.email,    valor: p.email },
          { label: t.telefono, valor: p.telefono },
          { label: t.movil,    valor: p.movil },
        ]} />

        <SubTitulo>{t.secDireccion}</SubTitulo>
        <Campos items={[
          { label: t.calle,    valor: p.direccion },
          { label: t.ciudad,   valor: p.ciudad },
          { label: t.estadoUS, valor: p.estadoUS },
          { label: t.zip,      valor: p.zip },
        ]} />

        <SubTitulo>{t.secDemografia}</SubTitulo>
        <Campos items={[
          { label: t.genero,      valor: etiqueta('sexo', p.sexo) },
          { label: t.estadoCivil, valor: etiqueta('estadoCivil', p.estadoCivil) },
          { label: t.etnia,       valor: etiqueta('etnia', p.etnia) },
          { label: t.raza,        valor: etiqueta('raza', p.raza) },
        ]} />

        <SubTitulo>{t.secAdicional}</SubTitulo>
        <Campos items={[
          { label: t.idioma,       valor: etiqueta('idioma', p.idioma) },
          { label: t.contactoPref, valor: etiqueta('contactoPref', p.contactoPref) },
          { label: t.farmacia,     valor: p.farmacia },
          { label: t.empleador,    valor: p.empleador },
        ]} />
      </Seccion>

      {/* ── Emergencia ───────────────────────────────────────────────────── */}
      <Seccion icono="🚑" titulo={t.secEmergencia}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {datos.emergencia.map((e, i) => (
            <div key={i} style={{
              border: `1px solid ${C.borde}`, borderRadius: 10, padding: '14px 16px',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                color: C.tenue, fontWeight: 700, marginBottom: 10,
              }}>
                {i === 0 ? t.emergenciaPrincipal : t.emergenciaSecundario}
              </div>
              <Campos columnas={1} items={[
                { label: t.nombre,   valor: e.nombre },
                { label: t.telefono, valor: e.telefono },
                { label: t.relacion, valor: etiqueta('relacion', e.relacion) },
              ]} vacio={t.noEspecificado} />
            </div>
          ))}
        </div>
      </Seccion>

      {/* ── Caso ─────────────────────────────────────────────────────────── */}
      {datos.caso && (
        <Seccion icono="💼" titulo={t.secCaso} sub={t.secCasoSub}>
          <Campos items={[
            { label: t.idCaso,     valor: datos.caso.codigo },
            { label: t.tipoCaso,   valor: datos.caso.tipo },
            { label: t.estadoCaso, valor: etiqueta('estadoCaso', datos.caso.estado) },
            { label: t.casoCreado, valor: fFechaCorta(datos.caso.creado) },
          ]} />
          {datos.caso.accidenteEl && (
            <Campos items={[{ label: t.accidente, valor: fFechaCorta(datos.caso.accidenteEl) }]} />
          )}
        </Seccion>
      )}

      {/* ── Consentimientos ──────────────────────────────────────────────── */}
      {datos.consentimientos.some(c => c.aceptado) && (
        <Seccion icono="📄" titulo={t.secConsent}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {datos.consentimientos.filter(c => c.aceptado).map(c => (
              <div key={c.llave} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                border: `1px solid ${C.borde}`, borderRadius: 10, padding: '12px 14px',
                background: 'rgba(6,182,212,0.05)',
              }}>
                <span style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                  background: C.cyan, color: '#04202a', fontSize: 12, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                    {t.consentNombres[c.llave] ?? c.llave}
                  </div>
                  <div style={{ fontSize: 11, color: C.tenue, marginTop: 2 }}>{t.aceptado}</div>
                </div>
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {/* ── Firma ────────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 26, border: `1px solid ${C.borde}`, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', padding: '20px 18px',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t.firmaTitulo}</div>
        <p style={{ fontSize: 13, color: C.suave, lineHeight: 1.6, marginBottom: 16 }}>{t.firmaTexto}</p>

        {esMenor && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.30)',
            borderRadius: 10, padding: '11px 13px', marginBottom: 16,
          }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <div style={{ fontSize: 12.5, color: C.ambar, lineHeight: 1.55 }}>{t.menorAviso}</div>
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {esMenor ? t.firmaLabelTutor : t.firmaLabel} <span style={{ color: C.rojo }}>*</span>
        </div>

        <FirmaCanvas onChange={setFirma} labels={{ clear: t.limpiar, hint: t.hint }} />

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: C.suave, marginBottom: 6 }}>
            {t.firmante} <span style={{ color: C.rojo }}>*</span>
          </label>
          <input
            value={firmante}
            onChange={e => setFirmante(e.target.value)}
            placeholder={t.firmantePh}
            style={{
              width: '100%', padding: '11px 13px', fontSize: 15,
              borderRadius: 9, border: `1px solid ${C.borde}`,
              background: 'rgba(255,255,255,0.05)', color: C.texto,
            }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 14, background: 'rgba(248,113,113,0.10)',
            border: '1px solid rgba(248,113,113,0.30)', borderRadius: 9,
            padding: '11px 13px', fontSize: 13, color: C.rojo, lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={firmar}
          disabled={enviando}
          style={{
            marginTop: 18, width: '100%', padding: '15px 20px',
            borderRadius: 11, border: 'none', cursor: enviando ? 'wait' : 'pointer',
            background: enviando ? 'rgba(6,182,212,0.45)' : C.cyan,
            color: '#04202a', fontSize: 16, fontWeight: 800,
          }}
        >
          {enviando ? t.firmando : `✍  ${t.firmar}`}
        </button>
        <div style={{ marginTop: 10, fontSize: 11.5, color: C.tenue, textAlign: 'center' }}>
          {t.alFirmar}
        </div>
      </div>
    </Marco>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de presentación
// ─────────────────────────────────────────────────────────────────────────────

function Marco({
  lang, setLang, t, children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof T['es'] | typeof T['en'];
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', background: C.fondo, color: C.texto }}>
      <header style={{
        borderBottom: `1px solid ${C.borde}`, padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>
            LienMaster <span style={{ color: C.cyan, fontSize: 11, letterSpacing: '0.1em' }}>PRECISION MEDICAL</span>
          </div>
          <div style={{ fontSize: 11, color: C.tenue, marginTop: 2 }}>{t.marca}</div>
        </div>

        {/* Dos botones, no un <select>: son dos opciones y el paciente ve las dos. */}
        <div style={{ display: 'flex', border: `1px solid ${C.borde}`, borderRadius: 9, overflow: 'hidden' }}>
          {(['es', 'en'] as Lang[]).map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              style={{
                padding: '7px 13px', fontSize: 12.5, fontWeight: 700, border: 'none',
                cursor: 'pointer',
                background: lang === l ? C.cyan : 'transparent',
                color: lang === l ? '#04202a' : C.suave,
              }}
            >
              {l === 'es' ? 'Español' : 'English'}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '26px 18px 56px' }}>{children}</main>
    </div>
  );
}

function Seccion({
  icono, titulo, sub, children,
}: {
  icono: string; titulo: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: sub ? 3 : 12 }}>
        <span style={{ fontSize: 15 }}>{icono}</span>
        <h2 style={{ fontSize: 15.5, fontWeight: 700 }}>{titulo}</h2>
      </div>
      {sub && <div style={{ fontSize: 12.5, color: C.tenue, marginBottom: 12, paddingLeft: 25 }}>{sub}</div>}
      <div style={{
        border: `1px solid ${C.borde}`, borderRadius: 12,
        background: C.tarjeta, padding: '16px 18px',
      }}>
        {children}
      </div>
    </section>
  );
}

function SubTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: C.suave,
      marginTop: 18, marginBottom: 10, paddingTop: 14,
      borderTop: `1px solid ${C.borde}`,
    }}>
      {children}
    </div>
  );
}

function Campos({
  items, columnas, vacio,
}: {
  items: Array<{ label: string; valor: string | null; fuerte?: boolean }>;
  columnas?: number;
  /** Qué mostrar cuando el dato no está. Sin esto la fila se omite. */
  vacio?: string;
}) {
  // Un string VACÍO cuenta como faltante, no como valor. `decryptFieldOrOriginal`
  // devuelve '' en varios campos migrados, y con `??` la fila salía en blanco:
  // el contacto de emergencia secundario mostraba "Nombre" y "Teléfono" sin nada
  // al lado, y solo "Relación" decía "No especificado".
  const tiene = (v: string | null) => !!v?.trim();
  const visibles = vacio ? items : items.filter(i => tiene(i.valor));
  if (!visibles.length) return null;

  return (
    <div style={{
      display: 'grid', gap: '14px 22px', marginBottom: 4,
      gridTemplateColumns: columnas === 1 ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))',
    }}>
      {visibles.map(i => (
        <div key={i.label}>
          <div style={{ fontSize: 11.5, color: C.tenue, marginBottom: 3 }}>{i.label}</div>
          <div style={{
            fontSize: i.fuerte ? 16 : 14,
            fontWeight: i.fuerte ? 800 : 600,
            color: tiene(i.valor) ? C.texto : C.tenue,
            wordBreak: 'break-word',
          }}>
            {tiene(i.valor) ? i.valor : vacio}
          </div>
        </div>
      ))}
    </div>
  );
}

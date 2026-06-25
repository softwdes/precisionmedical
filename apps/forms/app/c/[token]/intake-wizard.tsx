'use client';

/**
 * B.5–B.8 — IntakeWizard · Forms del Paciente  (7 pasos)
 *
 * 1 · Landing             — saludo, Sifo, cita próxima, lista de pasos   (B.5)
 * 2 · Datos personales    — nombre, DOB, tel, email, contacto emergencia  (B.6)
 * 3 · Tu accidente        — fecha, tipo, ubicación, descripción            (B.6)
 * 4 · Tu seguro           — aseguradora PIP, póliza                       (B.6)
 * 5 · Historial médico    — salud gral, medicamentos, alergias, lesiones  (B.7)
 * 6 · Tu identificación   — selfie, licencia, tarjeta de seguro           (B.7)
 * 7 · Firma del Lien      — canvas + metadata + lien legal expandible     (B.8)
 *
 * Phase 1A features incluidas:
 *   ✓ Bilingual toggle ES/EN  ✓ preferredLanguage field en Step 2
 *   ✓ Appointment info en Step 1  ✓ Auto-save indicator "💾 HH:MM"
 *   ✓ "Ver texto legal completo ›" expandible (Step 7)
 *   ✓ Signature metadata (timestamp + device) en Step 7
 *   ✓ "Lo tomo en la clínica" fallback en Step 6
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientData {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
}

interface AccidentData {
  date: string | null;
  type: string | null;
  notes: string | null;
  location: string | null;
}

interface NextAppointment {
  scheduledFor: string;
  providerName: string | null;
}

interface Props {
  token: string;
  caseId: string;
  caseCode: string;
  patient: PatientData;
  accident: AccidentData;
  casePolicyNumber: string | null;
  nextAppointment: NextAppointment | null;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type AccidentType = 'AUTO' | 'MOTORCYCLE' | 'PEDESTRIAN' | 'WORKPLACE' | 'OTHER';
type HealthStatus = 'excellent' | 'good' | 'fair' | 'poor';
type Lang = 'es' | 'en';

// ─── Bilingual strings ────────────────────────────────────────────────────────

const STRINGS = {
  es: {
    langToggle: 'EN',
    // Step 1
    greeting: (n: string) => `Hola, ${n} 👋`,
    greetingSub: 'Te acompaño en tu registro inicial. Solo toma 5 minutos.',
    caseNumberLabel: 'Número de caso',
    accidentLabel: 'Accidente',
    apptLabel: 'Tu próxima cita',
    apptWith: 'con Dr.',
    todayStepsLabel: 'Lo que completarás hoy',
    todaySteps: [
      { icon: '👤', label: 'Datos personales' },
      { icon: '🚗', label: 'Detalles del accidente' },
      { icon: '🏥', label: 'Información de tu seguro' },
      { icon: '💊', label: 'Historial médico' },
      { icon: '📸', label: 'Foto de identificación' },
      { icon: '✍️', label: 'Firma del acuerdo de lien' },
    ],
    startBtn: 'Comenzar →',
    secureNote: '🔒 Tu información es confidencial y segura',
    sifoHint1: '¡Hola! Soy Sifo ✨ Te guío en cada paso. Solo toma ~5 minutos.',
    // Step 2
    personalTitle: 'Datos personales',
    personalSub: 'Verifica que tu información esté correcta.',
    firstName: 'Nombre',
    lastName: 'Apellido',
    dob: 'Fecha de nacimiento',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    preferredLangLabel: 'Idioma preferido',
    langOptionEs: '🇪🇸 Español',
    langOptionEn: '🇺🇸 English',
    emergencySection: 'Contacto de emergencia',
    emergencyName: 'Nombre del contacto',
    emergencyPhone: 'Teléfono de emergencia',
    emergencyNamePh: 'Ej: María García',
    emergencyPhonePh: '(801) 555-0200',
    sifoHint2: 'Verifica que tus datos coincidan con tu ID. Los usaremos en tus documentos médicos.',
    // Step 3
    accidentTitle: 'Tu accidente',
    accidentSub: 'Necesitamos los detalles del accidente para procesar tu caso.',
    accidentDate: 'Fecha del accidente',
    accidentTypeLabel: 'Tipo de accidente',
    accidentTypesMap: { AUTO: '🚗 Auto', MOTORCYCLE: '🏍️ Moto', PEDESTRIAN: '🚶 Peatón', WORKPLACE: '🏭 Trabajo', OTHER: '❓ Otro' } as Record<AccidentType, string>,
    accidentLocation: 'Ubicación del accidente',
    accidentLocationPh: 'Ej: I-15 y 500 S, Provo, UT',
    accidentDesc: 'Describe brevemente cómo ocurrió',
    accidentDescPh: 'Ej: Me impactaron por detrás mientras esperaba en semáforo...',
    sifoHint3: 'La fecha exacta del accidente es clave para procesar tu caso correctamente.',
    // Step 4
    insuranceTitle: 'Tu seguro',
    insuranceSub: 'Información de tu seguro Personal Injury Protection (PIP).',
    pipTitle: '¿Qué es el PIP?',
    pipDesc: 'Personal Injury Protection (PIP) es la cobertura de tu seguro de auto que paga los tratamientos médicos causados por el accidente, sin importar quién tuvo la culpa.',
    carrier: 'Compañía aseguradora (PIP)',
    carrierPh: 'Ej: State Farm, Progressive, GEICO...',
    policyNum: 'Número de póliza',
    policyNumPh: 'Ej: POL-123456789',
    sifoHint4: 'Tu seguro PIP (Personal Injury Protection) cubre los tratamientos del accidente.',
    // Step 5 — Historial médico
    healthTitle: 'Historial médico',
    healthSub: 'Tu información es confidencial. Nos ayuda a darte el mejor cuidado.',
    healthStatusLabel: 'Estado general de salud',
    healthExcellent: 'Excelente',
    healthGood: 'Buena',
    healthFair: 'Regular',
    healthPoor: 'Mala',
    hasMeds: '¿Tomas medicamentos actualmente?',
    medsDetailLabel: 'Lista tus medicamentos:',
    medsDetailPh: 'Ej: Ibuprofeno 400mg, Lisinopril 10mg...',
    hasAllergies: '¿Tienes alergias conocidas?',
    allergiesDetailLabel: 'Describe tus alergias:',
    allergiesDetailPh: 'Ej: Penicilina, mariscos...',
    hasPrevInjuries: '¿Has tenido lesiones o cirugías previas?',
    prevInjuriesDetailLabel: 'Describe brevemente:',
    prevInjuriesDetailPh: 'Ej: Cirugía de rodilla en 2019...',
    yes: 'Sí',
    no: 'No',
    sifoHint5: 'Tu historial médico nos ayuda a diseñar el mejor plan de tratamiento para ti.',
    // Step 6
    idTitle: 'Tu identificación',
    idSub: 'Necesitamos tu ID para verificar tu identidad. Fase 1A: fotos se revisan en tu primera visita.',
    selfieLabel: 'Selfie tipo ID',
    selfieBtn: 'Seleccionar selfie',
    dlLabel: 'Licencia de conducir',
    dlFront: 'Frente de la licencia',
    dlBack: 'Reverso de la licencia',
    insCardLabel: 'Tarjeta de seguro',
    insCardBtn: 'Foto de tu tarjeta de seguro',
    phase1Note: '📋 Fase de Registro: Tus fotos serán revisadas en tu primera visita. No se almacenan en el sistema hasta completar el protocolo de seguridad HIPAA.',
    cantPhotoTitle: '¿No puedes tomar las fotos ahora?',
    takeAtClinicBtn: '📋 Lo tomo en la clínica el día de mi cita',
    clinicSelectedMsg: '✓ Llevarás tu ID a la clínica. El equipo te ayudará con las fotos.',
    continueToSign: 'Continuar a firma →',
    sifoHint6: 'Necesitamos tu ID para verificar tu identidad. Tus fotos están seguras 🔒',
    // Step 6 — Photo capture guidance
    selfieInstructions: ['Buena iluminación frontal', 'Centra tu rostro en el óvalo', 'Sin lentes ni gorras'],
    dlFrontInstructions: ['Superficie plana, sin reflejos', 'Toda la licencia visible', 'Texto legible y nítido'],
    dlBackInstructions: ['Reverso completo visible', 'Sin reflejos ni sombras', 'Código de barras sin cortar'],
    insCardInstructions: ['Tarjeta completa visible', 'Nombre y número de póliza legibles', 'Sin reflejos ni dedos'],
    reviewQuestion: '¿Se ve bien?',
    usePhotoBtn: '✅ Usar esta foto',
    retakeBtn: '🔄 Retomar',
    changePhotoBtn: 'Cambiar',
    selfieCaptureLabel: '📷 Abrir cámara — selfie',
    dlFrontCaptureLabel: '📷 Abrir cámara',
    dlBackCaptureLabel: '📷 Abrir cámara',
    insCardCaptureLabel: '📷 Abrir cámara',
    // Cámara in-app
    camGuideFace: 'Centra tu rostro en el óvalo',
    camGuideDoc: 'Alinea el documento dentro del marco',
    camCapture: 'Capturar',
    camCancel: 'Cancelar',
    camPermError: 'No se pudo acceder a la cámara. Verifica los permisos de tu navegador.',
    camFallback: 'Usar galería en su lugar',
    camLoading: 'Iniciando cámara...',
    // Step 7
    lienTitle: 'Firma del Lien',
    lienSub: 'Este acuerdo autoriza a Precision Medical a tratar tu lesión. Es un documento legal.',
    plainLangLabel: 'EN LENGUAJE CLARO',
    lienSimple: 'Tu tratamiento médico se paga cuando termine tu caso legal. No tienes que pagar de tu bolsillo. Precision Medical cobra directamente del settlement de tu caso.',
    showFullLegal: 'Ver texto legal completo ›',
    hideFullLegal: 'Ocultar texto legal ‹',
    lienLegalTitle: 'Acuerdo de Gravamen Médico — Precision Medical Care',
    lienLegalBody: 'Al firmar este documento, autorizo a Precision Medical Care a proporcionar los tratamientos médicos necesarios para las lesiones derivadas del accidente. Entiendo y acepto que:\n\n• Los costos del tratamiento serán cubiertos bajo lien contra la demanda de lesiones personales.\n• Precision Medical Care tiene derecho a cobrar directamente de cualquier liquidación, sentencia o pago de seguros.\n• Tengo el derecho de conocer todos los cargos y de recibir una copia de este acuerdo.\n• Puedo retirar este consentimiento en cualquier momento mediante aviso escrito.\n\nEsta firma tiene validez legal conforme a ESIGN Act y UETA (Utah Code § 46-4-101 et seq.).',
    signHereLabel: 'Tu firma (dibuja aquí)',
    signPlaceholder: '✍️ Dibuja tu firma aquí',
    clearSigBtn: '× Borrar y volver a firmar',
    signerNameLabel: 'Nombre completo del firmante',
    signerEmailLabel: 'Correo electrónico (opcional)',
    signerEmailPh: 'para recibir copia',
    agreeCheckbox: 'He leído y acepto el Acuerdo de Lien Médico. Entiendo que esta firma es legalmente vinculante.',
    signBtn: '✓ Firmar y completar registro',
    signing: '⏳ Firmando...',
    legalNote: '🔒 Firmado digitalmente — ESIGN Act · UETA Utah',
    sigMetaLabel: 'REGISTRO DE FIRMA',
    sigTimeLabel: 'Fecha y hora',
    sigDeviceLabel: 'Dispositivo',
    sifoHint7: 'Esta firma autoriza a Precision Medical a tratar tu lesión bajo lien. Es legal y vinculante.',
    // Common
    back: '← Atrás',
    continue: 'Continuar →',
    saving: '⏳ Guardando...',
    savedAt: (t: string) => `💾 ${t}`,
    saveError: 'Error guardando. Intenta de nuevo.',
    signError: 'Error al firmar. Intenta de nuevo.',
  },

  en: {
    langToggle: 'ES',
    // Step 1
    greeting: (n: string) => `Hello, ${n} 👋`,
    greetingSub: 'Let me guide you through your initial registration. It only takes 5 minutes.',
    caseNumberLabel: 'Case number',
    accidentLabel: 'Accident',
    apptLabel: 'Your next appointment',
    apptWith: 'with Dr.',
    todayStepsLabel: 'What you will complete today',
    todaySteps: [
      { icon: '👤', label: 'Personal information' },
      { icon: '🚗', label: 'Accident details' },
      { icon: '🏥', label: 'Insurance information' },
      { icon: '💊', label: 'Medical history' },
      { icon: '📸', label: 'Photo ID' },
      { icon: '✍️', label: 'Medical lien agreement' },
    ],
    startBtn: 'Get started →',
    secureNote: '🔒 Your information is confidential and secure',
    sifoHint1: "Hi! I'm Sifo ✨ I'll guide you through each step. It only takes ~5 minutes.",
    // Step 2
    personalTitle: 'Personal information',
    personalSub: 'Please verify that your information is correct.',
    firstName: 'First name',
    lastName: 'Last name',
    dob: 'Date of birth',
    phone: 'Phone number',
    email: 'Email address',
    preferredLangLabel: 'Preferred language',
    langOptionEs: '🇪🇸 Spanish',
    langOptionEn: '🇺🇸 English',
    emergencySection: 'Emergency contact',
    emergencyName: 'Contact name',
    emergencyPhone: 'Emergency phone',
    emergencyNamePh: 'E.g., Maria Garcia',
    emergencyPhonePh: '(801) 555-0200',
    sifoHint2: 'Make sure your info matches your ID. We use it in your medical documents.',
    // Step 3
    accidentTitle: 'Your accident',
    accidentSub: 'We need the accident details to process your case.',
    accidentDate: 'Accident date',
    accidentTypeLabel: 'Accident type',
    accidentTypesMap: { AUTO: '🚗 Auto', MOTORCYCLE: '🏍️ Motorcycle', PEDESTRIAN: '🚶 Pedestrian', WORKPLACE: '🏭 Workplace', OTHER: '❓ Other' } as Record<AccidentType, string>,
    accidentLocation: 'Accident location',
    accidentLocationPh: 'E.g., I-15 & 500 S, Provo, UT',
    accidentDesc: 'Briefly describe what happened',
    accidentDescPh: 'E.g., I was rear-ended while waiting at a red light...',
    sifoHint3: 'The exact accident date is key to processing your case correctly.',
    // Step 4
    insuranceTitle: 'Your insurance',
    insuranceSub: 'Information about your Personal Injury Protection (PIP) insurance.',
    pipTitle: 'What is PIP?',
    pipDesc: 'Personal Injury Protection (PIP) is your auto insurance coverage that pays for medical treatments caused by the accident, regardless of who was at fault.',
    carrier: 'Insurance company (PIP)',
    carrierPh: 'E.g., State Farm, Progressive, GEICO...',
    policyNum: 'Policy number',
    policyNumPh: 'E.g., POL-123456789',
    sifoHint4: 'Your PIP (Personal Injury Protection) insurance covers accident-related treatments.',
    // Step 5
    healthTitle: 'Medical history',
    healthSub: 'Your information is confidential. It helps us provide the best care.',
    healthStatusLabel: 'General health status',
    healthExcellent: 'Excellent',
    healthGood: 'Good',
    healthFair: 'Fair',
    healthPoor: 'Poor',
    hasMeds: 'Are you currently taking any medications?',
    medsDetailLabel: 'List your medications:',
    medsDetailPh: 'E.g., Ibuprofen 400mg, Lisinopril 10mg...',
    hasAllergies: 'Do you have any known allergies?',
    allergiesDetailLabel: 'Describe your allergies:',
    allergiesDetailPh: 'E.g., Penicillin, shellfish...',
    hasPrevInjuries: 'Have you had previous injuries or surgeries?',
    prevInjuriesDetailLabel: 'Briefly describe:',
    prevInjuriesDetailPh: 'E.g., Knee surgery in 2019...',
    yes: 'Yes',
    no: 'No',
    sifoHint5: 'Your medical history helps us design the best treatment plan for you.',
    // Step 6
    idTitle: 'Your identification',
    idSub: 'We need your ID to verify your identity. Phase 1A: photos are reviewed at your first visit.',
    selfieLabel: 'ID-style selfie',
    selfieBtn: 'Select selfie',
    dlLabel: "Driver's license",
    dlFront: 'Front of license',
    dlBack: 'Back of license',
    insCardLabel: 'Insurance card',
    insCardBtn: 'Photo of your insurance card',
    phase1Note: '📋 Registration Phase: Your photos will be reviewed at your first visit. They are not stored until the HIPAA security protocol is complete.',
    cantPhotoTitle: "Can't take photos right now?",
    takeAtClinicBtn: '📋 I will take them at the clinic on my appointment day',
    clinicSelectedMsg: '✓ You will bring your ID to the clinic. Staff will help with photos.',
    continueToSign: 'Continue to signature →',
    sifoHint6: 'We need your ID to verify your identity. Your photos are secure 🔒',
    // Step 6 — Photo capture guidance
    selfieInstructions: ['Good front lighting', 'Center your face in the oval', 'No glasses or hats'],
    dlFrontInstructions: ['Flat surface, no glare', 'Full license visible', 'Text readable and in focus'],
    dlBackInstructions: ['Full back side visible', 'No glare or shadows', 'Barcode not cut off'],
    insCardInstructions: ['Full card visible', 'Name and policy number readable', 'No glare or fingers'],
    reviewQuestion: 'Does this look good?',
    usePhotoBtn: '✅ Use this photo',
    retakeBtn: '🔄 Retake',
    changePhotoBtn: 'Change',
    selfieCaptureLabel: '📷 Open camera — selfie',
    dlFrontCaptureLabel: '📷 Open camera',
    dlBackCaptureLabel: '📷 Open camera',
    insCardCaptureLabel: '📷 Open camera',
    // In-app camera
    camGuideFace: 'Center your face in the oval',
    camGuideDoc: 'Align the document within the frame',
    camCapture: 'Capture',
    camCancel: 'Cancel',
    camPermError: 'Could not access camera. Please check your browser permissions.',
    camFallback: 'Use gallery instead',
    camLoading: 'Starting camera...',
    // Step 7
    lienTitle: 'Lien Signature',
    lienSub: 'This agreement authorizes Precision Medical to treat your injury. It is a legal document.',
    plainLangLabel: 'IN PLAIN LANGUAGE',
    lienSimple: 'Your medical treatment is paid when your legal case ends. You do not pay out of pocket. Precision Medical collects directly from your case settlement.',
    showFullLegal: 'View full legal text ›',
    hideFullLegal: 'Hide legal text ‹',
    lienLegalTitle: 'Medical Lien Agreement — Precision Medical Care',
    lienLegalBody: 'By signing this document, I authorize Precision Medical Care to provide the necessary medical treatments for injuries resulting from the accident. I understand and agree that:\n\n• Treatment costs will be covered under a lien against the personal injury claim.\n• Precision Medical Care has the right to collect directly from any settlement, judgment, or insurance payment.\n• I have the right to know all charges and to receive a copy of this agreement.\n• I may withdraw this consent at any time in writing.\n\nThis signature is legally valid under ESIGN Act and UETA (Utah Code § 46-4-101 et seq.).',
    signHereLabel: 'Your signature (draw here)',
    signPlaceholder: '✍️ Draw your signature here',
    clearSigBtn: '× Clear and re-sign',
    signerNameLabel: 'Full name of signer',
    signerEmailLabel: 'Email address (optional)',
    signerEmailPh: 'to receive a copy',
    agreeCheckbox: 'I have read and accept the Medical Lien Agreement. I understand that this signature is legally binding.',
    signBtn: '✓ Sign and complete registration',
    signing: '⏳ Signing...',
    legalNote: '🔒 Digitally signed — ESIGN Act · UETA Utah',
    sigMetaLabel: 'SIGNATURE RECORD',
    sigTimeLabel: 'Date and time',
    sigDeviceLabel: 'Device',
    sifoHint7: 'This signature authorizes Precision Medical to treat your injury under a lien. It is legal and binding.',
    // Common
    back: '← Back',
    continue: 'Continue →',
    saving: '⏳ Saving...',
    savedAt: (t: string) => `💾 ${t}`,
    saveError: 'Error saving. Please try again.',
    signError: 'Error signing. Please try again.',
  },
};

// ─── Style constants ──────────────────────────────────────────────────────────

const BG           = '#0a1224';
const CYAN         = '#06B6D4';
const INDIGO       = '#6366F1';
const EMERALD      = '#10B981';
const CARD_BG      = 'rgba(255,255,255,0.04)';
const CARD_BORDER  = 'rgba(255,255,255,0.08)';

const S = {
  screen: {
    minHeight: '100vh', background: BG, color: '#fff',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  } as React.CSSProperties,
  container: {
    maxWidth: 480, margin: '0 auto', padding: '0 16px 60px',
  } as React.CSSProperties,
  topBar: {
    position: 'sticky', top: 0, zIndex: 20, background: BG,
    borderBottom: `1px solid ${CARD_BORDER}`, padding: '10px 16px',
  } as React.CSSProperties,
  input: {
    width: '100%', padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  } as React.CSSProperties,
  textarea: {
    width: '100%', padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
    resize: 'none' as const, fontFamily: 'inherit', minHeight: 80, boxSizing: 'border-box',
  } as React.CSSProperties,
  btnPrimary: {
    width: '100%', padding: '14px',
    background: `linear-gradient(135deg, ${INDIGO}, #8B5CF6)`, border: 'none',
    borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.01em',
  } as React.CSSProperties,
  btnEmerald: {
    width: '100%', padding: '14px',
    background: `linear-gradient(135deg, ${EMERALD}, #06B6D4)`, border: 'none',
    borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  } as React.CSSProperties,
  btnOutline: {
    padding: '12px 20px', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
    color: 'rgba(255,255,255,0.65)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  } as React.CSSProperties,
  card: {
    background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 16,
  } as React.CSSProperties,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoToInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

function fmtAppt(iso: string, locale: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver',
  });
  const timePart = d.toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
  return `${datePart} · ${timePart}`;
}

function fmtSigTime(d: Date, locale: string): string {
  return d.toLocaleString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function getSavedLabel(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function isValidNANP(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) return false;
  const area = digits[0];
  const exchange = digits[3];
  return area >= '2' && exchange >= '2';
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntakeWizard({
  token, caseId: _caseId, caseCode, patient, accident, casePolicyNumber, nextAppointment,
}: Props) {
  const router = useRouter();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [step, setStep]           = useState<Step>(1);
  const [lang, setLang]           = useState<Lang>('es');
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [personal, setPersonal] = useState({
    firstName:            patient.firstName,
    lastName:             patient.lastName,
    dateOfBirth:          isoToInput(patient.dateOfBirth),
    phone:                patient.phone ?? '',
    email:                patient.email ?? '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const [acc, setAcc] = useState({
    date:     isoToInput(accident.date),
    type:     (accident.type ?? 'AUTO') as AccidentType,
    location: accident.location ?? '',
    notes:    accident.notes ?? '',
  });

  const [insurance, setInsurance] = useState({
    carrier:      patient.insuranceCarrier ?? '',
    policyNumber: casePolicyNumber ?? patient.policyNumber ?? '',
  });

  const [health, setHealth] = useState({
    healthStatus:        'good' as HealthStatus,
    hasMedications:      false,
    medications:         '',
    hasAllergies:        false,
    allergies:           '',
    hasPreviousInjuries: false,
    previousInjuries:    '',
  });

  // Step 6 — ID photos (Phase 1A: collected, not uploaded pre-HIPAA BAA)
  const [idPhotos, setIdPhotos] = useState({
    selfie:        null as File | null,
    dlFront:       null as File | null,
    dlBack:        null as File | null,
    insuranceCard: null as File | null,
  });
  const [takeAtClinic, setTakeAtClinic] = useState(false);

  // ── Validation errors ───────────────────────────────────────────────────────
  const [phoneError, setPhoneError]             = useState('');
  const [emerPhoneError, setEmerPhoneError]     = useState('');

  // Step 7 — Lien signature
  const [showFullLegal, setShowFullLegal] = useState(false);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const isDrawing     = useRef(false);
  const [hasSig, setHasSig]             = useState(false);
  const [sigTimestamp, setSigTimestamp] = useState<Date | null>(null);
  const [signerName, setSignerName]     = useState(`${patient.firstName} ${patient.lastName}`);
  const [signerEmail, setSignerEmail]   = useState(patient.email ?? '');
  const [agreed, setAgreed]             = useState(false);
  const [submitting, setSubmitting]     = useState(false);

  // ── Canvas drawing ──────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawing.current = true;
    if (!sigTimestamp) setSigTimestamp(new Date());
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [sigTimestamp]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = EMERALD;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setHasSig(true);
  }, []);

  const endDraw = useCallback(() => { isDrawing.current = false; }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    setSigTimestamp(null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width  = parent.clientWidth;
      canvas.height = 160;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── API helpers ─────────────────────────────────────────────────────────────
  const saveStepData = async (stepNum: number): Promise<boolean> => {
    setSaving(true);
    setSaveError('');
    try {
      let body: Record<string, unknown> = {};
      if (stepNum === 2) body = { personal: { ...personal, preferredLanguage: lang } };
      if (stepNum === 3) body = { accident: acc };
      if (stepNum === 4) body = { insurance };
      if (stepNum === 5) body = { health };

      const res = await fetch(`/api/intake/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepNum, data: body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLastSaved(new Date());
      return true;
    } catch {
      setSaveError(STRINGS[lang].saveError);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goNext = async (fromStep: Step) => {
    if (fromStep === 2) {
      let valid = true;
      if (personal.phone && !isValidNANP(personal.phone)) {
        setPhoneError(lang === 'es' ? 'Teléfono inválido. Usa el formato (801) 555-0100.' : 'Invalid phone. Use format (801) 555-0100.');
        valid = false;
      } else {
        setPhoneError('');
      }
      if (personal.emergencyContactPhone && !isValidNANP(personal.emergencyContactPhone)) {
        setEmerPhoneError(lang === 'es' ? 'Teléfono inválido. Usa el formato (801) 555-0100.' : 'Invalid phone. Use format (801) 555-0100.');
        valid = false;
      } else {
        setEmerPhoneError('');
      }
      if (!valid) return;
    }
    if ([2, 3, 4, 5].includes(fromStep)) {
      const ok = await saveStepData(fromStep);
      if (!ok) return;
    }
    setStep(s => (s + 1) as Step);
    window.scrollTo(0, 0);
  };

  const goBack = () => {
    setSaveError('');
    setStep(s => (s - 1) as Step);
    window.scrollTo(0, 0);
  };

  const submitSignature = async () => {
    if (!hasSig || !signerName.trim() || !agreed) return;
    setSubmitting(true);
    setSaveError('');
    try {
      const canvas  = canvasRef.current;
      const svgData = canvas ? canvas.toDataURL('image/png') : '';
      const res = await fetch(`/api/intake/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName:   signerName.trim(),
          signerEmail:  signerEmail.trim() || null,
          signatureSvg: svgData,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push(`/c/${token}/done`);
    } catch {
      setSaveError(STRINGS[lang].signError);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const t             = STRINGS[lang];
  const totalSteps    = 7;
  const progressSteps = Math.min(step, totalSteps);
  const savedLabel    = lastSaved ? t.savedAt(getSavedLabel(lastSaved, lang)) : null;
  const deviceInfo    = typeof window !== 'undefined'
    ? (window.innerWidth < 768 ? (lang === 'es' ? 'Móvil' : 'Mobile') : 'Desktop')
    : '—';

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div style={S.screen}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={S.topBar}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Logo chip */}
          <div style={{
            padding: '4px 10px', borderRadius: 20, flexShrink: 0,
            background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: CYAN,
          }}>PM</div>

          {/* Progress segments */}
          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
              <div key={s} style={{
                height: 4, flex: 1, borderRadius: 2,
                background: s < progressSteps ? EMERALD : s === progressSteps ? CYAN : 'rgba(255,255,255,0.12)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>

          {/* Step counter */}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', flexShrink: 0 }}>
            {progressSteps}/{totalSteps}
          </span>

          {/* Auto-save indicator */}
          {savedLabel && (
            <span style={{ fontSize: 10, color: EMERALD, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {savedLabel}
            </span>
          )}

          {/* Language toggle */}
          <button
            type="button"
            onClick={() => setLang(l => l === 'es' ? 'en' : 'es')}
            style={{
              padding: '3px 8px', borderRadius: 6, flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.60)', fontSize: 10, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em',
            }}
          >{t.langToggle}</button>

          {/* Exit button */}
          <button
            type="button"
            onClick={() => {
              const msg = lang === 'es'
                ? '¿Seguro que quieres salir? Tu progreso no guardado se perderá.'
                : 'Are you sure you want to exit? Unsaved progress will be lost.';
              if (window.confirm(msg)) window.close();
            }}
            style={{
              padding: '3px 8px', borderRadius: 6, flexShrink: 0,
              background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.25)',
              color: 'rgba(244,63,94,0.80)', fontSize: 10, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em',
            }}
          >✕ {lang === 'es' ? 'Salir' : 'Exit'}</button>
        </div>
      </div>

      <div style={S.container}>

        {/* ══════ STEP 1 · Landing (B.5) ══════════════════════════════════════ */}
        {step === 1 && (
          <div style={{ paddingTop: 40 }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20,
                padding: '6px 14px', borderRadius: 20,
                background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)',
              }}>
                <span style={{ color: CYAN, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
                  PRECISION MEDICAL
                </span>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10, lineHeight: 1.2 }}>
                {t.greeting(patient.firstName)}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.65 }}>
                {t.greetingSub}
              </p>
            </div>

            {/* Case + appointment card */}
            <div style={{ ...S.card, marginBottom: 20 }}>
              <div style={{ textAlign: 'center', paddingBottom: nextAppointment ? 12 : 0, marginBottom: nextAppointment ? 12 : 0, borderBottom: nextAppointment ? `1px solid ${CARD_BORDER}` : 'none' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
                  {t.caseNumberLabel}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: '#A5B4FC', letterSpacing: '0.06em' }}>
                  {caseCode}
                </div>
                {accident.date && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                    {t.accidentLabel}: {fmtDate(accident.date, lang)}
                  </div>
                )}
              </div>
              {nextAppointment && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '2px 0' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                  }}>📅</div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: CYAN, fontWeight: 700, marginBottom: 3 }}>
                      {t.apptLabel}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.4 }}>
                      {fmtAppt(nextAppointment.scheduledFor, lang)}
                    </div>
                    {nextAppointment.providerName && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                        {t.apptWith} {nextAppointment.providerName}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Steps checklist */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                {t.todayStepsLabel}
              </div>
              {t.todaySteps.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: i < t.todaySteps.length - 1 ? `1px solid ${CARD_BORDER}` : 'none',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(6,182,212,0.10)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                  }}>{item.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                    {lang === 'es' ? `Paso ${i + 1} · ` : `Step ${i + 1} · `}{item.label}
                  </div>
                </div>
              ))}
            </div>

            <SifoHint hint={t.sifoHint1} />
            <button type="button" style={{ ...S.btnPrimary, marginTop: 20 }}
              onClick={() => { setStep(2); window.scrollTo(0, 0); }}>
              {t.startBtn}
            </button>
            <p style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              {t.secureNote}
            </p>
          </div>
        )}

        {/* ══════ STEP 2 · Datos personales (B.6) ═════════════════════════════ */}
        {step === 2 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="👤" title={t.personalTitle} sub={t.personalSub} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label={t.firstName}>
                  <input type="text" style={S.input} value={personal.firstName}
                    onChange={e => setPersonal(p => ({ ...p, firstName: e.target.value }))} />
                </Field>
                <Field label={t.lastName}>
                  <input type="text" style={S.input} value={personal.lastName}
                    onChange={e => setPersonal(p => ({ ...p, lastName: e.target.value }))} />
                </Field>
              </div>

              <Field label={t.dob}>
                <input type="date" style={S.input} value={personal.dateOfBirth}
                  onChange={e => setPersonal(p => ({ ...p, dateOfBirth: e.target.value }))} />
              </Field>

              <Field label={t.phone}>
                <input type="tel" style={{ ...S.input, ...(phoneError ? { borderColor: '#F43F5E' } : {}) }}
                  value={personal.phone}
                  placeholder="(801) 555-0100"
                  onChange={e => { setPersonal(p => ({ ...p, phone: e.target.value })); setPhoneError(''); }} />
                {phoneError && <span style={{ fontSize: 11, color: '#F43F5E', marginTop: 4, display: 'block' }}>{phoneError}</span>}
              </Field>

              <Field label={t.email}>
                <input type="email" style={S.input} value={personal.email}
                  placeholder="correo@ejemplo.com"
                  onChange={e => setPersonal(p => ({ ...p, email: e.target.value }))} />
              </Field>

              {/* Preferred language */}
              <Field label={t.preferredLangLabel}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['es', 'en'] as Lang[]).map(l => (
                    <button key={l} type="button" onClick={() => setLang(l)} style={{
                      padding: '11px 8px', borderRadius: 10,
                      border: lang === l ? '1px solid rgba(6,182,212,0.55)' : '1px solid rgba(255,255,255,0.10)',
                      background: lang === l ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                      color: lang === l ? CYAN : 'rgba(255,255,255,0.55)',
                      fontSize: 13, fontWeight: lang === l ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all 0.2s',
                    }}>
                      {l === 'es' ? t.langOptionEs : t.langOptionEn}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Emergency contact */}
              <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  {t.emergencySection}
                </div>
                <Field label={t.emergencyName}>
                  <input type="text" style={S.input} value={personal.emergencyContactName}
                    placeholder={t.emergencyNamePh}
                    onChange={e => setPersonal(p => ({ ...p, emergencyContactName: e.target.value }))} />
                </Field>
                <Field label={t.emergencyPhone}>
                  <input type="tel" style={{ ...S.input, ...(emerPhoneError ? { borderColor: '#F43F5E' } : {}) }}
                    value={personal.emergencyContactPhone}
                    placeholder={t.emergencyPhonePh}
                    onChange={e => { setPersonal(p => ({ ...p, emergencyContactPhone: e.target.value })); setEmerPhoneError(''); }} />
                  {emerPhoneError && <span style={{ fontSize: 11, color: '#F43F5E', marginTop: 4, display: 'block' }}>{emerPhoneError}</span>}
                </Field>
              </div>
            </div>

            <SifoHint hint={t.sifoHint2} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(2 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 3 · Tu accidente (B.6) ══════════════════════════════════ */}
        {step === 3 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="🚗" title={t.accidentTitle} sub={t.accidentSub} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label={t.accidentDate}>
                <input type="date" style={S.input} value={acc.date}
                  onChange={e => setAcc(a => ({ ...a, date: e.target.value }))} />
              </Field>

              <Field label={t.accidentTypeLabel}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {(Object.keys(t.accidentTypesMap) as AccidentType[]).map(key => (
                    <button key={key} type="button" onClick={() => setAcc(a => ({ ...a, type: key }))} style={{
                      padding: '10px 6px', borderRadius: 8,
                      border: acc.type === key ? '1px solid rgba(6,182,212,0.60)' : '1px solid rgba(255,255,255,0.10)',
                      background: acc.type === key ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                      color: acc.type === key ? CYAN : 'rgba(255,255,255,0.60)',
                      fontSize: 12, fontWeight: acc.type === key ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                    }}>
                      {t.accidentTypesMap[key]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={t.accidentLocation}>
                <input type="text" style={S.input} value={acc.location}
                  placeholder={t.accidentLocationPh}
                  onChange={e => setAcc(a => ({ ...a, location: e.target.value }))} />
              </Field>

              <Field label={t.accidentDesc}>
                <textarea style={S.textarea} value={acc.notes}
                  placeholder={t.accidentDescPh}
                  onChange={e => setAcc(a => ({ ...a, notes: e.target.value }))} />
              </Field>
            </div>

            <SifoHint hint={t.sifoHint3} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(3 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 4 · Tu seguro (B.6) ══════════════════════════════════════ */}
        {step === 4 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="🏥" title={t.insuranceTitle} sub={t.insuranceSub} />

            <div style={{
              ...S.card, marginBottom: 16,
              background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.20)',
            }}>
              <div style={{ fontSize: 12, color: CYAN, fontWeight: 700, marginBottom: 4 }}>{t.pipTitle}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', lineHeight: 1.55 }}>{t.pipDesc}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label={t.carrier}>
                <input type="text" style={S.input} value={insurance.carrier}
                  placeholder={t.carrierPh}
                  onChange={e => setInsurance(i => ({ ...i, carrier: e.target.value }))} />
              </Field>
              <Field label={t.policyNum}>
                <input type="text" style={S.input} value={insurance.policyNumber}
                  placeholder={t.policyNumPh}
                  onChange={e => setInsurance(i => ({ ...i, policyNumber: e.target.value }))} />
              </Field>
            </div>

            <SifoHint hint={t.sifoHint4} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(4 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 5 · Historial médico (B.7) ═════════════════════════════ */}
        {step === 5 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="💊" title={t.healthTitle} sub={t.healthSub} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Estado general de salud */}
              <Field label={t.healthStatusLabel}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['excellent', 'good', 'fair', 'poor'] as HealthStatus[]).map(v => {
                    const labels: Record<HealthStatus, string> = {
                      excellent: t.healthExcellent,
                      good:      t.healthGood,
                      fair:      t.healthFair,
                      poor:      t.healthPoor,
                    };
                    const active = health.healthStatus === v;
                    return (
                      <button key={v} type="button"
                        onClick={() => setHealth(h => ({ ...h, healthStatus: v }))}
                        style={{
                          flex: 1, padding: '10px 4px', borderRadius: 8,
                          border: active ? '1px solid rgba(6,182,212,0.50)' : '1px solid rgba(255,255,255,0.10)',
                          background: active ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                          color: active ? CYAN : 'rgba(255,255,255,0.55)',
                          fontSize: 12, fontWeight: active ? 700 : 400,
                          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                        }}>
                        {labels[v]}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Medicamentos */}
              <YesNoField
                label={t.hasMeds}
                value={health.hasMedications}
                onChange={v => setHealth(h => ({ ...h, hasMedications: v }))}
                yesLabel={t.yes} noLabel={t.no}
              />
              {health.hasMedications && (
                <Field label={t.medsDetailLabel}>
                  <textarea style={S.textarea} value={health.medications}
                    placeholder={t.medsDetailPh}
                    onChange={e => setHealth(h => ({ ...h, medications: e.target.value }))} />
                </Field>
              )}

              {/* Alergias */}
              <YesNoField
                label={t.hasAllergies}
                value={health.hasAllergies}
                onChange={v => setHealth(h => ({ ...h, hasAllergies: v }))}
                yesLabel={t.yes} noLabel={t.no}
              />
              {health.hasAllergies && (
                <Field label={t.allergiesDetailLabel}>
                  <textarea style={S.textarea} value={health.allergies}
                    placeholder={t.allergiesDetailPh}
                    onChange={e => setHealth(h => ({ ...h, allergies: e.target.value }))} />
                </Field>
              )}

              {/* Lesiones / cirugías previas */}
              <YesNoField
                label={t.hasPrevInjuries}
                value={health.hasPreviousInjuries}
                onChange={v => setHealth(h => ({ ...h, hasPreviousInjuries: v }))}
                yesLabel={t.yes} noLabel={t.no}
              />
              {health.hasPreviousInjuries && (
                <Field label={t.prevInjuriesDetailLabel}>
                  <textarea style={S.textarea} value={health.previousInjuries}
                    placeholder={t.prevInjuriesDetailPh}
                    onChange={e => setHealth(h => ({ ...h, previousInjuries: e.target.value }))} />
                </Field>
              )}
            </div>

            <SifoHint hint={t.sifoHint5} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(5 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 6 · Tu identificación (B.7) ════════════════════════════ */}
        {step === 6 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="📸" title={t.idTitle} sub={t.idSub} />

            {!takeAtClinic ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Selfie */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                      {t.selfieLabel}
                    </div>
                    <PhotoCaptureCard
                      guideType="face"
                      title={t.selfieLabel}
                      instructions={t.selfieInstructions}
                      captureLabel={t.selfieCaptureLabel}
                      reviewQuestion={t.reviewQuestion}
                      usePhotoLabel={t.usePhotoBtn}
                      retakeLabel={t.retakeBtn}
                      changeLabel={t.changePhotoBtn}
                      confirmed={idPhotos.selfie}
                      onConfirm={file => setIdPhotos(p => ({ ...p, selfie: file }))}
                      capture="user"
                      color={CYAN}
                      lang={lang}
                    />
                  </div>

                  {/* Licencia */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                      {t.dlLabel}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <PhotoCaptureCard
                        guideType="document"
                        title={t.dlFront}
                        instructions={t.dlFrontInstructions}
                        captureLabel={t.dlFrontCaptureLabel}
                        reviewQuestion={t.reviewQuestion}
                        usePhotoLabel={t.usePhotoBtn}
                        retakeLabel={t.retakeBtn}
                        changeLabel={t.changePhotoBtn}
                        confirmed={idPhotos.dlFront}
                        onConfirm={file => setIdPhotos(p => ({ ...p, dlFront: file }))}
                        capture="environment"
                        color={INDIGO}
                        lang={lang}
                      />
                      <PhotoCaptureCard
                        guideType="document"
                        title={t.dlBack}
                        instructions={t.dlBackInstructions}
                        captureLabel={t.dlBackCaptureLabel}
                        reviewQuestion={t.reviewQuestion}
                        usePhotoLabel={t.usePhotoBtn}
                        retakeLabel={t.retakeBtn}
                        changeLabel={t.changePhotoBtn}
                        confirmed={idPhotos.dlBack}
                        onConfirm={file => setIdPhotos(p => ({ ...p, dlBack: file }))}
                        capture="environment"
                        color={INDIGO}
                        lang={lang}
                      />
                    </div>
                  </div>

                  {/* Tarjeta seguro */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                      {t.insCardLabel}
                    </div>
                    <PhotoCaptureCard
                      guideType="document"
                      title={t.insCardLabel}
                      instructions={t.insCardInstructions}
                      captureLabel={t.insCardCaptureLabel}
                      reviewQuestion={t.reviewQuestion}
                      usePhotoLabel={t.usePhotoBtn}
                      retakeLabel={t.retakeBtn}
                      changeLabel={t.changePhotoBtn}
                      confirmed={idPhotos.insuranceCard}
                      onConfirm={file => setIdPhotos(p => ({ ...p, insuranceCard: file }))}
                      capture="environment"
                      color={EMERALD}
                      lang={lang}
                    />
                  </div>

                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)',
                    fontSize: 12, color: 'rgba(245,158,11,0.80)',
                  }}>{t.phase1Note}</div>
                </div>

                {/* "Lo tomo en la clínica" fallback */}
                <div style={{
                  marginTop: 20, padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 10, fontWeight: 600 }}>
                    {t.cantPhotoTitle}
                  </div>
                  <button type="button" onClick={() => setTakeAtClinic(true)} style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.30)',
                    color: '#A5B4FC', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                  }}>{t.takeAtClinicBtn}</button>
                </div>
              </>
            ) : (
              <div style={{
                ...S.card, marginBottom: 20, textAlign: 'center',
                background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#A5B4FC', marginBottom: 8 }}>
                  {t.clinicSelectedMsg}
                </div>
                <button type="button" onClick={() => setTakeAtClinic(false)} style={{
                  marginTop: 8, padding: '8px 16px', borderRadius: 8,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.50)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {lang === 'es' ? '← Volver y tomar fotos' : '← Go back and take photos'}
                </button>
              </div>
            )}

            <SifoHint hint={t.sifoHint6} />
            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              <button type="button" style={{ ...S.btnOutline, flex: '0 0 auto' }} onClick={goBack}>
                {t.back}
              </button>
              <button type="button" style={{ ...S.btnPrimary, flex: 1 }}
                onClick={() => { setStep(7); window.scrollTo(0, 0); }}>
                {t.continueToSign}
              </button>
            </div>
          </div>
        )}

        {/* ══════ STEP 7 · Firma del Lien (B.8) ════════════════════════════════ */}
        {step === 7 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="✍️" title={t.lienTitle} sub={t.lienSub} />

            {/* Plain language */}
            <div style={{ ...S.card, marginBottom: 14, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)' }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: EMERALD, marginBottom: 6, textTransform: 'uppercase' }}>
                {t.plainLangLabel}
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.80)', lineHeight: 1.65 }}>
                {t.lienSimple}
              </div>
            </div>

            {/* Expandable legal text */}
            <div style={{ marginBottom: 16 }}>
              <button type="button" onClick={() => setShowFullLegal(v => !v)} style={{
                background: 'transparent', border: 'none', color: CYAN, fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0',
              }}>
                {showFullLegal ? t.hideFullLegal : t.showFullLegal}
              </button>
              {showFullLegal && (
                <div style={{
                  ...S.card, marginTop: 8, maxHeight: 200, overflowY: 'auto',
                  fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.70,
                }}>
                  <strong style={{ color: '#fff', display: 'block', marginBottom: 8, fontSize: 12 }}>
                    {t.lienLegalTitle}
                  </strong>
                  {t.lienLegalBody.split('\n').map((line, i) => (
                    <span key={i}>{line}{i < t.lienLegalBody.split('\n').length - 1 && <br />}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Canvas signature */}
            <Field label={t.signHereLabel}>
              <div style={{
                position: 'relative',
                border: '1px solid rgba(16,185,129,0.35)', borderRadius: 10,
                background: 'rgba(16,185,129,0.04)', overflow: 'hidden', touchAction: 'none',
              }}>
                <canvas ref={canvasRef} style={{ display: 'block', cursor: 'crosshair' }}
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                />
                {!hasSig && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none', fontSize: 13, color: 'rgba(255,255,255,0.20)',
                  }}>{t.signPlaceholder}</div>
                )}
              </div>
              {hasSig && (
                <button type="button" onClick={clearCanvas} style={{
                  marginTop: 6, padding: '4px 12px', borderRadius: 6,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                }}>{t.clearSigBtn}</button>
              )}
            </Field>

            {/* Signature metadata */}
            {hasSig && sigTimestamp && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)',
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: EMERALD, marginBottom: 4, textTransform: 'uppercase' }}>
                  {t.sigMetaLabel}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>{t.sigTimeLabel}:</span> {fmtSigTime(sigTimestamp, lang)}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>
                  <span style={{ fontWeight: 600 }}>{t.sigDeviceLabel}:</span> {deviceInfo}
                </div>
              </div>
            )}

            <div style={{ height: 14 }} />

            <Field label={t.signerNameLabel}>
              <input type="text" style={S.input} value={signerName}
                placeholder={lang === 'es' ? 'Nombre completo' : 'Full name'}
                onChange={e => setSignerName(e.target.value)} />
            </Field>

            <div style={{ height: 12 }} />

            <Field label={t.signerEmailLabel}>
              <input type="email" style={S.input} value={signerEmail}
                placeholder={t.signerEmailPh}
                onChange={e => setSignerEmail(e.target.value)} />
            </Field>

            <div style={{ height: 16 }} />

            {/* Agreement checkbox */}
            <label style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 20,
              background: agreed ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
              border: agreed ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
            }}>
              <input type="checkbox" checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: EMERALD, cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{t.agreeCheckbox}</span>
            </label>

            {saveError && <SaveError error={saveError} />}
            <SifoHint hint={t.sifoHint7} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={submitSignature}
                disabled={!hasSig || !signerName.trim() || !agreed || submitting}
                style={{
                  ...S.btnEmerald,
                  opacity: (!hasSig || !signerName.trim() || !agreed || submitting) ? 0.45 : 1,
                  cursor: (!hasSig || !signerName.trim() || !agreed || submitting) ? 'not-allowed' : 'pointer',
                }}>
                {submitting ? t.signing : t.signBtn}
              </button>
              <button type="button" style={S.btnOutline} onClick={goBack}>{t.back}</button>
            </div>
            <p style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.20)' }}>
              {t.legalNote}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.40)', marginBottom: 6,
      }}>{label}</label>
      {children}
    </div>
  );
}

function YesNoField({
  label, value, onChange, yesLabel, noLabel,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
  yesLabel: string; noLabel: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 10 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={() => onChange(true)} style={{
          flex: 1, padding: '10px 20px', borderRadius: 8,
          border: value ? '1px solid rgba(16,185,129,0.50)' : '1px solid rgba(255,255,255,0.12)',
          background: value ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
          color: value ? '#10B981' : 'rgba(255,255,255,0.55)',
          fontSize: 14, fontWeight: value ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
        }}>{yesLabel}</button>
        <button type="button" onClick={() => onChange(false)} style={{
          flex: 1, padding: '10px 20px', borderRadius: 8,
          border: !value ? '1px solid rgba(99,102,241,0.50)' : '1px solid rgba(255,255,255,0.12)',
          background: !value ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.04)',
          color: !value ? '#A5B4FC' : 'rgba(255,255,255,0.55)',
          fontSize: 14, fontWeight: !value ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
        }}>{noLabel}</button>
      </div>
    </div>
  );
}

function SifoHint({ hint }: { hint: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      marginTop: 20, marginBottom: 4, padding: '10px 14px', borderRadius: 10,
      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
      }}>✨</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#A5B4FC', marginBottom: 2, letterSpacing: '0.08em' }}>
          SIFO
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{hint}</div>
      </div>
    </div>
  );
}

function SaveError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px',
      background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)',
      borderRadius: 8, color: '#F87171', fontSize: 13,
    }}>⚠️ {error}</div>
  );
}

function NavButtons({
  saving, onBack, onNext, t,
}: {
  saving: boolean; onBack: () => void; onNext: () => void;
  t: { back: string; continue: string; saving: string };
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
      <button type="button" style={{ ...S.btnOutline, flex: '0 0 auto' }} onClick={onBack}>
        {t.back}
      </button>
      <button type="button" disabled={saving} onClick={onNext} style={{
        ...S.btnPrimary, flex: 1,
        opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer',
      }}>
        {saving ? t.saving : t.continue}
      </button>
    </div>
  );
}

/**
 * PhotoCaptureCard — 3-state photo capture component
 *
 * STATE 1 · Guidance: shows instructions + visual guide + capture button
 * STATE 2 · Review:   shows photo large with "¿Se ve bien?" confirm/retake
 * STATE 3 · Confirmed: shows thumbnail + "Cambiar" label trigger
 *
 * Uses <label htmlFor> pattern — reliable on Android + iOS Safari.
 */
function PhotoCaptureCard({
  guideType, title, instructions,
  captureLabel, reviewQuestion, usePhotoLabel, retakeLabel, changeLabel,
  confirmed, onConfirm, capture, color, lang,
}: {
  guideType: 'face' | 'document';
  title: string;
  instructions: string[];
  captureLabel: string;
  reviewQuestion: string;
  usePhotoLabel: string;
  retakeLabel: string;
  changeLabel: string;
  confirmed: File | null;
  onConfirm: (f: File) => void;
  capture: 'user' | 'environment';
  color: string;
  lang: Lang;
}) {
  const fallbackId = useId();
  const [stage, setStage]                   = useState<'guide' | 'camera' | 'review' | 'confirmed'>('guide');
  const [pending, setPending]               = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [confirmedUrl, setConfirmedUrl]     = useState<string | null>(null);

  useEffect(() => {
    if (!confirmed) { setConfirmedUrl(null); return; }
    const url = URL.createObjectURL(confirmed);
    setConfirmedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [confirmed]);

  // Called from InAppCamera (getUserMedia snapshot) or fallback file input
  const receiveFile = (file: File) => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPending(file);
    setPendingPreview(URL.createObjectURL(file));
    setStage('review');
  };

  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) receiveFile(file);
    e.target.value = '';
  };

  const handleConfirm = () => {
    if (!pending) return;
    onConfirm(pending);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPending(null);
    setPendingPreview(null);
    setStage('confirmed');
  };

  const handleRetake = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPending(null);
    setPendingPreview(null);
    setStage('guide');
  };

  const openCamera = () => {
    const hasGetUserMedia =
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof (navigator.mediaDevices as { getUserMedia?: unknown }).getUserMedia === 'function';
    if (hasGetUserMedia) {
      setStage('camera');
    } else {
      // Fallback: trigger file input (opens native camera / gallery)
      document.getElementById(fallbackId)?.click();
    }
  };

  const colorRgb =
    color === CYAN    ? '6,182,212' :
    color === INDIGO  ? '99,102,241' :
    color === EMERALD ? '16,185,129' : '6,182,212';

  // Fallback file input — for browsers without getUserMedia or after permission error
  const fallbackInput = (
    <input
      id={fallbackId} type="file" accept="image/*" capture={capture}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', zIndex: -1 }}
      onChange={handleFallbackFile}
    />
  );

  // ── STAGE: In-app camera ───────────────────────────────────────────────────
  if (stage === 'camera') {
    return (
      <InAppCamera
        facingMode={capture}
        guideType={guideType}
        color={color}
        colorRgb={colorRgb}
        lang={lang}
        onCapture={file => receiveFile(file)}
        onCancel={() => setStage('guide')}
        onPermissionError={() => {
          setStage('guide');
          // After error, clicking again will use fallback
          document.getElementById(fallbackId)?.click();
        }}
      />
    );
  }

  // ── STATE 2: Review pending photo ──────────────────────────────────────────
  if (stage === 'review' && pending && pendingPreview) {
    const isOval = guideType === 'face';
    return (
      <div style={{
        position: 'relative',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12, padding: 16,
      }}>
        {fallbackInput}
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 12 }}>
          {reviewQuestion}
        </div>
        <div style={{
          width: isOval ? 140 : '100%',
          height: isOval ? 175 : 170,
          margin: isOval ? '0 auto 14px' : '0 0 14px',
          borderRadius: isOval ? '50%' : 10,
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.18)',
        }}>
          <img src={pendingPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleRetake} style={{
            flex: 1, padding: '12px 8px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.60)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{retakeLabel}</button>
          <button type="button" onClick={handleConfirm} style={{
            flex: 2, padding: '12px 8px', borderRadius: 10,
            background: 'linear-gradient(135deg,#10B981,#06B6D4)', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{usePhotoLabel}</button>
        </div>
      </div>
    );
  }

  // ── STATE 3: Confirmed photo ───────────────────────────────────────────────
  if ((stage === 'confirmed' || confirmed) && confirmedUrl && confirmed) {
    return (
      <div style={{
        position: 'relative',
        background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.28)',
        borderRadius: 12, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {fallbackInput}
        <img src={confirmedUrl} alt="" style={{
          width: 56, height: 56,
          borderRadius: guideType === 'face' ? '50%' : 8,
          objectFit: 'cover', flexShrink: 0,
          border: '2px solid rgba(16,185,129,0.50)',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: EMERALD }}>✓ {title}</div>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{confirmed.name}</div>
        </div>
        <button type="button" onClick={openCamera} style={{
          padding: '6px 10px', borderRadius: 8, flexShrink: 0,
          background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>{changeLabel}</button>
      </div>
    );
  }

  // ── STATE 1: Guidance (idle) ───────────────────────────────────────────────
  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid rgba(${colorRgb},0.22)`,
      borderRadius: 12, padding: 14,
    }}>
      {fallbackInput}

      {/* Instructions numbered list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {instructions.map((ins, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              background: `rgba(${colorRgb},0.15)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, color: color,
            }}>{i + 1}</div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{ins}</span>
          </div>
        ))}
      </div>

      {/* Visual guide */}
      {guideType === 'face' ? (
        <div style={{
          width: 110, height: 140, margin: '0 auto 14px',
          border: `2px dashed rgba(${colorRgb},0.50)`,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `rgba(${colorRgb},0.04)`,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26 }}>👤</div>
            <div style={{ fontSize: 9, color: `rgba(${colorRgb},0.70)`, marginTop: 3, fontWeight: 700, letterSpacing: '0.08em' }}>SELFIE</div>
          </div>
        </div>
      ) : (
        <div style={{
          width: '100%', height: 72, margin: '0 0 14px',
          border: `1px dashed rgba(${colorRgb},0.38)`,
          borderRadius: 8, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `rgba(${colorRgb},0.03)`,
        }}>
          {/* Corner alignment markers */}
          <div style={{ position:'absolute', top:4, left:4, width:12, height:12, borderTop:`2px solid ${color}`, borderLeft:`2px solid ${color}` }} />
          <div style={{ position:'absolute', top:4, right:4, width:12, height:12, borderTop:`2px solid ${color}`, borderRight:`2px solid ${color}` }} />
          <div style={{ position:'absolute', bottom:4, left:4, width:12, height:12, borderBottom:`2px solid ${color}`, borderLeft:`2px solid ${color}` }} />
          <div style={{ position:'absolute', bottom:4, right:4, width:12, height:12, borderBottom:`2px solid ${color}`, borderRight:`2px solid ${color}` }} />
          <span style={{ fontSize: 11, color: `rgba(${colorRgb},0.55)`, fontWeight: 600 }}>📄 {title}</span>
        </div>
      )}

      {/* Capture trigger — opens in-app camera (or fallback to file picker) */}
      <button type="button" onClick={openCamera} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', padding: '13px 16px', borderRadius: 10,
        background: `rgba(${colorRgb},0.10)`,
        border: `1px solid rgba(${colorRgb},0.38)`,
        color: color, fontSize: 14, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}>
        {captureLabel}
      </button>
    </div>
  );
}

// ─── In-App Camera ──────────────────────────────────────────────────────────
// Uses getUserMedia API to show live camera feed inside the card.
// Self-contained lifecycle: requests permission → streams video → captures frame.

function InAppCamera({
  facingMode, guideType, color, colorRgb, lang, onCapture, onCancel, onPermissionError,
}: {
  facingMode: 'user' | 'environment';
  guideType: 'face' | 'document';
  color: string;
  colorRgb: string;
  lang: Lang;
  onCapture: (f: File) => void;
  onCancel: () => void;
  onPermissionError: () => void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const t = STRINGS[lang];

  useEffect(() => {
    let active = true;

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(tr => tr.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    }).catch(() => {
      if (active) setError(t.camPermError);
    });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    };
  }, [facingMode, t.camPermError]);

  const handleCapture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;

    const w = video.videoWidth  || 1280;
    const h = video.videoHeight || 720;
    canvas.width  = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Front camera: draw raw (world sees you, matches ID photo orientation)
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      // Stop stream before handing off
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      onCapture(file);
    }, 'image/jpeg', 0.92);
  };

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{
        background: '#0a0f1c', border: '1px solid rgba(244,63,94,0.25)',
        borderRadius: 12, padding: '20px 16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16, lineHeight: 1.55 }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel} style={{
            flex: 1, padding: '11px 8px', borderRadius: 10,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.55)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.camCancel}</button>
          <button type="button" onClick={onPermissionError} style={{
            flex: 2, padding: '11px 8px', borderRadius: 10,
            background: `rgba(${colorRgb},0.10)`, border: `1px solid rgba(${colorRgb},0.35)`,
            color: color, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.camFallback}</button>
        </div>
      </div>
    );
  }

  // ── Live camera UI ──────────────────────────────────────────────────────────
  const isOval = guideType === 'face';

  return (
    <div style={{
      background: '#000', borderRadius: 14,
      overflow: 'hidden', border: `1px solid rgba(${colorRgb},0.30)`,
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(0,0,0,0.70)',
      }}>
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.65)', fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit', padding: 0,
        }}>← {t.camCancel}</button>
        <span style={{ fontSize: 11, color: `rgba(${colorRgb},0.90)`, fontWeight: 700, letterSpacing: '0.08em' }}>
          {isOval ? 'SELFIE' : 'DOCUMENTO'}
        </span>
        <div style={{ width: 40 }} /> {/* spacer */}
      </div>

      {/* Video preview */}
      <div style={{
        position: 'relative',
        background: '#111',
        ...(isOval
          ? { padding: '16px 32px 8px' }
          : { padding: '8px 12px' }
        ),
      }}>
        {isOval ? (
          /* Selfie: oval crop with mirror */
          <div style={{
            width: '100%', maxWidth: 220, aspectRatio: '3/4',
            margin: '0 auto',
            borderRadius: '50%', overflow: 'hidden',
            border: `3px solid rgba(${colorRgb},0.65)`,
            boxShadow: `0 0 0 5px rgba(${colorRgb},0.12)`,
            background: '#111', position: 'relative',
          }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                transform: 'scaleX(-1)', // mirror so preview is natural (like selfie camera)
                display: 'block',
              }}
              onCanPlay={() => setReady(true)}
            />
            {!ready && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.60)', fontSize: 12,
                color: 'rgba(255,255,255,0.50)',
              }}>{t.camLoading}</div>
            )}
          </div>
        ) : (
          /* Document: rect with alignment corner markers overlay */
          <div style={{
            width: '100%', aspectRatio: '4/3',
            borderRadius: 8, overflow: 'hidden',
            position: 'relative', background: '#111',
          }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onCanPlay={() => setReady(true)}
            />
            {/* Alignment overlay */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: '14%' }}>
                {/* Corner markers */}
                <div style={{ position:'absolute', top:0, left:0, width:22, height:22, borderTop:`2.5px solid ${color}`, borderLeft:`2.5px solid ${color}` }} />
                <div style={{ position:'absolute', top:0, right:0, width:22, height:22, borderTop:`2.5px solid ${color}`, borderRight:`2.5px solid ${color}` }} />
                <div style={{ position:'absolute', bottom:0, left:0, width:22, height:22, borderBottom:`2.5px solid ${color}`, borderLeft:`2.5px solid ${color}` }} />
                <div style={{ position:'absolute', bottom:0, right:0, width:22, height:22, borderBottom:`2.5px solid ${color}`, borderRight:`2.5px solid ${color}` }} />
              </div>
              {/* Semi-transparent vignette outside the guide area */}
              <div style={{
                position: 'absolute', inset: 0,
                boxShadow: 'inset 0 0 0 14% rgba(0,0,0,0.55)',
                borderRadius: 8,
              }} />
            </div>
            {!ready && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.60)', fontSize: 12,
                color: 'rgba(255,255,255,0.50)',
              }}>{t.camLoading}</div>
            )}
          </div>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Bottom bar: guidance text + shutter button */}
      <div style={{
        padding: '14px 20px 20px',
        textAlign: 'center',
        background: 'rgba(0,0,0,0.80)',
      }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 16, lineHeight: 1.5 }}>
          {isOval ? t.camGuideFace : t.camGuideDoc}
        </p>

        {/* Shutter button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready}
            aria-label={t.camCapture}
            style={{
              width: 74, height: 74, borderRadius: '50%', padding: 0,
              background: 'transparent', outline: 'none',
              border: '3px solid rgba(255,255,255,0.70)',
              cursor: ready ? 'pointer' : 'not-allowed',
              boxShadow: ready ? '0 0 0 6px rgba(255,255,255,0.10)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.1s',
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: ready ? '#fff' : 'rgba(255,255,255,0.30)',
              transition: 'background 0.2s',
            }} />
          </button>
        </div>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 10 }}>
          {t.camCapture}
        </p>
      </div>
    </div>
  );
}

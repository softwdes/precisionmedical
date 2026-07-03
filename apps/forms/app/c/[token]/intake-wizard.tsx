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
import { US_STATES, CITIES_BY_STATE, CITY_ZIP } from '@/lib/us-locations';

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

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type CaseType = 'MVA' | 'GM';
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
      { icon: '📋', label: 'Información adicional' },
      { icon: '👤', label: 'Persona responsable' },
      { icon: '🚗', label: 'Detalles del accidente' },
      { icon: '🏥', label: 'Información de tu seguro' },
      { icon: '💊', label: 'Historial médico' },
      { icon: '📸', label: 'Foto de identificación' },
      { icon: '📋', label: 'Consentimientos médicos' },
      { icon: '✍️', label: 'Firma del acuerdo de lien' },
    ],
    startBtn: 'Comenzar →',
    secureNote: '🔒 Tu información es confidencial y segura',
    sifoHint1: '¡Hola! Soy Cifo ✨ Te guío en cada paso. Solo toma ~5 minutos.',
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
    // Información clínica (Step 2)
    clinicalSection: 'Información clínica del paciente',
    clinicalSub: 'Estos datos nos ayudan a brindarle un servicio más personalizado.',
    howHeard: '¿Cómo se enteró de nosotros?',
    howHeardPh: 'Seleccionar',
    commPref: '¿Cómo le gustaría que se comuniquen?',
    commPrefPh: 'Seleccionar opción',
    // Información clínica (Step 3)
    referredBy: 'Referido por',
    referredByPh: 'Nombre de quien lo refirió',
    preferredPharmacy: 'Farmacia preferida',
    preferredPharmacyPh: 'Nombre de su farmacia',
    employer: 'Empleador',
    employerPh: 'Nombre de su empresa o lugar de trabajo',
    // Contactos de emergencia
    emergencySection: 'Contactos de emergencia',
    emergencyAllOptional: 'Todos los campos son opcionales, pero proporcionarlos nos ayudará a brindar la mejor atención posible.',
    emergencyName: 'Nombre',
    emergencyPhone: 'Teléfono',
    emergencyNamePh: 'Ej: María García',
    emergencyPhonePh: '(801) 555-0200',
    emergencyRelation: 'Relación',
    emergencyRelationPh: 'Ej: Esposa, Madre...',
    emergency2Name: 'Nombre',
    emergency2NamePh: 'Ej: Juan García',
    emergency2Phone: 'Teléfono',
    emergency2PhonePh: '(801) 555-0300',
    emergency2Relation: 'Relación',
    emergency2RelationPh: 'Ej: Hermano, Vecino...',
    cellPhone: 'Celular',
    cellPhonePh: '(801) 555-0100',
    addressLine1: 'Dirección',
    addressLine1Ph: 'Ej: 123 Main St, Apt 4',
    addressCity: 'Ciudad',
    addressCityPh: 'Ej: Provo',
    addressState: 'Estado',
    addressStatePh: 'UT',
    addressZip: 'Código postal',
    addressZipPh: '84601',
    sifoHint2: 'Verifica que tus datos coincidan con tu ID. Los usaremos en tus documentos médicos.',
    // Step 3 — Información adicional
    additionalTitle: 'Información adicional',
    additionalSub: 'Todos los campos son opcionales, pero nos ayudan a brindar la mejor atención.',
    demographicSection: 'Información demográfica',
    demographicSub: 'Esta información es opcional y se usa solo con fines estadísticos de salud.',
    raceLabel: 'Raza',
    ethnicityLabel: 'Etnicidad',
    sexLabel: 'Sexo',
    maritalStatusLabel: 'Estado civil',
    sifoHint3: 'Esta información nos ayuda a preparar tu expediente médico completo.',
    // Step 4
    accidentTitle: 'Motivo de consulta',
    accidentSub: 'Cuéntenos detalladamente por qué nos visita hoy.',
    accidentDate: 'Fecha del accidente',
    accidentTypeLabel: 'Tipo de caso',
    caseTypesMap: { MVA: 'MVA (Accidente de vehículo a motor)', GM: 'GM (Medicina general)' } as Record<CaseType, string>,
    caseTypesSub: { MVA: 'Motor vehicle accident', GM: 'General medical visit' } as Record<CaseType, string>,
    accidentLocation: 'Ubicación del accidente',
    accidentLocationPh: 'Ej: I-15 y 500 S, Provo, UT',
    accidentDesc: 'Describe brevemente cómo ocurrió',
    accidentDescPh: 'Ej: Me impactaron por detrás mientras esperaba en semáforo...',
    guardianStepTitle: 'Información de la persona responsable',
    guardianStepSub: 'Si es menor de edad, necesitamos los datos de la persona responsable legal.',
    guardianStepNote: 'Persona a cargo del paciente registrado',
    guardianSkip: 'Omitir',
    guardianSection: 'Información de la persona responsable',
    guardianSectionSub: 'Complete la información de la persona responsable del menor.',
    guardianFirstName: 'Nombre',
    guardianLastName: 'Apellido',
    guardianEmail: 'Email',
    guardianDOB: 'Fecha de nacimiento',
    guardianPhone: 'Teléfono',
    guardianCellPhone: 'Celular',
    guardianAddress: 'Dirección',
    sifoHint4: 'El responsable legal debe ser mayor de edad. Esta información queda registrada en el expediente.',
    sifoHint5: 'La fecha exacta del accidente es clave para procesar tu caso correctamente.',
    legalRepsSection: 'Representación legal',
    lawFirm: 'Firma de abogados',
    lawFirmPh: 'Nombre de la firma de abogados que refirió el caso...',
    attorneyRep: 'Abogado representante',
    attorneyRepPh: 'Nombre del abogado',
    chiropractorLabel: 'Quiropráctico tratante',
    chiropractorPh: 'Nombre del quiropráctico',
    // Step 5
    insuranceTitle: 'Tu seguro',
    insuranceSub: 'Información de tu seguro Personal Injury Protection (PIP).',
    pipTitle: '¿Qué es el PIP?',
    pipDesc: 'Personal Injury Protection (PIP) es la cobertura de tu seguro de auto que paga los tratamientos médicos causados por el accidente, sin importar quién tuvo la culpa.',
    carrier: 'Compañía aseguradora (PIP)',
    carrierPh: 'Ej: State Farm, Progressive, GEICO...',
    policyNum: 'Número de póliza',
    policyNumPh: 'Ej: POL-123456789',
    sifoHint6: 'Tu seguro PIP (Personal Injury Protection) cubre los tratamientos del accidente.',
    // Step 6 — Historial médico
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
    sifoHint7: 'Tu historial médico nos ayuda a diseñar el mejor plan de tratamiento para ti.',
    // Step 7
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
    continueToSign: 'Continuar →',
    sifoHint8: 'Necesitamos tu ID para verificar tu identidad. Tus fotos están seguras 🔒',
    // Step 7 — Photo capture guidance
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
    // Step 7 — Consentimientos
    consentsTitle: 'Consentimientos médicos',
    consentsSub: 'Lee y acepta cada documento. Todos son requeridos para continuar.',
    consentsCounter: (n: number) => `${n} de 5 documentos aceptados`,
    c1Title: 'DIVULGACIÓN MÉDICA',
    c1Body: 'Autorizo a Precision Medical Care a divulgar mi información médica a mi abogado representante y a las aseguradoras involucradas en mi caso, únicamente para efectos del procesamiento de mi reclamación por lesiones personales.',
    c1FullBody: 'DIVULGACIÓN DE INFORMACIÓN MÉDICA\n\nReconozco que se me ha proporcionado una copia del AVISO DE PRÁCTICAS DE PRIVACIDAD de Precision Medical Urgent Care & Family Practice (PMUCFP). Entiendo que PMUCFP puede divulgar la totalidad o parte de mi historial médico, o el de mis dependientes, a mí, así como a las personas o entidades responsables de pagar los cargos por los servicios prestados. Esto puede incluir a mis compañías de seguros (por ejemplo, de salud, automóvil, compensación laboral, discapacidad) y a los abogados que trabajan en mi caso.\n\nAdemás, reconozco que PMUCFP puede divulgar información del paciente a los proveedores de atención médica que me derivan o me tratan, y para fines de pago y operaciones de atención médica.\n\nPor la presente, autorizo a PMUCFP a obtener información médica de otras entidades y proveedores de atención médica, incluyendo, entre otros: resultados de laboratorio, informes de pruebas diagnósticas, imágenes y otra información clínica que los médicos o representantes de PMUCFP consideren necesaria.\n\nEntiendo que puedo inspeccionar mi información médica protegida, o la de mis dependientes, solicitar información adicional y revocar esta autorización de acuerdo con las regulaciones federales de privacidad y la política de privacidad de PMUCFP. Entiendo que esta revocación debe hacerse por escrito, excepto en la medida en que PMUCFP ya haya usado o divulgado mi información médica protegida con base en mi solicitud original.',
    c1Check: 'Acepto la Divulgación Médica',
    c2Title: 'PARTES CESIONADAS',
    c2Body: 'Autorizo a las partes cesionadas (abogado, quiropráctico u otros proveedores) a actuar en mi nombre para gestionar los pagos y acuerdos relacionados con mi caso.',
    c2FullBody: 'DIVULGACIÓN DE INFORMACIÓN MÉDICA A PARTES CESIONADAS\n\nBajo la Ley de Portabilidad y Responsabilidad del Seguro Médico (HIPAA), tengo ciertos derechos sobre mi información médica protegida. Por la presente autorizo específicamente la divulgación de mi información médica para los siguientes propósitos:\n\nEn mi ausencia, autorizo a Precision Medical Urgent Care & Family Practice a divulgar total o parcialmente mi información médica protegida o la de mis dependientes a las personas o entidades que se indican a continuación.\n\nEsta autorización permanecerá vigente hasta que la revoque por escrito.',
    c2Check: 'Acepto las Partes Cesionadas',
    authPersonsLabel: 'Personas responsables autorizadas',
    authPersonsDesc: 'Agrega solo a las personas que podrán recibir o gestionar información médica en tu nombre.',
    authPersonNamePh: 'Nombre del responsable',
    authPersonRelPh: 'Seleccione la relación',
    authPersonRelations: ['Cónyuge', 'Padre/Madre', 'Hijo/Hija', 'Hermano/a', 'Persona responsable legal', 'Otro'],
    addPersonBtn: '+ Agregar persona responsable',
    authRecordsCheck: 'Autorizo la divulgación de la totalidad o parte de mis registros médicos a mis padres (mayores de 18 años).',
    authVoicemailCheck: 'Autorizo que los resultados de pruebas y los recordatorios de citas se dejen en mi buzón de voz.',
    authNotificationsCheck: 'Autorizo que se envíen notificaciones y recordatorios de citas por correo electrónico o mensaje de texto.',
    c3Title: 'AUTORIZACIÓN DE TRATAMIENTO',
    c3Body: 'Consiento voluntariamente recibir diagnóstico y tratamiento médico en Precision Medical Care. Entiendo los riesgos y beneficios del tratamiento propuesto y puedo retirar este consentimiento en cualquier momento.',
    c3FullBody: 'CONSENTIMIENTO PARA TRATAMIENTO\n\nPor la presente, autorizo la atención y doy mi consentimiento para el tratamiento médico, incluyendo pruebas y procedimientos, realizados por el/los médico(s) u otros profesionales de la salud para mi tratamiento o el de mis dependientes.\n\nMi intención es que esta autorización se aplique a esta consulta y a cualquier atención futura que yo o mis dependientes podamos solicitar.',
    c3Check: 'Acepto la Autorización de Tratamiento',
    c4Title: 'POLÍTICA FINANCIERA',
    c4Body: 'Entiendo la política financiera de Precision Medical Care. Acepto que los cargos no cubiertos por mi seguro o acuerdo legal son mi responsabilidad personal. Al firmar reconozco haber recibido y comprendido esta política.',
    c4FullBody: 'POLÍTICA Y ACUERDO DE CARGOS DE CRÉDITO Y FINANCIAMIENTO\n\nAcepto ser financieramente responsable de cualquier costo en el que incurra yo o mis dependientes. Entiendo que los cargos por los servicios prestados deben pagarse al momento del servicio, incluyendo cualquier copago o deducible según mi acuerdo con mi aseguradora. Entiendo que PMUCFP presentará las reclamaciones en mi nombre y que soy financieramente responsable de cualquier saldo, copago, coaseguro, deducible o servicio no cubierto por mi compañía de seguros. Autorizo cualquier beneficio adeudado a mí para que se pague directamente a Precision Medical Urgent Care & Family Practice (cesión de beneficios).\n\nRESPONSABILIDAD FINANCIERA\n\n• PMUCFP se reserva el derecho de cobrar una tarifa de $50 a $100 por citas canceladas o perdidas sin al menos 24 horas de aviso.\n\n• Se añadirá un cargo financiero del 1.5% mensual (APR 18%) a mi cuenta si no se recibe el pago dentro de los 30 días posteriores a la fecha del estado de cuenta.\n\n• Acepto pagar una tarifa de servicio de $25.00 por cualquier cheque devuelto u otro método de pago devuelto por mi institución financiera.\n\n• Si algún monto se remite a una agencia de cobro de deudas de terceros, acepto que, además de cualquier otro monto permitido por la ley (incluidos intereses, costas judiciales y honorarios de abogados), también seré responsable de una tarifa de cobro de hasta el 40% del monto principal adeudado, según lo permitido por la sección 12-1-11 del Código Anotado de Utah. Estos términos se aplican a todos los montos en los que incurra yo o cualquier persona por quien tenga responsabilidad legal, ya sean incurridos antes o después de la fecha de este acuerdo.\n\nEn consideración a los servicios médicos prestados, acuso recibo de la Política Financiera de PMUCFP y acepto pagar los servicios médicos según sus términos.',
    c4Check: 'Acepto la Política Financiera',
    c4SignLabel: 'Firma de acuse — Política financiera',
    c4SignPh: '✍️ Dibuja tu firma aquí',
    c4ClearBtn: '× Borrar y volver a firmar',
    c5Title: 'HISTORIAL MÉDICO',
    c5Body: 'Autorizo a Precision Medical Care a solicitar y recibir mi historial médico de proveedores de salud anteriores, con el único fin de brindar el mejor cuidado posible durante mi tratamiento.',
    c5FullBody: 'AUTORIDAD DE HISTORIAL MÉDICO\n\nAutorización del Sistema de Historias Clínicas Electrónicas (HCE): PMUCFP ha implementado un nuevo sistema de Historias Clínicas Electrónicas (HCE) que importa el historial de recetas de terceros (p. ej., farmacias).\n\nPara transferir mi historial de recetas actual y anterior a este nuevo sistema, doy mi consentimiento. Al firmar a continuación, autorizo a PMUCFP a transferir mi historial de recetas.',
    c5Check: 'Acepto la Autorización de Historial Médico',
    showDoc: 'Ver documento completo ›',
    hideDoc: '‹ Ocultar documento',
    consentsValidation: 'Por favor acepta los 5 documentos y firma la Política Financiera para continuar.',
    sifoHint9: 'Estos consentimientos son documentos legales requeridos. Léelos con cuidado — están diseñados para protegerte.',
    // Step 10 — Lien
    sifoHint10: 'Esta firma autoriza a Precision Medical a tratar tu lesión bajo lien. Es legal y vinculante.',
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
      { icon: '📋', label: 'Additional information' },
      { icon: '👤', label: 'Responsible person' },
      { icon: '🚗', label: 'Accident details' },
      { icon: '🏥', label: 'Insurance information' },
      { icon: '💊', label: 'Medical history' },
      { icon: '📸', label: 'Photo ID' },
      { icon: '📋', label: 'Medical consents' },
      { icon: '✍️', label: 'Medical lien agreement' },
    ],
    startBtn: 'Get started →',
    secureNote: '🔒 Your information is confidential and secure',
    sifoHint1: "Hi! I'm Cifo ✨ I'll guide you through each step. It only takes ~5 minutes.",
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
    // Clinical info (Step 2)
    clinicalSection: 'Clinical patient information',
    clinicalSub: 'This data helps us provide a more personalized service.',
    howHeard: 'How did you hear about us?',
    howHeardPh: 'Select',
    commPref: 'How would you like to be contacted?',
    commPrefPh: 'Select option',
    // Clinical info (Step 3)
    referredBy: 'Referred by',
    referredByPh: 'Name of who referred you',
    preferredPharmacy: 'Preferred pharmacy',
    preferredPharmacyPh: 'Name of your pharmacy',
    employer: 'Employer',
    employerPh: 'Name of your company or workplace',
    // Emergency contacts
    emergencySection: 'Emergency contacts',
    emergencyAllOptional: 'All fields are optional, but providing them will help us give you the best care possible.',
    emergencyName: 'Name',
    emergencyPhone: 'Phone',
    emergencyNamePh: 'E.g., Maria Garcia',
    emergencyPhonePh: '(801) 555-0200',
    emergencyRelation: 'Relationship',
    emergencyRelationPh: 'E.g., Spouse, Mother...',
    emergency2Name: 'Name',
    emergency2NamePh: 'E.g., John Garcia',
    emergency2Phone: 'Phone',
    emergency2PhonePh: '(801) 555-0300',
    emergency2Relation: 'Relationship',
    emergency2RelationPh: 'E.g., Brother, Neighbor...',
    cellPhone: 'Cell phone',
    cellPhonePh: '(801) 555-0100',
    addressLine1: 'Address',
    addressLine1Ph: 'E.g., 123 Main St, Apt 4',
    addressCity: 'City',
    addressCityPh: 'E.g., Provo',
    addressState: 'State',
    addressStatePh: 'UT',
    addressZip: 'ZIP code',
    addressZipPh: '84601',
    sifoHint2: 'Make sure your info matches your ID. We use it in your medical documents.',
    // Step 3 — Additional information
    additionalTitle: 'Additional information',
    additionalSub: 'All fields are optional but help us provide the best care.',
    demographicSection: 'Demographic information',
    demographicSub: 'This information is optional and used only for health statistics.',
    raceLabel: 'Race',
    ethnicityLabel: 'Ethnicity',
    sexLabel: 'Sex',
    maritalStatusLabel: 'Marital status',
    sifoHint3: 'This information helps us prepare your complete medical record.',
    // Step 4
    accidentTitle: 'Reason for visit',
    accidentSub: 'Tell us in detail why you are visiting us today.',
    accidentDate: 'Accident date',
    accidentTypeLabel: 'Case type',
    caseTypesMap: { MVA: 'MVA (Motor vehicle accident)', GM: 'GM (General medical visit)' } as Record<CaseType, string>,
    caseTypesSub: { MVA: 'Motor vehicle accident', GM: 'General medical visit' } as Record<CaseType, string>,
    accidentLocation: 'Accident location',
    accidentLocationPh: 'E.g., I-15 & 500 S, Provo, UT',
    accidentDesc: 'Briefly describe what happened',
    accidentDescPh: 'E.g., I was rear-ended while waiting at a red light...',
    guardianStepTitle: 'Responsible person information',
    guardianStepSub: 'If the patient is a minor, we need the legal guardian\'s information.',
    guardianStepNote: 'Person in charge of the registered patient',
    guardianSkip: 'Skip',
    guardianSection: 'Responsible person information',
    guardianSectionSub: 'Complete the information for the person responsible for the minor.',
    guardianFirstName: 'First name',
    guardianLastName: 'Last name',
    guardianEmail: 'Email',
    guardianDOB: 'Date of birth',
    guardianPhone: 'Phone',
    guardianCellPhone: 'Cell phone',
    guardianAddress: 'Address',
    sifoHint4: 'The legal guardian must be an adult. This information is recorded in the medical file.',
    sifoHint5: 'The exact accident date is key to processing your case correctly.',
    legalRepsSection: 'Legal representation',
    lawFirm: 'Law firm',
    lawFirmPh: 'Name of the law firm that referred the case...',
    attorneyRep: 'Attorney',
    attorneyRepPh: 'Attorney name',
    chiropractorLabel: 'Treating chiropractor',
    chiropractorPh: 'Chiropractor name',
    // Step 5
    insuranceTitle: 'Your insurance',
    insuranceSub: 'Information about your Personal Injury Protection (PIP) insurance.',
    pipTitle: 'What is PIP?',
    pipDesc: 'Personal Injury Protection (PIP) is your auto insurance coverage that pays for medical treatments caused by the accident, regardless of who was at fault.',
    carrier: 'Insurance company (PIP)',
    carrierPh: 'E.g., State Farm, Progressive, GEICO...',
    policyNum: 'Policy number',
    policyNumPh: 'E.g., POL-123456789',
    sifoHint6: 'Your PIP (Personal Injury Protection) insurance covers accident-related treatments.',
    // Step 6
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
    sifoHint7: 'Your medical history helps us design the best treatment plan for you.',
    // Step 7
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
    continueToSign: 'Continue →',
    sifoHint8: 'We need your ID to verify your identity. Your photos are secure 🔒',
    // Step 7 — Photo capture guidance
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
    // Step 7 — Consents
    consentsTitle: 'Medical consents',
    consentsSub: 'Read and accept each document. All are required to continue.',
    consentsCounter: (n: number) => `${n} of 5 documents accepted`,
    c1Title: 'MEDICAL DISCLOSURE',
    c1Body: 'I authorize Precision Medical Care to disclose my medical information to my attorney and the insurance companies involved in my case, solely for the purpose of processing my personal injury claim.',
    c1FullBody: 'MEDICAL INFORMATION RELEASE\n\nI acknowledge that I have been provided with a copy of the NOTICE OF PRIVACY PRACTICES of Precision Medical Urgent Care & Family Practice (PMUCFP). I understand that PMUCFP may release all or portions of my medical records, or those of my dependents, to me, as well as to individuals or entities responsible for paying the charges for services rendered. This may include my insurance carriers (e.g., health, auto, worker\'s compensation, disability) and attorneys working on my case.\n\nFurthermore, I acknowledge that PMUCFP may disclose patient information to referring or treating healthcare providers, and for purposes of payment and healthcare operations.\n\nI hereby authorize PMUCFP to obtain medical information from other healthcare entities and providers, including but not limited to: lab results, diagnostic test reports, images, and other clinical information deemed necessary by PMUCFP\'s physicians or representatives.\n\nI understand that I may inspect my protected health information, or that of my dependents, request additional information, and revoke this authorization in accordance with federal privacy regulations and PMUCFP\'s privacy policy. I understand that this revocation must be made in writing, except to the extent that PMUCFP has already used or disclosed my protected health information based on my original request.',
    c1Check: 'I accept the Medical Disclosure',
    c2Title: 'ASSIGNED PARTIES',
    c2Body: 'I authorize assigned parties (attorney, chiropractor, or other providers) to act on my behalf to manage payments and agreements related to my case.',
    c2FullBody: 'MEDICAL INFORMATION RELEASE TO ASSIGNED PARTIES\n\nUnder the Health Insurance Portability and Accountability Act (HIPAA), I have certain rights regarding my protected health information. I hereby specifically authorize the disclosure of my health information for the following purposes:\n\nIn my absence, I authorize Precision Medical Urgent Care & Family Practice to release all or portions of my, or my dependents\', protected health information to the individuals or entities indicated below.\n\nThis authorization remains in effect until I revoke it in writing.',
    c2Check: 'I accept the Assigned Parties authorization',
    authPersonsLabel: 'Authorized responsible persons',
    authPersonsDesc: 'Add only the persons who will be able to receive or manage medical information on your behalf.',
    authPersonNamePh: "Responsible person's name",
    authPersonRelPh: 'Select relationship',
    authPersonRelations: ['Spouse', 'Parent', 'Child', 'Sibling', 'Legal guardian', 'Other'],
    addPersonBtn: '+ Add responsible person',
    authRecordsCheck: 'I authorize disclosure of all or part of my medical records to my parents (over 18 years old).',
    authVoicemailCheck: 'I authorize test results and appointment reminders to be left on my voicemail.',
    authNotificationsCheck: 'I authorize appointment notifications and reminders to be sent by email or text message.',
    c3Title: 'TREATMENT AUTHORIZATION',
    c3Body: 'I voluntarily consent to receive medical diagnosis and treatment at Precision Medical Care. I understand the risks and benefits of the proposed treatment and may withdraw this consent at any time.',
    c3FullBody: 'CONSENT FOR TREATMENT\n\nI hereby authorize care and consent to medical treatment, including tests and procedures, performed by the physician(s) or other healthcare providers for my treatment or the treatment of my dependents.\n\nI intend this authorization to apply to this visit and any future care that I or my dependents may seek.',
    c3Check: 'I accept the Treatment Authorization',
    c4Title: 'FINANCIAL POLICY',
    c4Body: 'I understand the financial policy of Precision Medical Care. I agree that charges not covered by my insurance or legal settlement are my personal responsibility. By signing, I acknowledge receipt and understanding of this policy.',
    c4FullBody: 'CREDIT AND FINANCE CHARGE POLICY AND AGREEMENT\n\nI agree to be financially responsible for any costs incurred for myself or my dependents. I understand that charges for services provided must be paid at the time of service, including any copayments or deductibles as per my agreement with my health insurance carrier. I understand that PMUCFP will submit claims on my behalf and that I am financially responsible for any balance, copayments, coinsurance, deductibles, or services not covered by my insurance company. I authorize any benefits due to me to be paid directly to Precision Medical Urgent Care & Family Practice (assignment of benefits).\n\nFINANCIAL RESPONSIBILITY\n\n• PMUCFP reserves the right to charge a fee of $50 to $100 for appointments canceled or missed without at least 24 hours\' notice.\n\n• A finance charge of 1.5% per month (APR 18%) will be added to my account if payment is not received within 30 days of the statement date.\n\n• I agree to pay a service fee of $25.00 for any returned check or other payment method returned by my financial institution.\n\n• If any amounts are referred to a third-party debt collection agency, I agree that, in addition to any other amounts allowed by law (including interest, court costs, and attorney fees), I will also be responsible for a collection fee of up to 40% of the principal amount owed, as permitted by Utah Code Annotated section 12-1-11. These terms apply to all the amounts incurred by me or any individual for whom I have legal responsibility, whether incurred before or after the date of this agreement.\n\nIn consideration for the medical services rendered, I acknowledge receipt of PMUCFP\'s Financial Policy and agree to pay for medical services according to its terms.',
    c4Check: 'I accept the Financial Policy',
    c4SignLabel: 'Acknowledgment signature — Financial policy',
    c4SignPh: '✍️ Draw your signature here',
    c4ClearBtn: '× Clear and re-sign',
    c5Title: 'MEDICAL HISTORY',
    c5Body: 'I authorize Precision Medical Care to request and receive my medical history from previous healthcare providers, with the sole purpose of providing the best possible care during my treatment.',
    c5FullBody: 'MEDICAL HISTORY AUTHORITY\n\nElectronic Health Records (EHR) System Authorization: PMUCFP has implemented a new Electronic Health Records (EHR) system that imports prescription history from third-party sources (e.g., pharmacies).\n\nIn order to transfer my current and past prescription history to this new system, I hereby provide my consent. By signing below, I authorize PMUCFP to transfer my prescription history.',
    c5Check: 'I accept the Medical History Authorization',
    showDoc: 'View full document ›',
    hideDoc: '‹ Hide document',
    consentsValidation: 'Please accept all 5 documents and sign the Financial Policy to continue.',
    sifoHint9: 'These consents are required legal documents. Read them carefully — they are designed to protect you.',
    // Step 10 — Lien
    sifoHint10: 'This signature authorizes Precision Medical to treat your injury under a lien. It is legal and binding.',
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

const REFERRAL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'LAW_FIRM', label: 'Abogado / Bufete de abogados' },
  { value: 'WEB_SEARCH', label: 'Búsqueda web' },
  { value: 'ACCIDENT_CENTER', label: 'Centro de accidentes Axcess' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'FAMILY', label: 'Familia' },
  { value: 'GOOGLE', label: 'Google' },
  { value: 'GOOGLE_MAPS', label: 'Google Maps' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'WEBSITE', label: 'Página web' },
  { value: 'CLINIC_STAFF', label: 'Personal de la clínica' },
  { value: 'CHIROPRACTOR', label: 'Quiropráctico' },
  { value: 'REFERRAL', label: 'Recomendación' },
  { value: 'PATIENT_REFERRAL', label: 'Recomendación de paciente' },
  { value: 'INSURANCE', label: 'Seguro' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'OTHER', label: 'Otro' },
];

const COMM_OPTIONS = [
  { value: '', label: '—' },
  { value: 'PHONE', label: 'Teléfono' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'TEXT', label: 'Mensaje de texto' },
  { value: 'ANY', label: 'Cualquiera' },
];

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
    cellPhone:            '',
    email:                patient.email ?? '',
    addressLine1:         '',
    addressCity:          '',
    addressState:         '',
    addressZip:           '',
    // Información clínica Step 2
    referralSource:         '',
    communicationPreference: '',
    // Información clínica Step 3
    referredBy:           '',
    preferredPharmacy:    '',
    employer:             '',
    race:                 '',
    ethnicity:            '',
    sex:                  '',
    maritalStatus:        '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    emergency2Name:       '',
    emergency2Phone:      '',
    emergency2Relation:   '',
    guardianName:         '',
    guardianLastName:     '',
    guardianEmail:        '',
    guardianDOB:          '',
    guardianPhone:        '',
    guardianCellPhone:    '',
    guardianAddress:      '',
    guardianRelation:     '',
  });

  // Calcular si es menor de edad (DOB del paciente, parseo local)
  const isMinorPatient = (() => {
    const dob = personal.dateOfBirth || patient.dateOfBirth;
    if (!dob) return false;
    const [y, mo, d] = dob.slice(0, 10).split('-').map(Number);
    const birth = new Date(y, mo - 1, d);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 18;
  })();

  const [acc, setAcc] = useState({
    date:         isoToInput(accident.date),
    type:         (['MVA', 'GM'].includes(accident.type ?? '') ? accident.type as CaseType : 'MVA'),
    notes:        accident.notes ?? '',
    lawFirm:      '',
    attorney:     '',
    chiropractor: '',
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
  const [cellPhoneError, setCellPhoneError]     = useState('');
  const [emerPhoneError, setEmerPhoneError]     = useState('');
  const [emer2PhoneError, setEmer2PhoneError]   = useState('');

  // Step 7 — Consentimientos
  const [consents, setConsents] = useState({
    hipaa:             false,
    assignedParties:   false,
    authRecords:       false,
    authVoicemail:     false,
    authNotifications: false,
    treatment:         false,
    financial:         false,
    medicalHistory:    false,
    authorizedPersons: [] as { name: string; relation: string }[],
  });
  const consentCanvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawingConsent  = useRef(false);
  const [hasConsentSig, setHasConsentSig] = useState(false);
  const [consentsError, setConsentsError] = useState('');

  // Step 8 — Lien signature
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

  // ── Consent canvas (Step 7 · financial policy signature) ───────────────────
  const startConsentDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = consentCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingConsent.current = true;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0]!.clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0]!.clientY - rect.top  : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const drawConsent = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawingConsent.current) return;
    const canvas = consentCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0]!.clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0]!.clientY - rect.top  : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setHasConsentSig(true);
  }, []);

  const endConsentDraw = useCallback(() => { isDrawingConsent.current = false; }, []);

  const clearConsentCanvas = useCallback(() => {
    const canvas = consentCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasConsentSig(false);
  }, []);

  useEffect(() => {
    const canvas = consentCanvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width  = parent.clientWidth;
      canvas.height = 120;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── Lien canvas (Step 8) ────────────────────────────────────────────────────
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
      if (stepNum === 3) body = { additional: {
        emergencyContactName:     personal.emergencyContactName,
        emergencyContactPhone:    personal.emergencyContactPhone,
        emergencyContactRelation: personal.emergencyContactRelation,
        emergency2Name:           personal.emergency2Name,
        emergency2Phone:          personal.emergency2Phone,
        emergency2Relation:       personal.emergency2Relation,
        referredBy:               personal.referredBy,
        preferredPharmacy:        personal.preferredPharmacy,
        employer:                 personal.employer,
        race:                     personal.race,
        ethnicity:                personal.ethnicity,
        sex:                      personal.sex,
        maritalStatus:            personal.maritalStatus,
      }};
      if (stepNum === 4) body = { guardian: {
        guardianName:      personal.guardianName,
        guardianLastName:  personal.guardianLastName,
        guardianEmail:     personal.guardianEmail,
        guardianDOB:       personal.guardianDOB,
        guardianPhone:     personal.guardianPhone,
        guardianCellPhone: personal.guardianCellPhone,
        guardianAddress:   personal.guardianAddress,
        guardianRelation:  personal.guardianRelation,
      }};
      if (stepNum === 5) body = { accident: { date: acc.date, type: acc.type, notes: acc.notes, lawFirm: acc.lawFirm, attorney: acc.attorney, chiropractor: acc.chiropractor } };
      if (stepNum === 6) body = { insurance };
      if (stepNum === 7) body = { health };
      if (stepNum === 9) {
        const consentSvg = consentCanvasRef.current ? consentCanvasRef.current.toDataURL('image/png') : '';
        body = {
          consents: {
            hipaa:              consents.hipaa,
            assignedParties:    consents.assignedParties,
            authRecords:        consents.authRecords,
            authVoicemail:      consents.authVoicemail,
            authNotifications:  consents.authNotifications,
            authorizedPersons:  consents.authorizedPersons.filter(p => p.name.trim()),
            treatment:         consents.treatment,
            financial:         consents.financial,
            financialSignatureSvg: consentSvg,
            medicalHistory:    consents.medicalHistory,
          },
        };
      }

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
      const phoneMsg = lang === 'es' ? 'Teléfono inválido. Usa el formato (801) 555-0100.' : 'Invalid phone. Use format (801) 555-0100.';
      if (personal.phone && !isValidNANP(personal.phone)) { setPhoneError(phoneMsg); valid = false; } else { setPhoneError(''); }
      if (personal.cellPhone && !isValidNANP(personal.cellPhone)) { setCellPhoneError(phoneMsg); valid = false; } else { setCellPhoneError(''); }
      if (!valid) return;
    }
    if (fromStep === 3) {
      let valid = true;
      const phoneMsg = lang === 'es' ? 'Teléfono inválido. Usa el formato (801) 555-0100.' : 'Invalid phone. Use format (801) 555-0100.';
      if (personal.emergencyContactPhone && !isValidNANP(personal.emergencyContactPhone)) { setEmerPhoneError(phoneMsg); valid = false; } else { setEmerPhoneError(''); }
      if (personal.emergency2Phone && !isValidNANP(personal.emergency2Phone)) { setEmer2PhoneError(phoneMsg); valid = false; } else { setEmer2PhoneError(''); }
      if (!valid) return;
    }
    if (fromStep === 9) {
      const checked = [consents.hipaa, consents.assignedParties, consents.treatment, consents.financial, consents.medicalHistory].filter(Boolean).length;
      if (checked < 5 || !hasConsentSig) {
        setConsentsError(t.consentsValidation);
        return;
      }
      setConsentsError('');
    }
    if ([2, 3, 4, 5, 6, 7, 9].includes(fromStep)) {
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
  const totalSteps    = 10;
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── Sección 1: Información personal ── */}
              <FormSection
                title={lang === 'es' ? 'Información personal' : 'Personal information'}
                sub={lang === 'es' ? 'Necesitamos su información básica para identificarlo en nuestro sistema.' : 'We need your basic information to identify you in our system.'}
              >
                {/* Nombre + Apellido */}
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

                {/* DOB + Teléfono */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.dob}>
                    <input type="date" lang="en-US" style={S.input} value={personal.dateOfBirth}
                      onChange={e => setPersonal(p => ({ ...p, dateOfBirth: e.target.value }))} />
                  </Field>
                  <Field label={t.phone}>
                    <input type="tel" style={{ ...S.input, ...(phoneError ? { borderColor: '#F43F5E' } : {}) }}
                      value={personal.phone} placeholder="(801) 555-0100"
                      onChange={e => { setPersonal(p => ({ ...p, phone: e.target.value })); setPhoneError(''); }} />
                    {phoneError && <span style={{ fontSize: 11, color: '#F43F5E', marginTop: 4, display: 'block' }}>{phoneError}</span>}
                  </Field>
                </div>

                {/* Celular + Email */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.cellPhone}>
                    <input type="tel" style={{ ...S.input, ...(cellPhoneError ? { borderColor: '#F43F5E' } : {}) }}
                      value={personal.cellPhone} placeholder={t.cellPhonePh}
                      onChange={e => { setPersonal(p => ({ ...p, cellPhone: e.target.value })); setCellPhoneError(''); }} />
                    {cellPhoneError && <span style={{ fontSize: 11, color: '#F43F5E', marginTop: 4, display: 'block' }}>{cellPhoneError}</span>}
                  </Field>
                  <Field label={t.email}>
                    <input type="email" style={S.input} value={personal.email}
                      placeholder="correo@ejemplo.com"
                      onChange={e => setPersonal(p => ({ ...p, email: e.target.value }))} />
                  </Field>
                </div>

                {/* Dirección */}
                <Field label={t.addressLine1}>
                  <input type="text" style={S.input} value={personal.addressLine1}
                    placeholder={t.addressLine1Ph}
                    onChange={e => setPersonal(p => ({ ...p, addressLine1: e.target.value }))} />
                </Field>

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
              </FormSection>

              {/* ── Sección 2: Información clínica ── */}
              <FormSection title={t.clinicalSection} sub={t.clinicalSub}>
                {/* Estado + Ciudad + C.P. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.addressState}>
                    <select
                      style={{ ...S.input, backgroundColor: '#1a2236', color: personal.addressState ? '#fff' : 'rgba(255,255,255,0.35)' }}
                      value={personal.addressState}
                      onChange={e => setPersonal(p => ({ ...p, addressState: e.target.value, addressCity: '', addressZip: '' }))}
                    >
                      <option value="">{lang === 'es' ? 'Seleccionar estado' : 'Select state'}</option>
                      <option value="Utah">Utah</option>
                      {US_STATES.filter(s => s.name !== 'Utah').map(s => (
                        <option key={s.code} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.addressCity}>
                    <select
                      style={{ ...S.input, backgroundColor: '#1a2236', color: personal.addressCity ? '#fff' : 'rgba(255,255,255,0.35)', opacity: personal.addressState ? 1 : 0.5 }}
                      value={personal.addressCity}
                      disabled={!personal.addressState}
                      onChange={e => {
                        const city = e.target.value;
                        const zip = CITY_ZIP[city] ?? '';
                        setPersonal(p => ({ ...p, addressCity: city, addressZip: zip }));
                      }}
                    >
                      <option value="">{personal.addressState ? (lang === 'es' ? 'Seleccionar ciudad' : 'Select city') : (lang === 'es' ? 'Primero selecciona estado' : 'Select state first')}</option>
                      {(personal.addressState
                        ? (CITIES_BY_STATE[US_STATES.find(s => s.name === personal.addressState)?.code ?? ''] ?? [])
                        : []
                      ).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={lang === 'es' ? 'Código postal' : 'ZIP code'}>
                  <input type="text" style={S.input} value={personal.addressZip}
                    placeholder="84601" maxLength={10}
                    onChange={e => setPersonal(p => ({ ...p, addressZip: e.target.value }))} />
                </Field>

                {/* ¿Cómo se enteró? + ¿Cómo prefiere comunicación? */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.commPref}>
                    <select
                      style={{ ...S.input, backgroundColor: '#1a2236', color: personal.communicationPreference ? '#fff' : 'rgba(255,255,255,0.35)' }}
                      value={personal.communicationPreference}
                      onChange={e => setPersonal(p => ({ ...p, communicationPreference: e.target.value }))}
                    >
                      {COMM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label={t.howHeard}>
                    <select
                      style={{ ...S.input, backgroundColor: '#1a2236', color: personal.referralSource ? '#fff' : 'rgba(255,255,255,0.35)' }}
                      value={personal.referralSource}
                      onChange={e => setPersonal(p => ({ ...p, referralSource: e.target.value }))}
                    >
                      {REFERRAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                </div>

              </FormSection>


            </div>

            <SifoHint hint={t.sifoHint2} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(2 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 3 · Información adicional ══════════════════════════════════ */}
        {step === 3 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="📋" title={t.additionalTitle} sub={t.additionalSub} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── Sección 1: Información clínica ── */}
              <FormSection title={t.clinicalSection} sub={t.clinicalSub}>
                {/* Referido por + Farmacia */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.referredBy}>
                    <input type="text" style={S.input} value={personal.referredBy}
                      placeholder={t.referredByPh}
                      onChange={e => setPersonal(p => ({ ...p, referredBy: e.target.value }))} />
                  </Field>
                  <Field label={t.preferredPharmacy}>
                    <input type="text" style={S.input} value={personal.preferredPharmacy}
                      placeholder={t.preferredPharmacyPh}
                      onChange={e => setPersonal(p => ({ ...p, preferredPharmacy: e.target.value }))} />
                  </Field>
                </div>

                {/* Empleador */}
                <Field label={t.employer}>
                  <input type="text" style={S.input} value={personal.employer}
                    placeholder={t.employerPh}
                    onChange={e => setPersonal(p => ({ ...p, employer: e.target.value }))} />
                </Field>

                {/* Raza + Etnicidad */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.raceLabel}>
                    <select style={{ ...S.input, backgroundColor: '#1a2236', color: personal.race ? '#fff' : 'rgba(255,255,255,0.35)' }}
                      value={personal.race} onChange={e => setPersonal(p => ({ ...p, race: e.target.value }))}>
                      <option value="">—</option>
                      <option value="WHITE">{lang === 'es' ? 'Blanco / Caucásico' : 'White / Caucasian'}</option>
                      <option value="AFRICAN_AMERICAN">{lang === 'es' ? 'Negro / Afroamericano' : 'Black / African American'}</option>
                      <option value="ASIAN">{lang === 'es' ? 'Asiático' : 'Asian'}</option>
                      <option value="AMERICAN_INDIAN_ALASKA_NATIVE">{lang === 'es' ? 'Indígena americano / Alaska' : 'American Indian / Alaska Native'}</option>
                      <option value="NATIVE_HAWAIIAN">{lang === 'es' ? 'Nativo hawaiano' : 'Native Hawaiian'}</option>
                      <option value="PACIFIC_ISLANDER">{lang === 'es' ? 'Isleño del Pacífico' : 'Pacific Islander'}</option>
                      <option value="OTHER">{lang === 'es' ? 'Otro' : 'Other'}</option>
                      <option value="PREFER_NOT_TO_SAY">{lang === 'es' ? 'Prefiero no decir' : 'Prefer not to say'}</option>
                    </select>
                  </Field>
                  <Field label={t.ethnicityLabel}>
                    <select style={{ ...S.input, backgroundColor: '#1a2236', color: personal.ethnicity ? '#fff' : 'rgba(255,255,255,0.35)' }}
                      value={personal.ethnicity} onChange={e => setPersonal(p => ({ ...p, ethnicity: e.target.value }))}>
                      <option value="">—</option>
                      <option value="HISPANIC_LATINO">{lang === 'es' ? 'Hispano / Latino' : 'Hispanic / Latino'}</option>
                      <option value="NOT_HISPANIC_LATINO">{lang === 'es' ? 'No hispano / Latino' : 'Not Hispanic / Latino'}</option>
                      <option value="PREFER_NOT_TO_SAY">{lang === 'es' ? 'Prefiero no decir' : 'Prefer not to say'}</option>
                    </select>
                  </Field>
                </div>

                {/* Sexo + Idioma preferido + Estado civil */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label={t.sexLabel}>
                    <select style={{ ...S.input, backgroundColor: '#1a2236', color: personal.sex ? '#fff' : 'rgba(255,255,255,0.35)' }}
                      value={personal.sex} onChange={e => setPersonal(p => ({ ...p, sex: e.target.value }))}>
                      <option value="">—</option>
                      <option value="MALE">{lang === 'es' ? 'Masculino' : 'Male'}</option>
                      <option value="FEMALE">{lang === 'es' ? 'Femenino' : 'Female'}</option>
                      <option value="NON_BINARY">{lang === 'es' ? 'No binario' : 'Non-binary'}</option>
                      <option value="OTHER">{lang === 'es' ? 'Otro' : 'Other'}</option>
                      <option value="PREFER_NOT_TO_SAY">{lang === 'es' ? 'Prefiero no decir' : 'Prefer not to say'}</option>
                    </select>
                  </Field>
                  <Field label={t.preferredLangLabel}>
                    <select style={{ ...S.input, backgroundColor: '#1a2236' }}
                      value={lang} onChange={e => setLang(e.target.value as Lang)}>
                      <option value="es">Español</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                  <Field label={t.maritalStatusLabel}>
                    <select style={{ ...S.input, backgroundColor: '#1a2236', color: personal.maritalStatus ? '#fff' : 'rgba(255,255,255,0.35)' }}
                      value={personal.maritalStatus} onChange={e => setPersonal(p => ({ ...p, maritalStatus: e.target.value }))}>
                      <option value="">—</option>
                      <option value="SINGLE">{lang === 'es' ? 'Soltero/a' : 'Single'}</option>
                      <option value="MARRIED">{lang === 'es' ? 'Casado/a' : 'Married'}</option>
                      <option value="DIVORCED">{lang === 'es' ? 'Divorciado/a' : 'Divorced'}</option>
                      <option value="WIDOWED">{lang === 'es' ? 'Viudo/a' : 'Widowed'}</option>
                      <option value="SEPARATED">{lang === 'es' ? 'Separado/a' : 'Separated'}</option>
                      <option value="OTHER">{lang === 'es' ? 'Otro' : 'Other'}</option>
                    </select>
                  </Field>
                </div>
              </FormSection>

              {/* ── Sección 2: Contactos de emergencia ── */}
              <FormSection
                title={t.emergencySection}
                sub={t.emergencyAllOptional}
                accent="rgba(99,102,241,0.08)"
                accentBorder="rgba(99,102,241,0.20)"
              >
                {/* Contacto 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label={t.emergencyName}>
                    <input type="text" style={S.input} value={personal.emergencyContactName}
                      placeholder={t.emergencyNamePh}
                      onChange={e => setPersonal(p => ({ ...p, emergencyContactName: e.target.value }))} />
                  </Field>
                  <Field label={t.emergencyPhone}>
                    <input type="tel" style={{ ...S.input, ...(emerPhoneError ? { borderColor: '#F43F5E' } : {}) }}
                      value={personal.emergencyContactPhone} placeholder={t.emergencyPhonePh}
                      onChange={e => { setPersonal(p => ({ ...p, emergencyContactPhone: e.target.value })); setEmerPhoneError(''); }} />
                    {emerPhoneError && <span style={{ fontSize: 11, color: '#F43F5E', marginTop: 4, display: 'block' }}>{emerPhoneError}</span>}
                  </Field>
                  <Field label={t.emergencyRelation}>
                    <input type="text" style={S.input} value={personal.emergencyContactRelation}
                      placeholder={t.emergencyRelationPh}
                      onChange={e => setPersonal(p => ({ ...p, emergencyContactRelation: e.target.value }))} />
                  </Field>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '2px 0' }} />
                {/* Contacto 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label={t.emergency2Name}>
                    <input type="text" style={S.input} value={personal.emergency2Name}
                      placeholder={t.emergency2NamePh}
                      onChange={e => setPersonal(p => ({ ...p, emergency2Name: e.target.value }))} />
                  </Field>
                  <Field label={t.emergency2Phone}>
                    <input type="tel" style={{ ...S.input, ...(emer2PhoneError ? { borderColor: '#F43F5E' } : {}) }}
                      value={personal.emergency2Phone} placeholder={t.emergency2PhonePh}
                      onChange={e => { setPersonal(p => ({ ...p, emergency2Phone: e.target.value })); setEmer2PhoneError(''); }} />
                    {emer2PhoneError && <span style={{ fontSize: 11, color: '#F43F5E', marginTop: 4, display: 'block' }}>{emer2PhoneError}</span>}
                  </Field>
                  <Field label={t.emergency2Relation}>
                    <input type="text" style={S.input} value={personal.emergency2Relation}
                      placeholder={t.emergency2RelationPh}
                      onChange={e => setPersonal(p => ({ ...p, emergency2Relation: e.target.value }))} />
                  </Field>
                </div>
              </FormSection>


            </div>
            <SifoHint hint={t.sifoHint3} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(3 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 4 · Persona responsable ══════════════════════════════════ */}
        {step === 4 && (
          <div style={{ paddingTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <StepHeader icon="👤" title={t.guardianStepTitle} sub={t.guardianStepSub} />
              <button
                type="button"
                onClick={() => { setStep(5); window.scrollTo(0, 0); }}
                style={{
                  flexShrink: 0, marginTop: 4,
                  padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                ⊘ {t.guardianSkip}
              </button>
            </div>

            {/* Info chip */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 20, marginBottom: 16,
              background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.20)',
              fontSize: 11, color: 'rgba(6,182,212,0.80)',
            }}>
              ℹ {t.guardianStepNote}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FormSection title={t.guardianSection} sub={t.guardianSectionSub}>
                {/* Nombre + Apellido */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.guardianFirstName}>
                    <input type="text" style={S.input} value={personal.guardianName}
                      placeholder={lang === 'es' ? 'Nombre del responsable' : 'Guardian first name'}
                      onChange={e => setPersonal(p => ({ ...p, guardianName: e.target.value }))} />
                  </Field>
                  <Field label={t.guardianLastName}>
                    <input type="text" style={S.input} value={personal.guardianLastName}
                      placeholder={lang === 'es' ? 'Apellido del responsable' : 'Guardian last name'}
                      onChange={e => setPersonal(p => ({ ...p, guardianLastName: e.target.value }))} />
                  </Field>
                </div>

                {/* Email */}
                <Field label={t.guardianEmail}>
                  <input type="email" style={S.input} value={personal.guardianEmail}
                    placeholder="correo@ejemplo.com"
                    onChange={e => setPersonal(p => ({ ...p, guardianEmail: e.target.value }))} />
                </Field>

                {/* DOB + Teléfono */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={t.guardianDOB}>
                    <input type="date" lang="en-US" style={S.input} value={personal.guardianDOB}
                      onChange={e => setPersonal(p => ({ ...p, guardianDOB: e.target.value }))} />
                  </Field>
                  <Field label={t.guardianPhone}>
                    <input type="tel" style={S.input} value={personal.guardianPhone}
                      placeholder="(801) 555-0100"
                      onChange={e => setPersonal(p => ({ ...p, guardianPhone: e.target.value }))} />
                  </Field>
                </div>

                {/* Celular */}
                <Field label={t.guardianCellPhone}>
                  <input type="tel" style={S.input} value={personal.guardianCellPhone}
                    placeholder="(801) 555-0100"
                    onChange={e => setPersonal(p => ({ ...p, guardianCellPhone: e.target.value }))} />
                </Field>

                {/* Dirección */}
                <Field label={t.guardianAddress}>
                  <input type="text" style={S.input} value={personal.guardianAddress}
                    placeholder={lang === 'es' ? 'Ej: 123 Main St, Provo, UT' : 'E.g.: 123 Main St, Provo, UT'}
                    onChange={e => setPersonal(p => ({ ...p, guardianAddress: e.target.value }))} />
                </Field>
              </FormSection>
            </div>

            <SifoHint hint={t.sifoHint4} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(4 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 5 · Motivo de consulta (B.6) ════════════════════════════ */}
        {step === 5 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="📋" title={t.accidentTitle} sub={t.accidentSub} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Tipo de caso — MVA vs GM */}
              <FormSection title={t.accidentTypeLabel} sub={lang === 'es' ? 'Cuéntenos detalladamente por qué nos visita hoy.' : 'Tell us in detail why you are visiting us today.'}>
                <Field label={t.accidentTypeLabel}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {(['MVA', 'GM'] as CaseType[]).map(key => (
                      <label key={key} onClick={() => setAcc(a => ({ ...a, type: key }))} style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                        border: acc.type === key ? '1px solid rgba(6,182,212,0.60)' : '1px solid rgba(255,255,255,0.10)',
                        background: acc.type === key ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.03)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                            border: acc.type === key ? '5px solid rgba(6,182,212,0.90)' : '2px solid rgba(255,255,255,0.25)',
                          }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: acc.type === key ? CYAN : 'rgba(255,255,255,0.80)' }}>
                            {t.caseTypesMap[key]}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 24 }}>
                          {t.caseTypesSub[key]}
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
              </FormSection>

              {/* Detalles — solo MVA */}
              {acc.type === 'MVA' && (
                <>
                  <FormSection
                    title={lang === 'es' ? 'Fecha del accidente' : 'Accident date'}
                    sub={lang === 'es' ? 'Describa correctamente la razón de su visita a la clínica.' : 'Describe correctly the reason for your visit to the clinic.'}
                  >
                    <Field label={t.accidentDate}>
                      <input type="date" lang="en-US" style={S.input} value={acc.date}
                        onChange={e => setAcc(a => ({ ...a, date: e.target.value }))} />
                    </Field>

                    <Field label={t.accidentDesc}>
                      <textarea style={S.textarea} value={acc.notes}
                        placeholder={t.accidentDescPh}
                        onChange={e => setAcc(a => ({ ...a, notes: e.target.value }))} />
                    </Field>
                  </FormSection>

                  <FormSection
                    title={t.legalRepsSection}
                    sub={lang === 'es' ? 'Si tienes representación legal o quiropráctico asignado, agrégalos aquí (opcional).' : 'If you have legal representation or an assigned chiropractor, add them here (optional).'}
                    accent="rgba(99,102,241,0.08)"
                    accentBorder="rgba(99,102,241,0.20)"
                  >
                    <Field label={t.lawFirm}>
                      <input type="text" style={S.input} value={acc.lawFirm}
                        placeholder={t.lawFirmPh}
                        onChange={e => setAcc(a => ({ ...a, lawFirm: e.target.value }))} />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <Field label={t.attorneyRep}>
                        <input type="text" style={S.input} value={acc.attorney}
                          placeholder={t.attorneyRepPh}
                          onChange={e => setAcc(a => ({ ...a, attorney: e.target.value }))} />
                      </Field>
                      <Field label={t.chiropractorLabel}>
                        <input type="text" style={S.input} value={acc.chiropractor}
                          placeholder={t.chiropractorPh}
                          onChange={e => setAcc(a => ({ ...a, chiropractor: e.target.value }))} />
                      </Field>
                    </div>
                  </FormSection>
                </>
              )}

            </div>

            <SifoHint hint={t.sifoHint5} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(5 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 6 · Tu seguro (B.6) ══════════════════════════════════════ */}
        {step === 6 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="🏥" title={t.insuranceTitle} sub={t.insuranceSub} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Banner informativo PIP */}
              <div style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '14px 16px', borderRadius: 12,
                background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.22)',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>ℹ️</span>
                <div>
                  <div style={{ fontSize: 12, color: CYAN, fontWeight: 700, marginBottom: 3 }}>{t.pipTitle}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{t.pipDesc}</div>
                </div>
              </div>

              <FormSection
                title={lang === 'es' ? 'Tu póliza de seguro PIP' : 'Your PIP insurance policy'}
                sub={lang === 'es' ? 'Necesitamos los datos de tu seguro de automóvil para procesar tu reclamación.' : 'We need your auto insurance details to process your claim.'}
              >
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
              </FormSection>
            </div>

            <SifoHint hint={t.sifoHint6} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(6 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 7 · Historial médico (B.7) ═════════════════════════════ */}
        {step === 7 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="💊" title={t.healthTitle} sub={t.healthSub} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <FormSection
                title={lang === 'es' ? 'Estado general de salud' : 'General health status'}
                sub={lang === 'es' ? 'Selecciona cómo describes tu estado de salud general.' : 'Select how you would describe your general health status.'}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {(['excellent', 'good', 'fair', 'poor'] as HealthStatus[]).map(v => {
                    const labels: Record<HealthStatus, string> = {
                      excellent: t.healthExcellent, good: t.healthGood,
                      fair: t.healthFair, poor: t.healthPoor,
                    };
                    const colors: Record<HealthStatus, string> = {
                      excellent: 'rgba(16,185,129,', good: 'rgba(6,182,212,',
                      fair: 'rgba(245,158,11,', poor: 'rgba(244,63,94,',
                    };
                    const active = health.healthStatus === v;
                    return (
                      <button key={v} type="button"
                        onClick={() => setHealth(h => ({ ...h, healthStatus: v }))}
                        style={{
                          padding: '10px 4px', borderRadius: 10,
                          border: active ? `1px solid ${colors[v]}0.55)` : '1px solid rgba(255,255,255,0.10)',
                          background: active ? `${colors[v]}0.12)` : 'rgba(255,255,255,0.03)',
                          color: active ? `${colors[v]}1)` : 'rgba(255,255,255,0.55)',
                          fontSize: 12, fontWeight: active ? 700 : 400,
                          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all 0.15s',
                        }}>
                        {labels[v]}
                      </button>
                    );
                  })}
                </div>
              </FormSection>

              {/* Medicamentos */}
              <FormSection
                title={lang === 'es' ? 'Medicamentos' : 'Medications'}
                sub={lang === 'es' ? '¿Actualmente tomas algún medicamento recetado o de venta libre?' : 'Are you currently taking any prescription or over-the-counter medications?'}
                accent={health.hasMedications ? 'rgba(6,182,212,0.05)' : undefined}
                accentBorder={health.hasMedications ? 'rgba(6,182,212,0.18)' : undefined}
              >
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
              </FormSection>

              {/* Alergias */}
              <FormSection
                title={lang === 'es' ? 'Alergias' : 'Allergies'}
                sub={lang === 'es' ? '¿Tienes alguna alergia conocida a medicamentos, alimentos u otras sustancias?' : 'Do you have any known allergies to medications, foods, or other substances?'}
                accent={health.hasAllergies ? 'rgba(245,158,11,0.05)' : undefined}
                accentBorder={health.hasAllergies ? 'rgba(245,158,11,0.18)' : undefined}
              >
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
              </FormSection>

              {/* Lesiones / cirugías previas */}
              <FormSection
                title={lang === 'es' ? 'Lesiones o cirugías previas' : 'Previous injuries or surgeries'}
                sub={lang === 'es' ? '¿Has tenido lesiones, cirugías o condiciones médicas previas relevantes?' : 'Have you had any relevant previous injuries, surgeries, or medical conditions?'}
                accent={health.hasPreviousInjuries ? 'rgba(244,63,94,0.05)' : undefined}
                accentBorder={health.hasPreviousInjuries ? 'rgba(244,63,94,0.18)' : undefined}
              >
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
              </FormSection>

            </div>

            <SifoHint hint={t.sifoHint7} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(7 as Step)} t={t} />
          </div>
        )}

        {/* ══════ STEP 8 · Tu identificación (B.7) ════════════════════════════ */}
        {step === 8 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="📸" title={t.idTitle} sub={t.idSub} />

            {!takeAtClinic ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Selfie */}
                  <FormSection
                    title={t.selfieLabel}
                    sub={lang === 'es' ? 'Necesitamos verificar tu identidad con una foto reciente.' : 'We need to verify your identity with a recent photo.'}
                    accent={idPhotos.selfie ? 'rgba(6,182,212,0.06)' : undefined}
                    accentBorder={idPhotos.selfie ? 'rgba(6,182,212,0.20)' : undefined}
                  >
                    <PhotoCaptureCard
                      guideType="face" title={t.selfieLabel}
                      instructions={t.selfieInstructions} captureLabel={t.selfieCaptureLabel}
                      reviewQuestion={t.reviewQuestion} usePhotoLabel={t.usePhotoBtn}
                      retakeLabel={t.retakeBtn} changeLabel={t.changePhotoBtn}
                      confirmed={idPhotos.selfie}
                      onConfirm={file => setIdPhotos(p => ({ ...p, selfie: file }))}
                      capture="user" color={CYAN} lang={lang}
                    />
                  </FormSection>

                  {/* Licencia */}
                  <FormSection
                    title={t.dlLabel}
                    sub={lang === 'es' ? 'Fotografía el frente y reverso de tu licencia de conducir o ID estatal.' : 'Photograph the front and back of your driver\'s license or state ID.'}
                    accent={idPhotos.dlFront && idPhotos.dlBack ? 'rgba(99,102,241,0.06)' : undefined}
                    accentBorder={idPhotos.dlFront && idPhotos.dlBack ? 'rgba(99,102,241,0.20)' : undefined}
                  >
                    <PhotoCaptureCard
                      guideType="document" title={t.dlFront}
                      instructions={t.dlFrontInstructions} captureLabel={t.dlFrontCaptureLabel}
                      reviewQuestion={t.reviewQuestion} usePhotoLabel={t.usePhotoBtn}
                      retakeLabel={t.retakeBtn} changeLabel={t.changePhotoBtn}
                      confirmed={idPhotos.dlFront}
                      onConfirm={file => setIdPhotos(p => ({ ...p, dlFront: file }))}
                      capture="environment" color={INDIGO} lang={lang}
                    />
                    <PhotoCaptureCard
                      guideType="document" title={t.dlBack}
                      instructions={t.dlBackInstructions} captureLabel={t.dlBackCaptureLabel}
                      reviewQuestion={t.reviewQuestion} usePhotoLabel={t.usePhotoBtn}
                      retakeLabel={t.retakeBtn} changeLabel={t.changePhotoBtn}
                      confirmed={idPhotos.dlBack}
                      onConfirm={file => setIdPhotos(p => ({ ...p, dlBack: file }))}
                      capture="environment" color={INDIGO} lang={lang}
                    />
                  </FormSection>

                  {/* Tarjeta seguro */}
                  <FormSection
                    title={t.insCardLabel}
                    sub={lang === 'es' ? 'Fotografía tu tarjeta de seguro de automóvil (frente).' : 'Photograph your auto insurance card (front).'}
                    accent={idPhotos.insuranceCard ? 'rgba(16,185,129,0.06)' : undefined}
                    accentBorder={idPhotos.insuranceCard ? 'rgba(16,185,129,0.20)' : undefined}
                  >
                    <PhotoCaptureCard
                      guideType="document" title={t.insCardLabel}
                      instructions={t.insCardInstructions} captureLabel={t.insCardCaptureLabel}
                      reviewQuestion={t.reviewQuestion} usePhotoLabel={t.usePhotoBtn}
                      retakeLabel={t.retakeBtn} changeLabel={t.changePhotoBtn}
                      confirmed={idPhotos.insuranceCard}
                      onConfirm={file => setIdPhotos(p => ({ ...p, insuranceCard: file }))}
                      capture="environment" color={EMERALD} lang={lang}
                    />
                  </FormSection>

                  <div style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)',
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                    <span style={{ fontSize: 12, color: 'rgba(245,158,11,0.85)', lineHeight: 1.55 }}>{t.phase1Note}</span>
                  </div>
                </div>

                {/* "Lo tomo en la clínica" fallback */}
                <div style={{
                  marginTop: 16, padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginBottom: 10, fontWeight: 600 }}>
                    {t.cantPhotoTitle}
                  </div>
                  <button type="button" onClick={() => setTakeAtClinic(true)} style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)',
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

            <SifoHint hint={t.sifoHint8} />
            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              <button type="button" style={{ ...S.btnOutline, flex: '0 0 auto' }} onClick={goBack}>
                {t.back}
              </button>
              <button type="button" style={{ ...S.btnPrimary, flex: 1 }}
                onClick={() => { setStep(9); window.scrollTo(0, 0); }}>
                {t.continueToSign}
              </button>
            </div>
          </div>
        )}

        {/* ══════ STEP 9 · Consentimientos médicos (B.8) ══════════════════════ */}
        {step === 9 && (() => {
          const checkedCount = [consents.hipaa, consents.assignedParties, consents.treatment, consents.financial, consents.medicalHistory].filter(Boolean).length;
          const card = ({ active, onToggle, fullBody, checkLabel, children }: {
            active: boolean; onToggle: () => void;
            fullBody: string; checkLabel: string;
            children?: React.ReactNode;
          }) => {
            const firstBreak = fullBody.indexOf('\n\n');
            const docTitle = firstBreak !== -1 ? fullBody.slice(0, firstBreak) : fullBody;
            const docBody  = firstBreak !== -1 ? fullBody.slice(firstBreak + 2) : '';
            return (
            <div style={{
              ...S.card, padding: 14,
              background: active ? 'rgba(6,182,212,0.06)' : CARD_BG,
              border: active ? '1px solid rgba(6,182,212,0.30)' : `1px solid ${CARD_BORDER}`,
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: CYAN, marginBottom: 8, textTransform: 'uppercase' }}>
                {docTitle}
              </div>

              {/* Full text always visible with scroll */}
              <div style={{
                maxHeight: 200, overflowY: 'auto', margin: '0 0 10px',
                padding: '12px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
              }}>
                {docBody.split('\n').map((line, i) => {
                  if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
                  const isHeading = line === line.toUpperCase() && line.length > 3 && !line.startsWith('•');
                  const isBullet  = line.startsWith('•');
                  return (
                    <p key={i} style={{
                      margin: 0, marginBottom: 6,
                      fontSize: isHeading ? 10 : 12,
                      fontWeight: isHeading ? 800 : 400,
                      letterSpacing: isHeading ? '0.10em' : undefined,
                      textTransform: isHeading ? 'uppercase' : undefined,
                      color: isHeading ? CYAN : 'rgba(255,255,255,0.70)',
                      lineHeight: 1.70,
                      paddingLeft: isBullet ? 6 : 0,
                    }}>
                      {line}
                    </p>
                  );
                })}
              </div>

              {children}
              <label style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                padding: '10px 12px', borderRadius: 8, marginTop: 4,
                background: active ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.03)',
                border: active ? '1px solid rgba(6,182,212,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}>
                <input type="checkbox" checked={active} onChange={onToggle}
                  style={{ width: 16, height: 16, marginTop: 1, accentColor: CYAN, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: active ? CYAN : 'rgba(255,255,255,0.60)', fontWeight: active ? 700 : 400 }}>
                  {checkLabel}
                </span>
              </label>
            </div>
            );
          };
          return (
            <div style={{ paddingTop: 28 }}>
              <StepHeader icon="📋" title={t.consentsTitle} sub={t.consentsSub} />

              {/* Counter badge */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20, gap: 8,
              }}>
                <div style={{
                  padding: '6px 16px', borderRadius: 20,
                  background: checkedCount === 5 ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                  border: checkedCount === 5 ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.10)',
                  fontSize: 13, fontWeight: 700,
                  color: checkedCount === 5 ? EMERALD : 'rgba(255,255,255,0.50)',
                }}>
                  {checkedCount === 5 ? '✓ ' : ''}{t.consentsCounter(checkedCount)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Doc 1 — Divulgación médica */}
                {card({
                  active: consents.hipaa,
                  onToggle: () => setConsents(c => ({ ...c, hipaa: !c.hipaa })),
                  fullBody: t.c1FullBody,
                  checkLabel: t.c1Check,
                })}

                {/* Doc 2 — Partes cesionadas */}
                {card({
                  active: consents.assignedParties,
                  onToggle: () => setConsents(c => ({ ...c, assignedParties: !c.assignedParties })),
                  fullBody: t.c2FullBody,
                  checkLabel: t.c2Check,
                  children: (<>
                  {/* Personas responsables autorizadas */}
                  <div style={{
                    marginBottom: 12, borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.30)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                      }}>👤</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.80)' }}>{t.authPersonsLabel}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', lineHeight: 1.4 }}>{t.authPersonsDesc}</div>
                      </div>
                    </div>

                    {/* Filas editables inline */}
                    {consents.authorizedPersons.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                        {consents.authorizedPersons.map((p, i) => (
                          <div key={i}>
                            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                {t.authPersonNamePh}
                              </span>
                              <span style={{ flex: 1 }} />
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                {t.authPersonRelPh === 'Seleccione la relación' ? 'Relación' : 'Relationship'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input type="text"
                                style={{ ...S.input, fontSize: 12, padding: '8px 10px', flex: '2 1 120px', minWidth: 0 }}
                                placeholder={t.authPersonNamePh}
                                value={p.name}
                                onChange={e => setConsents(c => ({
                                  ...c,
                                  authorizedPersons: c.authorizedPersons.map((x, j) => j === i ? { ...x, name: e.target.value } : x),
                                }))}
                              />
                              <select
                                style={{
                                  ...S.input, fontSize: 12, padding: '8px 10px', flex: '1 1 100px', minWidth: 0,
                                  appearance: 'none', WebkitAppearance: 'none',
                                  backgroundColor: '#1a2236', color: '#fff',
                                }}
                                value={p.relation}
                                onChange={e => setConsents(c => ({
                                  ...c,
                                  authorizedPersons: c.authorizedPersons.map((x, j) => j === i ? { ...x, relation: e.target.value } : x),
                                }))}
                              >
                                <option value="">{t.authPersonRelPh}</option>
                                {t.authPersonRelations.map((r: string) => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <button type="button"
                                onClick={() => setConsents(c => ({ ...c, authorizedPersons: c.authorizedPersons.filter((_, j) => j !== i) }))}
                                style={{
                                  background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.20)',
                                  borderRadius: 7, color: 'rgba(244,63,94,0.70)', fontSize: 14,
                                  cursor: 'pointer', padding: '7px 10px', flexShrink: 0, lineHeight: 1,
                                }}>🗑</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Botón agregar fila */}
                    <button type="button"
                      onClick={() => setConsents(c => ({ ...c, authorizedPersons: [...c.authorizedPersons, { name: '', relation: '' }] }))}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        width: '100%', marginTop: consents.authorizedPersons.length > 0 ? 10 : 12,
                        padding: '10px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.10)',
                        color: 'rgba(255,255,255,0.50)', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {t.addPersonBtn}
                    </button>
                  </div>

                  {/* 3 checkboxes específicos de autorización */}
                  {([
                    { key: 'authRecords',       label: t.authRecordsCheck,       val: consents.authRecords,       set: (v: boolean) => setConsents(c => ({ ...c, authRecords: v })) },
                    { key: 'authVoicemail',     label: t.authVoicemailCheck,     val: consents.authVoicemail,     set: (v: boolean) => setConsents(c => ({ ...c, authVoicemail: v })) },
                    { key: 'authNotifications', label: t.authNotificationsCheck, val: consents.authNotifications, set: (v: boolean) => setConsents(c => ({ ...c, authNotifications: v })) },
                  ] as { key: string; label: string; val: boolean; set: (v: boolean) => void }[]).map(item => (
                    <label key={item.key} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                      padding: '9px 12px', borderRadius: 8, marginBottom: 6,
                      background: item.val ? 'rgba(6,182,212,0.07)' : 'rgba(255,255,255,0.02)',
                      border: item.val ? '1px solid rgba(6,182,212,0.22)' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <input type="checkbox" checked={item.val} onChange={e => item.set(e.target.checked)}
                        style={{ width: 15, height: 15, marginTop: 1, accentColor: CYAN, cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: item.val ? CYAN : 'rgba(255,255,255,0.55)', lineHeight: 1.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                  </>),
                })}

                {/* Doc 3 — Tratamiento */}
                {card({
                  active: consents.treatment,
                  onToggle: () => setConsents(c => ({ ...c, treatment: !c.treatment })),
                  fullBody: t.c3FullBody,
                  checkLabel: t.c3Check,
                })}

                {/* Doc 4 — Financiero + Firma */}
                {card({
                  active: consents.financial,
                  onToggle: () => setConsents(c => ({ ...c, financial: !c.financial })),
                  fullBody: t.c4FullBody,
                  checkLabel: t.c4Check,
                  children: (<>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>
                      {t.c4SignLabel}
                    </div>
                    <div style={{
                      position: 'relative', borderRadius: 8, overflow: 'hidden', touchAction: 'none',
                      border: hasConsentSig ? '1px solid rgba(6,182,212,0.40)' : '1px solid rgba(255,255,255,0.10)',
                      background: hasConsentSig ? 'rgba(6,182,212,0.04)' : 'rgba(255,255,255,0.02)',
                    }}>
                      <canvas ref={consentCanvasRef} style={{ display: 'block', cursor: 'crosshair' }}
                        onMouseDown={startConsentDraw} onMouseMove={drawConsent} onMouseUp={endConsentDraw} onMouseLeave={endConsentDraw}
                        onTouchStart={startConsentDraw} onTouchMove={drawConsent} onTouchEnd={endConsentDraw}
                      />
                      {!hasConsentSig && (
                        <div style={{
                          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          pointerEvents: 'none', fontSize: 13, color: 'rgba(255,255,255,0.20)',
                        }}>{t.c4SignPh}</div>
                      )}
                    </div>
                    {hasConsentSig && (
                      <button type="button" onClick={clearConsentCanvas} style={{
                        marginTop: 6, padding: '4px 12px', borderRadius: 6,
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      }}>{t.c4ClearBtn}</button>
                    )}
                  </div>
                  </>),
                })}

                {/* Doc 5 — Historial médico */}
                {card({
                  active: consents.medicalHistory,
                  onToggle: () => setConsents(c => ({ ...c, medicalHistory: !c.medicalHistory })),
                  fullBody: t.c5FullBody,
                  checkLabel: t.c5Check,
                })}

              </div>

              {consentsError && <SaveError error={consentsError} />}
              <SifoHint hint={t.sifoHint9} />
              <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(9 as Step)} t={t} />
            </div>
          );
        })()}

        {/* ══════ STEP 10 · Firma del Lien (B.8) ═══════════════════════════════ */}
        {step === 10 && (
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
            <SifoHint hint={t.sifoHint10} />

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

function FormSection({ title, sub, accent, accentBorder, children }: {
  title: string; sub?: string;
  accent?: string; accentBorder?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 14,
      background: accent ?? 'rgba(255,255,255,0.03)',
      border: `1px solid ${accentBorder ?? 'rgba(255,255,255,0.08)'}`,
      padding: '18px 16px',
    }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.80)', marginBottom: 2 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

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

let _cifoHintIndex = 0;
function SifoHint({ hint }: { hint: string }) {
  const gif = (++_cifoHintIndex % 2 === 0) ? '/cifo-2.gif' : '/cifo-1.gif';
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center',
      marginTop: 20, marginBottom: 4, padding: '10px 14px', borderRadius: 12,
      background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.20)',
    }}>
      <img src={gif} alt="Cifo" style={{
        width: 52, height: 52, flexShrink: 0, objectFit: 'contain',
        borderRadius: 8,
      }} />
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#A5B4FC', marginBottom: 3, letterSpacing: '0.10em' }}>
          CIFO
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', lineHeight: 1.55 }}>{hint}</div>
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

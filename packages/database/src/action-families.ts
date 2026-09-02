/**
 * Acción del audit log → FAMILIA de trabajo, y los números de portada.
 *
 * Vive acá y no en `packages/api` porque lo consumen DOS apps: el tab
 * Métricas de apps/web (vía tRPC) y `/carrera` del back-office, que lo abre a
 * toda la clínica. Es data de dominio sobre el audit log, y el audit log es de
 * este paquete (`writeAuditLog` vive al lado).
 */

/**
 * Acción del audit log → FAMILIA de trabajo.
 *
 * El reporte tenía una columna por acción suelta y cubría el 34% del trabajo:
 * los otros dos tercios (bufetes, envíos de portal, edición de casos, Vigía…)
 * solo se veían abriendo el detalle de la persona. Agregar 50 columnas no era
 * la salida; agrupar por familia sí, y de paso las familias son las mismas
 * áreas que el tiempo por módulo, así que una fila puede decir "estuvo N
 * minutos en Bufetes e hizo M cosas ahí".
 *
 * Lo que no está acá cae en `otros` y sigue apareciendo, acción por acción, en
 * el detalle del empleado: nada se oculta.
 *
 * Fuera del reporte de empleados por decisión, no por olvido:
 *   · acciones del PACIENTE (INTAKE_STEP_SAVE, PATIENT_SIGN_*) — no son staff;
 *   · SCRIPTSURE_* — las escribe el webhook de la farmacia;
 *   · firmar nota y "Terminé" — son del doctor, y el tab Doctores las mide con
 *     duración y drill-down por consulta.
 */
export type ActionFamily =
  | 'patients' | 'cases' | 'appointments' | 'admission' | 'clinical'
  | 'charges' | 'portal' | 'externals' | 'messages' | 'catalogs'
  | 'followup' | 'ai' | 'access' | 'voids' | 'otros';

export const ACTION_FAMILY: Record<string, ActionFamily> = {
  // Pacientes
  CREATE_PATIENT: 'patients', UPDATE_PATIENT: 'patients', DELETE_PATIENT: 'patients',
  RESTORE_PATIENT: 'patients', UPDATE_MEDICAL_HISTORY: 'patients',
  STAFF_PHOTO_UPLOAD: 'patients', STAFF_PHOTO_DELETE: 'patients',
  ADD_EXTERNAL_MEDICATION: 'patients', UPLOAD_DOCUMENT: 'patients',
  CREATE_DOCUMENT_FOLDER: 'patients', DELETE_DOCUMENT: 'patients',

  // Casos
  CREATE_CASE_FROM_CALL: 'cases', UPDATE_CASE: 'cases', DELETE_CASE: 'cases',
  ASSIGNMENT_CHANGE: 'cases', SET_CASE_COVERAGE: 'cases',
  UPDATE_CASE_INSURANCE_LEGAL: 'cases', UPDATE_CASE_AUTO_INSURANCE: 'cases',
  INSERT_CASE_NOTE: 'cases', COMPLETE_CASE_TRACKING: 'cases',
  VERIFY_PIP: 'cases', MARK_INTAKE_COMPLETE_DEV: 'cases',

  // Citas
  CREATE_APPOINTMENT: 'appointments', SCHEDULE_FIRST_APPOINTMENT: 'appointments',
  UPDATE_APPOINTMENT: 'appointments', CONFIRM_APPOINTMENT: 'appointments',
  CONFIRM_FIRST_APPOINTMENT: 'appointments', CANCEL_APPOINTMENT: 'appointments',

  // Admisión del día. ADMIT_TO_ROOM lo hace el ASISTENTE, no el doctor: estaba
  // clasificado como acción médica y por eso no aparecía en ninguna columna.
  CHECK_IN: 'admission', ADMIT_TO_ROOM: 'admission',
  TRIAGE_VITALS_SAVED: 'admission', TRIAGE_VITALS_CORRECTED: 'admission',
  CHECKOUT_APPOINTMENT: 'admission', REOPEN_APPOINTMENT: 'admission',

  // Clínico que el staff también hace (escribas, órdenes, resultados)
  CREATE_LAB_ORDER: 'clinical', ADD_LAB_ORDER: 'clinical',
  UPLOAD_LAB_RESULT: 'clinical', CREATE_VISIT_NOTE: 'clinical',
  ADD_PRESCRIPTION: 'clinical', SCRIPTSURE_REFILL: 'clinical',

  // Cobros y facturación
  CHARGE_CASH_SERVICE: 'charges', DISPENSE_BRACE: 'charges',
  REGISTER_BILLING_PAYMENT: 'charges', SETTLEMENT_PROCESSED: 'charges',
  HCFA_GENERATED: 'charges', BILLING_NOTE_ADDED: 'charges',

  // Envíos al paciente / portal
  SEND_PORTAL_LINK: 'portal', GENERATE_PORTAL_TOKEN: 'portal', REVOKE_PORTAL_TOKEN: 'portal',
  ATTORNEY_SIGN_LIEN: 'portal',

  // Bufetes, abogados y aseguradoras
  CREATE_LAWYER_FIRM: 'externals', UPDATE_LAWYER_FIRM: 'externals',
  SOFT_DELETE_LAWYER_FIRM: 'externals', CREATE_LAWYER_MEMBER: 'externals',
  UPDATE_LAWYER_MEMBER: 'externals', SOFT_DELETE_LAWYER_MEMBER: 'externals',
  CREATE_ADJUSTER: 'externals', UPDATE_ADJUSTER: 'externals',

  // Mensajería interna
  MESSAGE_THREAD_CREATED: 'messages', MESSAGE_ENTRY_REPLY: 'messages',
  MESSAGE_ENTRY_NOTE: 'messages', MESSAGE_THREAD_SEALED: 'messages',
  MESSAGE_TEMPLATE_CREATED: 'messages', MESSAGE_TEMPLATE_DELETED: 'messages',
  VIEW_MESSAGE_ATTACHMENT: 'messages',

  // Catálogos y configuración
  CREATE_SPECIALTY: 'catalogs', UPDATE_SPECIALTY: 'catalogs', SOFT_DELETE_SPECIALTY: 'catalogs',
  CREATE_SERVICE_CODE: 'catalogs', UPDATE_SERVICE_CODE: 'catalogs', SOFT_DELETE_SERVICE_CODE: 'catalogs',
  CREATE_INSURANCE: 'catalogs', UPDATE_INSURANCE: 'catalogs', SOFT_DELETE_INSURANCE: 'catalogs',
  CREATE_PROVIDER: 'catalogs', UPDATE_PROVIDER: 'catalogs', SOFT_DELETE_PROVIDER: 'catalogs',
  CREATE_DIAGNOSIS: 'catalogs', UPDATE_DIAGNOSIS: 'catalogs', DEACTIVATE_DIAGNOSIS: 'catalogs',
  CREATE_CLINIC: 'catalogs', UPDATE_CLINIC: 'catalogs', DELETE_CLINIC: 'catalogs',
  CREATE_TEMPLATE: 'catalogs', UPDATE_TEMPLATE: 'catalogs', SOFT_DELETE_TEMPLATE: 'catalogs',
  CREATE_CATALOG_ITEM: 'catalogs', UPDATE_CATALOG_ITEM: 'catalogs', SOFT_DELETE_CATALOG_ITEM: 'catalogs',

  // Seguimiento / cobranza (Edson)
  SEGUIMIENTO_CALL_LOGGED: 'followup', SEGUIMIENTO_EMAIL_LOGGED: 'followup',
  SEGUIMIENTO_NOTE_ADDED: 'followup', SEGUIMIENTO_PAYMENT_LOGGED: 'followup',
  SEGUIMIENTO_ESCALATED: 'followup',

  // IA
  VIGIA_ASK: 'ai',

  // Accesos: no son producción, pero conviene verlos (quién entró al portal de
  // un médico o a la bandeja de otro).
  DOCTOR_VIEW_AS: 'access', ATTORNEY_VIEW_AS: 'access',
  MESSAGING_VIEWED_OTHER_INBOX: 'access', VIEW_LAB_RESULT: 'access',
  LOGIN_SUCCESS: 'access', LOGIN_FAILED: 'access',

  // Retrabajo: lo que alguien tuvo que deshacer. Nunca es producción.
  VOID_CASH_SERVICE: 'voids', VOID_BRACE: 'voids', VOID_LAB_ORDER: 'voids',
  DELETE_LAB_ORDER: 'voids', CANCEL_BILLING_PAYMENT: 'voids',
  MESSAGE_THREAD_DELETED: 'voids', MESSAGE_THREAD_REMOVED_FROM_ALL_INBOXES: 'voids',
};

/** Acciones que NO son trabajo de staff — no entran a ninguna familia. */
export const NOT_STAFF_WORK = new Set([
  'INTAKE_STEP_SAVE', 'PATIENT_COMPLETE_INTAKE', 'PATIENT_SIGN_LIEN',
  'PATIENT_SIGN_ATTENDANCE', 'SIGN_VISIT_NOTE', 'DOCTOR_DONE_WITH_PATIENT',
  'DOCTOR_REOPEN_VISIT', 'SCRIPTSURE_WEBHOOK', 'SCRIPTSURE_RX_UPDATED',
  'SCRIPTSURE_RX_RECEIVED', 'SCRIPTSURE_DRUG_HISTORY_SYNC',
]);

/** Números de portada del período (los KPI de arriba del tab). */
export interface EmployeeHeadline {
  patientsCreated: number;
  casesCreated: number;
  appointmentsCreated: number;
  payments: number;
  voids: number;
}

export const HEADLINE_ACTIONS: Record<string, keyof EmployeeHeadline> = {
  CREATE_PATIENT:             'patientsCreated',
  CREATE_CASE_FROM_CALL:      'casesCreated',
  CREATE_APPOINTMENT:         'appointmentsCreated',
  SCHEDULE_FIRST_APPOINTMENT: 'appointmentsCreated',
  REGISTER_BILLING_PAYMENT:   'payments',
};


export const emptyHeadline = (): EmployeeHeadline => ({
  patientsCreated: 0, casesCreated: 0, appointmentsCreated: 0, payments: 0, voids: 0,
});

export const emptyFamilies = (): Record<ActionFamily, number> => ({
  patients: 0, cases: 0, appointments: 0, admission: 0, clinical: 0,
  charges: 0, portal: 0, externals: 0, messages: 0, catalogs: 0,
  followup: 0, ai: 0, access: 0, voids: 0, otros: 0,
});


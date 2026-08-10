import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { createClientWithCredentials } from '@precision-medical/auth';

// Back-office uses a separate Supabase project where call_logs lives
function getBackofficeClient() {
  const url = process.env.BACKOFFICE_SUPABASE_URL;
  const key = process.env.BACKOFFICE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('BACKOFFICE_SUPABASE_URL or BACKOFFICE_SUPABASE_SERVICE_ROLE_KEY not set');
  return createClientWithCredentials(url, key);
}

// ─── Métricas por empleado (productividad, data del back-office) ─────────────

/** Medianoche de un día de America/Denver, en UTC (DST-aware por fecha). */
function denverDayStart(day: string): Date {
  const probe = new Date(`${day}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'shortOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const m = /GMT([+-]\d+)/.exec(offsetPart);
  const hours = m?.[1] ? parseInt(m[1], 10) : -6;
  const hh = String(Math.abs(hours)).padStart(2, '0');
  return new Date(`${day}T00:00:00${hours <= 0 ? '-' : '+'}${hh}:00`);
}

function nextDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Acción del audit log del back-office → columna del reporte.
 *
 * Lo que NO está acá igual viaja en `byAction` (el desglose del empleado nunca
 * oculta nada). Las acciones de doctor (firmar nota, "Terminé") viven en el tab
 * Doctores, que las mide con mucho más detalle; las de paciente
 * (INTAKE_STEP_SAVE, PATIENT_SIGN_LIEN) y las de sistema (SCRIPTSURE_*) no
 * tienen actor de staff y quedan fuera solas.
 */
const ACTION_TO_METRIC: Record<string, keyof EmployeeCounters> = {
  CREATE_PATIENT:             'patientsCreated',
  CREATE_CASE_FROM_CALL:      'casesCreated',
  CREATE_APPOINTMENT:         'appointmentsCreated',
  SCHEDULE_FIRST_APPOINTMENT: 'appointmentsCreated',
  UPDATE_APPOINTMENT:         'appointmentEdits',
  CONFIRM_APPOINTMENT:        'appointmentEdits',
  CONFIRM_FIRST_APPOINTMENT:  'appointmentEdits',
  CHECK_IN:                   'checkIns',
  TRIAGE_VITALS_SAVED:        'triages',
  TRIAGE_VITALS_CORRECTED:    'triages',
  UPDATE_MEDICAL_HISTORY:     'medicalHistory',
  CREATE_LAB_ORDER:           'labs',
  ADD_LAB_ORDER:              'labs',
  UPLOAD_LAB_RESULT:          'labs',
  CHARGE_CASH_SERVICE:        'cashServices',
  DISPENSE_BRACE:             'braces',
  REGISTER_BILLING_PAYMENT:   'payments',
  CHECKOUT_APPOINTMENT:       'checkouts',
  MESSAGE_THREAD_CREATED:     'messages',
  MESSAGE_ENTRY_REPLY:        'messages',
  MESSAGE_ENTRY_NOTE:         'messages',
  // Retrabajos: no son producción, son señal de errores a corregir.
  VOID_CASH_SERVICE:          'voids',
  VOID_BRACE:                 'voids',
  VOID_LAB_ORDER:             'voids',
  DELETE_LAB_ORDER:           'voids',
  CANCEL_BILLING_PAYMENT:     'voids',
};

export interface EmployeeCounters {
  patientsCreated: number; casesCreated: number; appointmentsCreated: number;
  appointmentEdits: number; checkIns: number; triages: number;
  medicalHistory: number; labs: number; cashServices: number; braces: number;
  payments: number; checkouts: number; messages: number; voids: number;
}

export interface EmployeeActivityRow extends EmployeeCounters {
  userId: string;
  name: string;
  role: string;
  activeMinutes: number;
  callsMade: number;
  callsAnswered: number;
  callsDurationSeconds: number;
  byAction: Record<string, number>;
}

const emptyCounters = (): EmployeeCounters => ({
  patientsCreated: 0, casesCreated: 0, appointmentsCreated: 0, appointmentEdits: 0,
  checkIns: 0, triages: 0, medicalHistory: 0, labs: 0, cashServices: 0,
  braces: 0, payments: 0, checkouts: 0, messages: 0, voids: 0,
});

export interface DoctorActivityRow {
  providerId: string;
  name: string;
  specialty: string | null;
  activeMinutes: number;
  /** Consultas cerradas (doctorDoneAt o checkout) en el rango. */
  consultations: number;
  /** Cuántas de esas tienen admittedAt → entran al promedio de duración. */
  measuredConsultations: number;
  avgConsultSeconds: number;
  uniquePatients: number;
  rx: number;
  labs: number;
  braces: number;
  services: number;
}

export interface DoctorConsultation {
  id: string;
  scheduledFor: string;
  checkedInAt: string | null;
  admittedAt: string | null;
  doctorDoneAt: string | null;
  checkedOutAt: string | null;
  endedAt: string;
  status: string;
  patientName: string;
  patientCode: string | null;
  noteStatus: string | null;
  signedAt: string | null;
  rxCount: number;
  labCount: number;
  braceCount: number;
  serviceCount: number;
}

export interface ConsultationDetail {
  appointment: {
    id: string; scheduledFor: string; checkedInAt: string | null;
    admittedAt: string | null; doctorDoneAt: string | null;
    checkedOutAt: string | null; status: string;
    patientName: string; patientCode: string | null;
    providerName: string | null; caseCode: string | null;
  } | null;
  triage: {
    systolicMmhg: number | null; diastolicMmhg: number | null;
    pulseBpm: number | null; respiratoryRate: number | null;
    tempFahrenheit: number | null; o2Saturation: number | null;
    painScale: number | null; heightFt: number | null; heightIn: number | null;
    weightLbs: number | null; chiefComplaint: string | null;
    capturedByName: string | null;
  } | null;
  note: {
    status: string; signedAt: string | null; signedByName: string | null;
    diagnoses: Array<{ icd10Code: string | null; icd10Label: string | null }>;
    serviceCodes: Array<{ cptCode: string; units: number; fee: string | number | null }>;
  } | null;
  labs: Array<{ studyName: string; status: string; orderedAt: string | null; urgency: string | null }>;
  rx: Array<{ drugName: string; dose: string | null; frequency: string | null; status: string; createdAt: string }>;
  braces: Array<{ name: string; side: string | null; quantity: number; unitPrice: string | number; status: string }>;
  services: Array<{ name: string; quantity: number; unitPrice: string | number; status: string }>;
  billing: {
    totalCost: string | number; amountPaid: string | number; balanceDue: string | number;
    payments: Array<{ amount: string | number; method: string; source: string; paidAt: string | null }>;
  } | null;
}

interface EmployeeMetricsPayload {
  users: Array<{ userId: string; name: string | null; email: string; role: string }>;
  audit: Array<{ userId: string; action: string; n: number }>;
  callsById: Array<{ agentUserId: string; direction: 'INBOUND' | 'OUTBOUND'; n: number; durationSeconds: number }>;
  callsByName: Array<{ userId: string; direction: 'INBOUND' | 'OUTBOUND'; n: number; durationSeconds: number }>;
  activity: Array<{ userId: string; minutes: number }>;
}

export const metricsRouter = router({
  /**
   * Productividad por empleado — tab Empleados de Métricas.
   *
   * La agregación vive en la DB del back-office (fn `employee_metrics`,
   * packages/database/prisma/sql/20260806-employee-metrics-fn.sql): AuditLog
   * atribuido (Fase 1) + CallLog + user_activity (Fase 2). `from`/`to` son
   * DÍAS de America/Denver inclusivos.
   *
   * CallLog.agentUserId es un UUID de Supabase Auth: tras la unificación las
   * cuentas del staff viven en el proyecto ADMIN, así que el puente
   * UUID→email→users.id se hace acá — se intenta contra los DOS proyectos
   * porque en la DB del back-office quedan cuentas legadas (doctores).
   */
  employeeActivity: adminProcedure
    .input(z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const bo = getBackofficeClient();
      const { data, error } = await bo.rpc('employee_metrics', {
        p_from: denverDayStart(input.from).toISOString(),
        p_to:   denverDayStart(nextDay(input.to)).toISOString(),
      });
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      const m = data as unknown as EmployeeMetricsPayload;

      const rows = new Map<string, EmployeeActivityRow>();
      const userIdByEmail = new Map<string, string>();
      for (const u of m.users) {
        userIdByEmail.set(u.email.toLowerCase(), u.userId);
        rows.set(u.userId, {
          userId: u.userId,
          name: u.name ?? u.email,
          role: u.role,
          activeMinutes: 0, callsMade: 0, callsAnswered: 0, callsDurationSeconds: 0,
          byAction: {},
          ...emptyCounters(),
        });
      }

      for (const g of m.audit) {
        const row = rows.get(g.userId);
        if (!row) continue;
        row.byAction[g.action] = (row.byAction[g.action] ?? 0) + g.n;
        const metric = ACTION_TO_METRIC[g.action];
        if (metric) row[metric] += g.n;
      }

      // UUID de Auth → email → users.id del back-office (ambos proyectos)
      const agentIds = [...new Set(m.callsById.map((g) => g.agentUserId))];
      const phoenixIdByAgent = new Map<string, string>();
      await Promise.all(agentIds.map(async (id) => {
        for (const client of [supabaseAdmin, bo]) {
          try {
            const { data: authUser } = await client.auth.admin.getUserById(id);
            const email = authUser?.user?.email?.toLowerCase();
            const phoenixId = email ? userIdByEmail.get(email) : undefined;
            if (phoenixId) { phoenixIdByAgent.set(id, phoenixId); return; }
          } catch { /* siguiente proyecto */ }
        }
      }));

      const addCalls = (userId: string | undefined, g: { direction: string; n: number; durationSeconds: number }) => {
        const row = userId ? rows.get(userId) : undefined;
        if (!row) return;
        if (g.direction === 'OUTBOUND') row.callsMade += g.n;
        else row.callsAnswered += g.n;
        row.callsDurationSeconds += g.durationSeconds;
      };
      for (const g of m.callsById)   addCalls(phoenixIdByAgent.get(g.agentUserId), g);
      for (const g of m.callsByName) addCalls(g.userId, g);

      for (const g of m.activity) {
        const row = rows.get(g.userId);
        if (row) row.activeMinutes = g.minutes;
      }

      const totalOf = (r: EmployeeActivityRow): number =>
        r.activeMinutes + r.callsMade + r.callsAnswered +
        Object.values(r.byAction).reduce((a, b) => a + b, 0);

      const employees = [...rows.values()].sort((a, b) => {
        const ta = totalOf(a); const tb = totalOf(b);
        if (ta !== tb) return tb - ta;
        return a.name.localeCompare(b.name);
      });

      return { from: input.from, to: input.to, employees };
    }),

  /**
   * Métricas por doctor — tab Doctores de Métricas (solo ADMIN/SUPER_ADMIN).
   *
   * Agregación en la DB del back-office (fn `doctor_metrics`,
   * prisma/sql/20260807-doctor-metrics.sql). Consulta realizada = la cerró el
   * doctor ("Terminé") o el asistente (checkout); duración = admittedAt →
   * ese cierre. El tiempo de uso viene de user_activity vía providers.userId.
   */
  doctorActivity: adminProcedure
    .input(z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const bo = getBackofficeClient();
      const { data, error } = await bo.rpc('doctor_metrics', {
        p_from: denverDayStart(input.from).toISOString(),
        p_to:   denverDayStart(nextDay(input.to)).toISOString(),
      });
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      const m = data as unknown as {
        doctors: Array<{ providerId: string; userId: string | null; name: string; specialty: string | null }>;
        activity: Array<{ providerId: string; minutes: number }>;
        consultations: Array<{ providerId: string; done: number; measured: number; avgSeconds: number; uniquePatients: number }>;
        rx: Array<{ providerId: string; n: number }>;
        labs: Array<{ providerId: string; n: number }>;
        braces: Array<{ providerId: string; n: number }>;
        services: Array<{ providerId: string; n: number }>;
      };

      const rows = new Map(m.doctors.map((d) => [d.providerId, {
        providerId: d.providerId,
        name: d.name,
        specialty: d.specialty,
        activeMinutes: 0,
        consultations: 0,
        avgConsultSeconds: 0,
        measuredConsultations: 0,
        uniquePatients: 0,
        rx: 0, labs: 0, braces: 0, services: 0,
      }]));

      for (const g of m.activity) { const r = rows.get(g.providerId); if (r) r.activeMinutes = g.minutes; }
      for (const g of m.consultations) {
        const r = rows.get(g.providerId);
        if (!r) continue;
        r.consultations = g.done;
        r.measuredConsultations = g.measured;
        r.avgConsultSeconds = g.avgSeconds;
        r.uniquePatients = g.uniquePatients;
      }
      for (const g of m.rx)       { const r = rows.get(g.providerId); if (r) r.rx = g.n; }
      for (const g of m.labs)     { const r = rows.get(g.providerId); if (r) r.labs = g.n; }
      for (const g of m.braces)   { const r = rows.get(g.providerId); if (r) r.braces = g.n; }
      for (const g of m.services) { const r = rows.get(g.providerId); if (r) r.services = g.n; }

      const totalOf = (r: DoctorActivityRow): number =>
        r.activeMinutes + r.consultations + r.rx + r.labs + r.braces + r.services;
      const doctors = [...rows.values()].sort((a, b) => {
        const ta = totalOf(a); const tb = totalOf(b);
        if (ta !== tb) return tb - ta;
        return a.name.localeCompare(b.name);
      });

      return { from: input.from, to: input.to, doctors };
    }),

  /** Drill-down nivel 1: las consultas cerradas de un doctor en el rango. */
  doctorConsultations: adminProcedure
    .input(z.object({
      providerId: z.string().min(1),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const bo = getBackofficeClient();
      const { data, error } = await bo.rpc('doctor_consultations', {
        p_provider: input.providerId,
        p_from: denverDayStart(input.from).toISOString(),
        p_to:   denverDayStart(nextDay(input.to)).toISOString(),
      });
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { consultations: (data ?? []) as DoctorConsultation[] };
    }),

  /** Drill-down nivel 2: el detalle completo de una consulta (espejo del Resumen). */
  consultationDetail: adminProcedure
    .input(z.object({ appointmentId: z.string().min(1) }))
    .query(async ({ input }) => {
      const bo = getBackofficeClient();
      const { data, error } = await bo.rpc('consultation_detail', {
        p_appointment: input.appointmentId,
      });
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data as ConsultationDetail;
    }),

  listCalls: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(1000).default(500) }))
    .query(async ({ input }) => {
      try {
        const bo = getBackofficeClient();
        const { data, error } = await bo
          .from('call_logs')
          .select('id, twilioCallSid, direction, fromNumber, toNumber, outcome, durationSeconds, agentName, patientId, caseId, createdAt, patient:patients(firstName, lastName), caseData:cases(caseCode)')
          .order('createdAt', { ascending: false })
          .limit(input.limit);
        if (error) {
          console.error('[metrics.listCalls] supabase error:', error.message);
          return { calls: [], error: error.message };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const calls = (data ?? []).map((r: any) => ({
          id: r.id,
          twilioCallSid: r.twilioCallSid,
          direction: r.direction,
          fromNumber: r.fromNumber,
          toNumber: r.toNumber,
          outcome: r.outcome,
          durationSeconds: r.durationSeconds,
          agentName: r.agentName,
          patientId: r.patientId,
          caseId: r.caseId,
          createdAt: r.createdAt,
          patient: r.patient ? { firstName: r.patient.firstName, lastName: r.patient.lastName } : null,
          case: r.caseData ? { caseCode: r.caseData.caseCode } : null,
        }));
        return { calls, error: null };
      } catch (err) {
        console.error('[metrics.listCalls] error:', err);
        return { calls: [], error: String(err) };
      }
    }),

  list: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      departmentId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const month = input.month ?? new Date().toISOString().slice(0, 7);

      const { data, error } = await supabaseAdmin
        .from('metric_snapshots')
        .select('id, date, punctualityScore, taskOnTimeScore, productivityScore, qualityScore, attendanceScore, globalScore, grade, employeeId, employee:employees(id,firstName,lastName,employeeCode,position,departmentId)')
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`)
        .order('globalScore', { ascending: false });

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      const items = data ?? [];
      if (input.departmentId) {
        return items.filter(m => {
          const emp = m.employee as unknown as { departmentId?: string } | null;
          return emp?.departmentId === input.departmentId;
        });
      }
      return items;
    }),

  getByEmployee: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      limit: z.number().int().positive().max(24).default(6),
    }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('metric_snapshots')
        .select('id, date, punctualityScore, taskOnTimeScore, productivityScore, qualityScore, attendanceScore, globalScore, grade')
        .eq('employeeId', input.employeeId)
        .order('date', { ascending: false })
        .limit(input.limit);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data ?? [];
    }),

  compute: adminProcedure
    .input(z.object({
      employeeId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .mutation(async ({ input }) => {
      const startDate = `${input.month}-01`;
      const endDate = `${input.month}-31`;

      const [{ data: attendance }, { data: tasks }] = await Promise.all([
        supabaseAdmin
          .from('attendance_sync')
          .select('isLate, isAbsent, totalHours')
          .eq('employeeId', input.employeeId)
          .gte('date', startDate)
          .lte('date', endDate),
        supabaseAdmin
          .from('tasks')
          .select('status, dueDate, completedDate, qualityRating')
          .eq('assigneeId', input.employeeId)
          .gte('dueDate', startDate)
          .lte('dueDate', endDate),
      ]);

      const records = attendance ?? [];
      const taskList = tasks ?? [];

      const totalDays = records.length || 1;
      const absentDays = records.filter(r => r.isAbsent).length;
      const lateDays = records.filter(r => r.isLate).length;

      const attendanceScore = Math.min(100, ((totalDays - absentDays) / totalDays) * 100);
      const punctualityScore = Math.min(100, ((totalDays - lateDays) / totalDays) * 100);

      const completedTasks = taskList.filter(t => t.status === 'REVIEWED' || t.status === 'DELIVERED');
      const onTimeTasks = completedTasks.filter(
        t => t.completedDate && new Date(t.completedDate as string) <= new Date(t.dueDate as string),
      );
      const taskOnTimeScore = completedTasks.length > 0
        ? (onTimeTasks.length / completedTasks.length) * 100
        : 100;

      const ratedTasks = completedTasks.filter(t => t.qualityRating);
      const qualityScore = ratedTasks.length > 0
        ? (ratedTasks.reduce((s, t) => s + Number(t.qualityRating ?? 0), 0) / ratedTasks.length) * 20
        : 100;

      const productivityScore = taskList.length > 0
        ? (completedTasks.length / taskList.length) * 100
        : 100;

      const globalScore =
        attendanceScore * 0.25 +
        punctualityScore * 0.20 +
        taskOnTimeScore * 0.20 +
        qualityScore * 0.20 +
        productivityScore * 0.15;

      const grade =
        globalScore >= 95 ? 'A_PLUS' :
        globalScore >= 85 ? 'A' :
        globalScore >= 75 ? 'B' :
        globalScore >= 65 ? 'C' : 'D';

      const { data, error } = await supabaseAdmin
        .from('metric_snapshots')
        .upsert({
          employeeId: input.employeeId,
          date: startDate,
          punctualityScore: punctualityScore.toFixed(2),
          taskOnTimeScore: taskOnTimeScore.toFixed(2),
          productivityScore: productivityScore.toFixed(2),
          qualityScore: qualityScore.toFixed(2),
          attendanceScore: attendanceScore.toFixed(2),
          globalScore: globalScore.toFixed(2),
          grade,
          computedAt: new Date().toISOString(),
        }, { onConflict: 'employeeId,date' })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});

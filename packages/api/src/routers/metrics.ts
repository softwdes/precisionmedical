import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { createClientWithCredentials } from '@precision-medical/auth';
import {
  ACTION_FAMILY, NOT_STAFF_WORK, HEADLINE_ACTIONS, emptyFamilies, emptyHeadline,
  type ActionFamily, type EmployeeHeadline,
} from '@precision-medical/database';

/**
 * Se re-exportan porque se mudaron a `packages/database` —los comparte
 * `/carrera` del back-office— y `packages/api/src/index.ts` los publicaba desde
 * acá. Mover el archivo no tiene por qué mover la superficie del paquete.
 */
export type { ActionFamily, EmployeeHeadline };

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
 * Grupo de trabajo. Separa el ranking de quienes hacen cosas distintas: los
 * devs prueban módulos enteros y marcan 47 acc/h porque ESE es su trabajo, no
 * porque le ganen a recepción.
 *
 * Sale de `users.crew` del proyecto ADMIN (no de Phoenix): ahí vive el "quién
 * es quién", y los 25 usuarios de Phoenix existen todos en Admin. `null` = sin
 * asignar todavía.
 */
export type Crew = 'CLINIC' | 'DEV' | 'COMMS';

export interface EmployeeActivityRow extends EmployeeHeadline {
  userId: string;
  name: string;
  role: string;
  crew: Crew | null;
  /** Total exacto de minutos de uso: un minuto en dos módulos cuenta UNA vez. */
  activeMinutes: number;
  /** Minutos por módulo. Puede sumar más que el total — es un reparto, no una partición. */
  minutesByModule: Record<string, number>;
  callsMade: number;
  callsAnswered: number;
  callsDurationSeconds: number;
  /** SMS enviados y entregados (de otra sesión): la brecha delata números malos. */
  smsSent: number;
  smsDelivered: number;
  /** Acciones de staff del período (sin paciente, sistema ni doctor). */
  totalActions: number;
  families: Record<ActionFamily, number>;
  /** Desglose completo acción → conteo, para el detalle. */
  byAction: Record<string, number>;
}

export interface DoctorActivityRow {
  providerId: string;
  name: string;
  specialty: string | null;
  activeMinutes: number;
  /** Minutos por módulo del portal médico (Mi Día, consulta, recetas…). */
  minutesByModule: Record<string, number>;
  /** Consultas cerradas (doctorDoneAt o checkout) en el rango. */
  consultations: number;
  /** Cuántas entran al promedio: con inicio sellado y duración creíble (≤4 h). */
  measuredConsultations: number;
  avgConsultSeconds: number;
  /**
   * Consultas de más de 4 h: nadie atiende tanto, es un cierre olvidado. Fuera
   * del promedio (una sola inflaba 7 min a 70) pero visibles, porque no cerrar
   * las visitas también es algo que hay que corregir.
   */
  openEndedConsultations: number;
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
  /** SMS por usuario. Viene con el cuid de users directo — sin puente. */
  sms: Array<{ userId: string; sent: number; delivered: number }>;
  callsByName: Array<{ userId: string; direction: 'INBOUND' | 'OUTBOUND'; n: number; durationSeconds: number }>;
  activity: Array<{ userId: string; minutes: number }>;
  activityByModule: Array<{ userId: string; module: string; minutes: number }>;
  legacyMinutes: number;
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
          crew: null,
          activeMinutes: 0, minutesByModule: {},
          callsMade: 0, callsAnswered: 0, callsDurationSeconds: 0,
          smsSent: 0, smsDelivered: 0,
          totalActions: 0, families: emptyFamilies(), byAction: {},
          ...emptyHeadline(),
        });
      }

      /**
       * Grupo de trabajo, desde el proyecto ADMIN.
       *
       * Va por email y no por id porque son dos proyectos distintos: el id de
       * `users` de Phoenix no existe en Admin. El mapa `userIdByEmail` que se
       * armó arriba para las llamadas de Twilio sirve igual acá.
       *
       * Si la consulta falla, todos quedan sin grupo y el filtro muestra
       * "Todos": la métrica no se cae por no poder etiquetar.
       */
      try {
        const { data: crews } = await supabaseAdmin
          .from('users')
          .select('email, crew')
          .not('crew', 'is', null);
        for (const c of (crews ?? []) as Array<{ email: string; crew: string }>) {
          const row = rows.get(userIdByEmail.get(c.email.toLowerCase()) ?? '');
          if (row) row.crew = c.crew as Crew;
        }
      } catch { /* sin grupo: el filtro cae a "Todos" */ }

      for (const g of m.audit) {
        const row = rows.get(g.userId);
        if (!row) continue;
        row.byAction[g.action] = (row.byAction[g.action] ?? 0) + g.n;
        if (NOT_STAFF_WORK.has(g.action)) continue;
        // Sin familia conocida va a `otros`: una acción nueva entra al total
        // el día uno, sin esperar a que alguien la mapee.
        row.families[ACTION_FAMILY[g.action] ?? 'otros'] += g.n;
        row.totalActions += g.n;
        const head = HEADLINE_ACTIONS[g.action];
        if (head) row[head] += g.n;
        if ((ACTION_FAMILY[g.action] ?? 'otros') === 'voids') row.voids += g.n;
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

      // SMS: se indexa por el cuid de users directo. Las llamadas necesitan el
      // puente UUID->email->users.id porque CallLog guarda la identidad de
      // Twilio; message_logs guarda el actor resuelto, asi que no hace falta.
      for (const g of m.sms ?? []) {
        const row = rows.get(g.userId);
        if (!row) continue;
        row.smsSent      += g.sent;
        row.smsDelivered += g.delivered;
      }

      for (const g of m.activity) {
        const row = rows.get(g.userId);
        if (row) row.activeMinutes = g.minutes;
      }
      for (const g of m.activityByModule ?? []) {
        const row = rows.get(g.userId);
        if (!row) continue;
        // '' son las filas previas al registro de módulo: se agrupan como
        // 'other' para que el desglose no muestre una etiqueta vacía.
        const key = g.module || 'other';
        row.minutesByModule[key] = (row.minutesByModule[key] ?? 0) + g.minutes;
      }

      const totalOf = (r: EmployeeActivityRow): number =>
        r.activeMinutes + r.callsMade + r.callsAnswered + r.smsSent + r.totalActions;

      const employees = [...rows.values()].sort((a, b) => {
        const ta = totalOf(a); const tb = totalOf(b);
        if (ta !== tb) return tb - ta;
        return a.name.localeCompare(b.name);
      });

      return {
        from: input.from, to: input.to, employees,
        /** Minutos del rango sin módulo (antes del 2026-08-27). La UI lo avisa. */
        legacyMinutes: m.legacyMinutes ?? 0,
      };
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
        activityByModule?: Array<{ providerId: string; module: string; minutes: number }>;
        consultations: Array<{ providerId: string; done: number; measured: number; avgSeconds: number; openEnded: number; uniquePatients: number }>;
        rx: Array<{ providerId: string; n: number }>;
        labs: Array<{ providerId: string; n: number }>;
        braces: Array<{ providerId: string; n: number }>;
        services: Array<{ providerId: string; n: number }>;
      };

      const rows = new Map<string, DoctorActivityRow>(m.doctors.map((d) => [d.providerId, {
        providerId: d.providerId,
        name: d.name,
        specialty: d.specialty,
        activeMinutes: 0,
        minutesByModule: {} as Record<string, number>,
        consultations: 0,
        avgConsultSeconds: 0,
        measuredConsultations: 0,
        openEndedConsultations: 0,
        uniquePatients: 0,
        rx: 0, labs: 0, braces: 0, services: 0,
      }]));

      for (const g of m.activity) { const r = rows.get(g.providerId); if (r) r.activeMinutes = g.minutes; }
      for (const g of m.activityByModule ?? []) {
        const r = rows.get(g.providerId);
        if (!r) continue;
        const key = g.module || 'other';
        r.minutesByModule[key] = (r.minutesByModule[key] ?? 0) + g.minutes;
      }
      for (const g of m.consultations) {
        const r = rows.get(g.providerId);
        if (!r) continue;
        r.consultations = g.done;
        r.measuredConsultations = g.measured;
        r.avgConsultSeconds = g.avgSeconds;
        r.openEndedConsultations = g.openEnded;
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

  listCalls: adminProcedure
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

  list: adminProcedure
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

  getByEmployee: adminProcedure
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

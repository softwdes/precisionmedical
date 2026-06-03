import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  countryId: z.string(),
  city: z.string().optional(),
  type: z.enum(['FULL_TIME', 'PART_TIME']),
  startDate: z.coerce.date(),
  departmentId: z.string(),
  position: z.enum(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'SOFTWARE_DEVELOPER', 'CLINIC_ADMIN', 'MEDICAL_ASSISTANT', 'COMMUNICATOR', 'CLEANING_STAFF']),
  supervisorId: z.string().optional(),
  baseSalary: z.number().positive().optional(),
  baseCurrency: z.enum(['USD', 'BOB', 'PEN']).default('USD'),
  hourlyRate: z.number().positive().optional(),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CASH', 'ZELLE', 'WIRE', 'OTHER']).optional(),
  bankAccount: z.string().optional(),
  employment_type: z.enum(['exempt', 'non_exempt']).optional(),
});

export const employeesRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(200).default(25),
      search: z.string().optional(),
      countryId: z.string().optional(),
      departmentId: z.string().optional(),
      type: z.enum(['FULL_TIME', 'PART_TIME']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, search, countryId, departmentId, type, status } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('employees')
        .select('id, employeeCode, firstName, lastName, email, phone, position, type, status, baseSalary, baseCurrency, startDate, countryId, departmentId, employment_type, country:countries(code,name), department:departments(name)', { count: 'exact' })
        .is('deletedAt', null)
        .range(from, to)
        .order('createdAt', { ascending: false });

      if (search) {
        query = query.or(`firstName.ilike.%${search}%,lastName.ilike.%${search}%,email.ilike.%${search}%,employeeCode.ilike.%${search}%`);
      }
      if (countryId) query = query.eq('countryId', countryId);
      if (departmentId) query = query.eq('departmentId', departmentId);
      if (type) query = query.eq('type', type);
      if (status) query = query.eq('status', status);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      return {
        items: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('employees')
        .select('*, country:countries(code,name,currency), department:departments(name), supervisor:employees!supervisorId(id,firstName,lastName), documents:employee_documents(*)')
        .eq('id', input.id)
        .is('deletedAt', null)
        .single();

      if (error || !data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
      return data;
    }),

  create: adminProcedure
    .input(createEmployeeSchema)
    .mutation(async ({ input, ctx }) => {
      const year = new Date().getFullYear();
      const { count } = await supabaseAdmin
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .gte('createdAt', `${year}-01-01`)
        .lt('createdAt', `${year + 1}-01-01`);

      const employeeCode = `EMP-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`;

      const { data, error } = await supabaseAdmin
        .from('employees')
        .insert({
          id: randomUUID(),
          ...input,
          employeeCode,
          startDate: input.startDate.toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'employee.created',
        entityType: 'Employee',
        entityId: data.id,
        after: { ...data, bankAccount: undefined },
        createdAt: new Date().toISOString(),
      });

      return data;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      data: createEmployeeSchema.partial().extend({
        // Allow legacy free-text positions stored before the enum was enforced
        position: z.string().min(1).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const { data: before } = await supabaseAdmin.from('employees').select('*').eq('id', input.id).single();
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const { data, error } = await supabaseAdmin
        .from('employees')
        .update({ ...input.data, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'employee.updated',
        entityType: 'Employee',
        entityId: input.id,
        before: { ...before, bankAccount: undefined },
        after: { ...data, bankAccount: undefined },
        createdAt: new Date().toISOString(),
      });

      return data;
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('employees')
        .update({ status: 'INACTIVE', deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'employee.deactivated',
        entityType: 'Employee',
        entityId: input.id,
        createdAt: new Date().toISOString(),
      });

      return data;
    }),

  listActivity: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ input }) => {
      const { data } = await supabaseAdmin
        .from('audit_logs')
        .select('id, action, before, after, createdAt, actorUser:users!actorUserId(firstName, lastName)')
        .eq('entityType', 'Employee')
        .eq('entityId', input.employeeId)
        .order('createdAt', { ascending: false })
        .limit(30);
      return data ?? [];
    }),

  getSummary: protectedProcedure.query(async () => {
    const [{ count: total }, { data: byType }] = await Promise.all([
      supabaseAdmin.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').is('deletedAt', null),
      supabaseAdmin.from('employees').select('type').eq('status', 'ACTIVE').is('deletedAt', null),
    ]);

    const typeCounts = (byType ?? []).reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {});

    return { total: total ?? 0, byType: typeCounts };
  }),

  // Used by the user-creation dialog to populate the "From employee"
  // dropdown. Filters to active employees that don't yet have a linked
  // user (userId IS NULL) AND whose email doesn't already exist in
  // public.users (to avoid the second condition triggering a CONFLICT
  // at insert time).
  availableForUser: adminProcedure.query(async () => {
    const { data: emps, error } = await supabaseAdmin
      .from('employees')
      .select('id, firstName, lastName, email, phone, employeeCode')
      .eq('status', 'ACTIVE')
      .is('deletedAt', null)
      .is('userId', null)
      .order('firstName', { ascending: true });

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    const rows = emps ?? [];
    if (rows.length === 0) return [];

    // Filter out emails already taken by an existing (non-deleted) user
    const emails = [...new Set(rows.map(e => e.email as string))];
    const { data: existingUsers } = await supabaseAdmin
      .from('users')
      .select('email')
      .in('email', emails)
      .is('deletedAt', null);

    const takenEmails = new Set((existingUsers ?? []).map(u => u.email as string));
    return rows.filter(e => !takenEmails.has(e.email as string));
  }),

  // ─── REPORTE CONSOLIDADO DE PAGOS DE SALARIOS ─────────────────────────────
  // Agrega pagos PAID en un rango con filtros opcionales. Igual patron que
  // freelancers.getReport: separado por moneda, sin mezclar.
  getReport: protectedProcedure
    .input(z.object({
      from:         z.string(), // YYYY-MM-DD
      to:           z.string(), // YYYY-MM-DD
      departmentId: z.string().optional(),
      country:      z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { from, to, departmentId, country } = input;

      // 1) Pagos PAID en rango con datos del empleado + departamento + pais
      let q = supabaseAdmin
        .from('payments')
        .select(
          'id, period, amountLocal, base_salary, bonus_amount, bonus_reason, currencyLocal, ' +
          'status, paidDate, scheduledDate, ' +
          'employee:employees!inner(id, firstName, lastName, employeeCode, departmentId, countryId, ' +
          '  department:departments(id, name), country:countries(id, code, name))',
        )
        .eq('status', 'PAID')
        .gte('paidDate', from)
        .lte('paidDate', to)
        .gt('amountLocal', 0); // exclude reversal records

      if (departmentId) q = q.eq('employee.departmentId', departmentId);
      if (country)      q = q.eq('employee.country.code', country);

      const { data: paymentsRaw, error } = await q;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      type Row = {
        id: string;
        period: string;
        amountLocal: number | string;
        base_salary: number | string | null;
        bonus_amount: number | string | null;
        bonus_reason: string | null;
        currencyLocal: 'USD' | 'BOB' | 'PEN';
        status: string;
        paidDate: string | null;
        scheduledDate: string | null;
        employee: {
          id: string;
          firstName: string;
          lastName: string;
          employeeCode: string;
          departmentId: string | null;
          countryId: string | null;
          department: { id: string; name: string } | null;
          country: { id: string; code: string; name: string } | null;
        };
      };

      const payments = (paymentsRaw ?? []) as unknown as Row[];

      // 2) KPIs por moneda
      type CurrencyBucket = { total: number; bonuses: number; count: number; employeeIds: Set<string> };
      const byCurrencyMap: Record<string, CurrencyBucket> = {};
      for (const p of payments) {
        const c = p.currencyLocal;
        if (!byCurrencyMap[c]) byCurrencyMap[c] = { total: 0, bonuses: 0, count: 0, employeeIds: new Set() };
        byCurrencyMap[c]!.total   += Number(p.amountLocal);
        byCurrencyMap[c]!.bonuses += Number(p.bonus_amount ?? 0);
        byCurrencyMap[c]!.count   += 1;
        if (p.employee?.id) byCurrencyMap[c]!.employeeIds.add(p.employee.id);
      }
      const kpisByCurrency = Object.entries(byCurrencyMap).map(([currency, b]) => ({
        currency,
        total:         b.total,
        bonuses:       b.bonuses,
        count:         b.count,
        employeeCount: b.employeeIds.size,
        average:       b.count > 0 ? b.total / b.count : 0,
      }));

      // 3) Tendencia mensual ultimos 12 meses (separado del rango) por moneda
      const trendStart = new Date();
      trendStart.setUTCDate(1);
      trendStart.setUTCMonth(trendStart.getUTCMonth() - 11);
      const trendStartIso = trendStart.toISOString().split('T')[0]!;

      const { data: trendRaw } = await supabaseAdmin
        .from('payments')
        .select('amountLocal, currencyLocal, paidDate')
        .eq('status', 'PAID')
        .gte('paidDate', trendStartIso)
        .gt('amountLocal', 0);

      const monthlyTrendMap: Record<string, Record<string, number>> = {};
      for (const p of (trendRaw ?? []) as Array<{ amountLocal: number | string; currencyLocal: string; paidDate: string }>) {
        const ym = (p.paidDate ?? '').slice(0, 7);
        if (!ym) continue;
        if (!monthlyTrendMap[ym]) monthlyTrendMap[ym] = {};
        monthlyTrendMap[ym]![p.currencyLocal] = (monthlyTrendMap[ym]![p.currencyLocal] ?? 0) + Number(p.amountLocal);
      }
      const monthlyTrend: Array<{ month: string; USD: number; BOB: number; PEN: number }> = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(trendStart);
        d.setUTCMonth(d.getUTCMonth() + i);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const bucket = monthlyTrendMap[ym] ?? {};
        monthlyTrend.push({
          month: ym,
          USD: Number(bucket.USD ?? 0),
          BOB: Number(bucket.BOB ?? 0),
          PEN: Number(bucket.PEN ?? 0),
        });
      }

      // 4) Por pais (separado por moneda)
      const byCountryMap: Record<string, Record<string, number>> = {};
      for (const p of payments) {
        const key = p.employee?.country?.name ?? '—';
        if (!byCountryMap[key]) byCountryMap[key] = {};
        byCountryMap[key]![p.currencyLocal] = (byCountryMap[key]![p.currencyLocal] ?? 0) + Number(p.amountLocal);
      }
      const byCountry = Object.entries(byCountryMap).map(([name, totals]) => ({ country: name, totals }));

      // 5) Por departamento (separado por moneda)
      const byDeptMap: Record<string, { name: string; totals: Record<string, number>; count: number }> = {};
      for (const p of payments) {
        const id   = p.employee?.departmentId ?? 'none';
        const name = p.employee?.department?.name ?? '—';
        if (!byDeptMap[id]) byDeptMap[id] = { name, totals: {}, count: 0 };
        byDeptMap[id]!.totals[p.currencyLocal] = (byDeptMap[id]!.totals[p.currencyLocal] ?? 0) + Number(p.amountLocal);
        byDeptMap[id]!.count += 1;
      }
      const byDepartment = Object.values(byDeptMap);

      // 6) Tabla de bonos del periodo (filtrada a los que tienen bono)
      const bonuses = payments
        .filter(p => Number(p.bonus_amount ?? 0) > 0)
        .map(p => ({
          id:           p.id,
          employeeId:   p.employee?.id ?? '',
          employeeName: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : '—',
          amount:       Number(p.bonus_amount ?? 0),
          currency:     p.currencyLocal,
          reason:       p.bonus_reason ?? '—',
          paidDate:     p.paidDate,
        }));

      // 7) Tabla completa de pagos del periodo (TODOS los pagos PAID en el rango)
      // Ordenada por fecha de pago descendente (mas reciente primero).
      const paymentsTable = payments
        .slice()
        .sort((a, b) => {
          const da = a.paidDate ?? '';
          const db = b.paidDate ?? '';
          return db.localeCompare(da);
        })
        .map(p => ({
          id:           p.id,
          employeeId:   p.employee?.id ?? '',
          employeeName: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : '—',
          employeeCode: p.employee?.employeeCode ?? '',
          department:   p.employee?.department?.name ?? '—',
          country:      p.employee?.country?.name ?? '—',
          period:       p.period,
          base:         Number(p.base_salary ?? p.amountLocal ?? 0),
          bonus:        Number(p.bonus_amount ?? 0),
          bonusReason:  p.bonus_reason,
          total:        Number(p.amountLocal),
          currency:     p.currencyLocal,
          paidDate:     p.paidDate,
        }));

      return {
        range: { from, to },
        kpisByCurrency,
        monthlyTrend,
        byCountry,
        byDepartment,
        bonuses,
        paymentsTable,
        totalPayments: payments.length,
      };
    }),
});

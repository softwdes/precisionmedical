import { z } from 'zod';
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
  type: z.enum(['FULL_TIME', 'EXTERNAL', 'CONTRACTOR']),
  startDate: z.coerce.date(),
  departmentId: z.string(),
  position: z.string().min(1).max(100),
  supervisorId: z.string().optional(),
  baseSalary: z.number().positive().optional(),
  baseCurrency: z.enum(['USD', 'BOB', 'PEN']).default('USD'),
  hourlyRate: z.number().positive().optional(),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CASH', 'ZELLE', 'WIRE', 'OTHER']).optional(),
  bankAccount: z.string().optional(),
});

export const employeesRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
      search: z.string().optional(),
      countryId: z.string().optional(),
      departmentId: z.string().optional(),
      type: z.enum(['FULL_TIME', 'EXTERNAL', 'CONTRACTOR']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, search, countryId, departmentId, type, status } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('employees')
        .select('id, employeeCode, firstName, lastName, email, phone, position, type, status, baseSalary, baseCurrency, startDate, countryId, departmentId, country:countries(code,name), department:departments(name)', { count: 'exact' })
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
          ...input,
          employeeCode,
          startDate: input.startDate.toISOString(),
          createdAt: new Date().toISOString(),
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
    .input(z.object({ id: z.string(), data: createEmployeeSchema.partial() }))
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
});

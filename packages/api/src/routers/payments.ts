import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const createPaymentSchema = z.object({
  employeeId: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
  amountLocal: z.number().positive(),
  currencyLocal: z.enum(['USD', 'BOB', 'PEN']).default('USD'),
  scheduledDate: z.coerce.date(),
  notes: z.string().optional(),
  walletId: z.string().optional(),
});

export const paymentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
      employeeId: z.string().optional(),
      period: z.string().optional(),
      status: z.enum(['PENDING', 'SCHEDULED', 'PAID', 'PARTIAL', 'CANCELLED', 'REVERSED']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, employeeId, period, status } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('payments')
        .select('id, period, amountLocal, currencyLocal, status, scheduledDate, paidDate, notes, employeeId, walletId, reversedById, employee:employees(id,firstName,lastName,employeeCode)', { count: 'exact' })
        .range(from, to)
        .order('createdAt', { ascending: false });

      if (employeeId) query = query.eq('employeeId', employeeId);
      if (period) query = query.eq('period', period);
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

  create: adminProcedure
    .input(createPaymentSchema)
    .mutation(async ({ input }) => {
      const insertData: Record<string, unknown> = {
        employeeId: input.employeeId,
        period: input.period,
        amountLocal: input.amountLocal,
        currencyLocal: input.currencyLocal,
        amountUsdEquiv: input.amountLocal,
        rateApplied: 1,
        scheduledDate: input.scheduledDate.toISOString(),
        status: 'PENDING',
        notes: input.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (input.walletId) insertData.walletId = input.walletId;

      const { data, error } = await supabaseAdmin
        .from('payments')
        .insert(insertData)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  markAsPaid: adminProcedure
    .input(z.object({
      id: z.string(),
      paidDate: z.coerce.date().optional(),
      proofUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('payments')
        .update({
          status: 'PAID',
          paidDate: (input.paidDate ?? new Date()).toISOString(),
          proofUrl: input.proofUrl,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  reverse: adminProcedure
    .input(z.object({ id: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { data: original } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('id', input.id)
        .single();

      if (!original) throw new TRPCError({ code: 'NOT_FOUND' });

      const reversalData: Record<string, unknown> = {
        employeeId: original.employeeId,
        period: original.period,
        amountLocal: -Math.abs(Number(original.amountLocal)),
        currencyLocal: original.currencyLocal,
        amountUsdEquiv: -Math.abs(Number(original.amountLocal)),
        rateApplied: 1,
        status: 'PAID',
        scheduledDate: new Date().toISOString(),
        paidDate: new Date().toISOString(),
        notes: `REVERSAL: ${input.reason}`,
        reversedById: input.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (original.walletId) reversalData.walletId = original.walletId;

      const { data: reversal, error } = await supabaseAdmin
        .from('payments')
        .insert(reversalData)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin
        .from('payments')
        .update({ status: 'REVERSED', updatedAt: new Date().toISOString() })
        .eq('id', input.id);

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'payment.reversed',
        entityType: 'Payment',
        entityId: input.id,
        after: { reversalId: reversal.id, reason: input.reason },
        createdAt: new Date().toISOString(),
      });

      return reversal;
    }),

  getSummary: protectedProcedure
    .input(z.object({ period: z.string().optional() }))
    .query(async ({ input }) => {
      const period = input.period ?? new Date().toISOString().slice(0, 7);

      const { data } = await supabaseAdmin
        .from('payments')
        .select('amountLocal, status, currencyLocal')
        .eq('period', period);

      const items = data ?? [];
      const totalPaid = items.filter(p => p.status === 'PAID').reduce((s, p) => s + Number(p.amountLocal), 0);
      const totalPending = items.filter(p => p.status === 'PENDING').reduce((s, p) => s + Number(p.amountLocal), 0);
      const count = items.length;

      return { period, totalPaid, totalPending, count };
    }),
});

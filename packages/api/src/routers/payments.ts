import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const createPaymentSchema = z.object({
  employeeId: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
  baseSalary: z.number().positive(),
  bonusAmount: z.number().positive().optional(),
  bonusReason: z.string().min(3).optional(),
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

      // Sort order request: PENDING first (by scheduledDate ASC — soonest
      // due first), then PAID (by paidDate DESC — newest first), then any
      // other status by createdAt DESC. Postgres ORDER BY can't express
      // this in PostgREST's .order() chain cleanly, so we fetch up to a
      // safety cap and sort + paginate in JS. The cap is well above
      // realistic dataset size for a clinic team (a couple years of
      // monthly payroll for ~50 employees ≈ 1200 rows).
      let query = supabaseAdmin
        .from('payments')
        .select(
          'id, period, amountLocal, base_salary, bonus_amount, bonus_reason, currencyLocal, status, scheduledDate, paidDate, createdAt, notes, employeeId, walletId, reversedById, employee:employees(id,firstName,lastName,employeeCode,bankQrUrl)',
          { count: 'exact' },
        )
        .order('createdAt', { ascending: false })
        .range(0, 1999);

      if (employeeId) query = query.eq('employeeId', employeeId);
      if (period) query = query.eq('period', period);
      if (status) query = query.eq('status', status);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      // Status priority: lower number → higher in the list.
      const statusPriority = (s: string): number => {
        if (s === 'PENDING') return 0;
        if (s === 'PAID') return 1;
        return 2;
      };
      const ts = (s: string | null): number => (s ? new Date(s).getTime() : 0);

      const sorted = [...(data ?? [])].sort((a, b) => {
        const pa = statusPriority(a.status as string);
        const pb = statusPriority(b.status as string);
        if (pa !== pb) return pa - pb;

        // Tie-break by status-specific date.
        if (a.status === 'PENDING') {
          // Soonest due first: ASC. Treat nulls as far-future.
          const dA = a.scheduledDate ? ts(a.scheduledDate as string) : Number.MAX_SAFE_INTEGER;
          const dB = b.scheduledDate ? ts(b.scheduledDate as string) : Number.MAX_SAFE_INTEGER;
          return dA - dB;
        }
        if (a.status === 'PAID') {
          // Most recently paid first: DESC. Nulls last.
          return ts(b.paidDate as string | null) - ts(a.paidDate as string | null);
        }
        // Other statuses (CANCELLED, REVERSED, SCHEDULED, PARTIAL):
        // most recently created first.
        return ts(b.createdAt as string) - ts(a.createdAt as string);
      });

      // Paginate AFTER sorting so PENDING really stays on page 1.
      const from = (page - 1) * pageSize;
      const items = sorted.slice(from, from + pageSize);

      return {
        items,
        total: count ?? sorted.length,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? sorted.length) / pageSize),
      };
    }),

  create: adminProcedure
    .input(createPaymentSchema)
    .mutation(async ({ input }) => {
      // Resolve wallet: use provided walletId or look up by currency
      let walletId = input.walletId;
      if (!walletId) {
        const { data: wallet } = await supabaseAdmin
          .from('wallets')
          .select('id')
          .eq('currency', input.currencyLocal)
          .single();
        if (!wallet) throw new TRPCError({ code: 'NOT_FOUND', message: `No wallet found for currency ${input.currencyLocal}` });
        walletId = wallet.id;
      }

      const amountLocal = input.baseSalary + (input.bonusAmount ?? 0);

      const { data, error } = await supabaseAdmin
        .from('payments')
        .insert({
          id: randomUUID(),
          employeeId: input.employeeId,
          walletId,
          period: input.period,
          amountLocal,
          base_salary: input.baseSalary,
          bonus_amount: input.bonusAmount ?? null,
          bonus_reason: input.bonusReason ?? null,
          currencyLocal: input.currencyLocal,
          amountUsdEquiv: amountLocal,
          rateApplied: 1,
          scheduledDate: input.scheduledDate.toISOString(),
          status: 'PENDING',
          notes: input.notes,
          updatedAt: new Date().toISOString(),
        } as never)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      baseSalary: z.number().positive(),
      bonusAmount: z.number().positive().optional(),
      bonusReason: z.string().min(3).optional(),
      scheduledDate: z.coerce.date(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data: existing } = await supabaseAdmin
        .from('payments')
        .select('id, status')
        .eq('id', input.id)
        .single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.status !== 'PENDING') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only PENDING payments can be edited' });

      const amountLocal = input.baseSalary + (input.bonusAmount ?? 0);

      const { data, error } = await supabaseAdmin
        .from('payments')
        .update({
          base_salary: input.baseSalary,
          bonus_amount: input.bonusAmount ?? null,
          bonus_reason: input.bonusReason ?? null,
          amountLocal,
          amountUsdEquiv: amountLocal,
          scheduledDate: input.scheduledDate.toISOString(),
          notes: input.notes ?? null,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data: existing } = await supabaseAdmin
        .from('payments')
        .select('id, status')
        .eq('id', input.id)
        .single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.status !== 'PENDING') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only PENDING payments can be cancelled' });

      const { data, error } = await supabaseAdmin
        .from('payments')
        .update({ status: 'CANCELLED', updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  /**
   * Hard-deletes a CANCELLED payment. For payments that were created
   * by mistake and then cancelled — admins want to wipe them so they
   * don't clutter the list/filters. Guarded to CANCELLED only so we
   * can't accidentally lose audit history of PAID/REVERSED rows.
   */
  deleteCancelled: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data: existing } = await supabaseAdmin
        .from('payments')
        .select('id, status')
        .eq('id', input.id)
        .single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.status !== 'CANCELLED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only CANCELLED payments can be deleted',
        });
      }

      const { error } = await supabaseAdmin
        .from('payments')
        .delete()
        .eq('id', input.id);

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { success: true };
    }),

  deletePair: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data: original } = await supabaseAdmin
        .from('payments')
        .select('id, status')
        .eq('id', input.id)
        .single();

      if (!original) throw new TRPCError({ code: 'NOT_FOUND' });
      if (original.status !== 'REVERSED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only REVERSED payments can be deleted' });

      // Find the reversal record that points to this payment
      const { data: reversal } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('reversedById', input.id)
        .single();

      // Delete reversal record first (it references the original)
      if (reversal) {
        await supabaseAdmin.from('payments').delete().eq('id', reversal.id);
      }

      const { error } = await supabaseAdmin
        .from('payments')
        .delete()
        .eq('id', input.id);

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { deleted: true };
    }),

  markAsPaid: adminProcedure
    .input(z.object({
      id: z.string(),
      paidDate: z.coerce.date().optional(),
      proofUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      // Lee el pago primero para self-heal: si amountLocal != base + bono (por datos
      // historicos inconsistentes), aprovechamos esta mutation para recalcularlo.
      const { data: existing } = await supabaseAdmin
        .from('payments')
        .select('base_salary, bonus_amount, amountLocal')
        .eq('id', input.id)
        .single();

      const updatePayload: Record<string, unknown> = {
        status:    'PAID',
        paidDate:  (input.paidDate ?? new Date()).toISOString(),
        proofUrl:  input.proofUrl,
        updatedAt: new Date().toISOString(),
      };

      if (existing && existing.base_salary != null) {
        const correctTotal = Number(existing.base_salary) + Number(existing.bonus_amount ?? 0);
        const currentTotal = Number(existing.amountLocal);
        if (Math.abs(correctTotal - Math.abs(currentTotal)) > 0.01) {
          // Self-heal: amountLocal estaba desactualizado, lo arreglamos al marcar como pagado
          const signedTotal = currentTotal < 0 ? -correctTotal : correctTotal;
          updatePayload.amountLocal    = signedTotal;
          updatePayload.amountUsdEquiv = signedTotal;
        }
      }

      const { data, error } = await supabaseAdmin
        .from('payments')
        .update(updatePayload)
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

      if (!original.walletId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Original payment has no wallet assigned' });

      const reversalData = {
        id: randomUUID(),
        employeeId: original.employeeId,
        walletId: original.walletId,
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
        updatedAt: new Date().toISOString(),
      };

      const { data: reversal, error } = await supabaseAdmin
        .from('payments')
        .insert(reversalData as never)
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
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const period = input.period ?? prevMonth.toISOString().slice(0, 7);

      const [paidResult, pendingResult, countResult] = await Promise.all([
        // Paid this month only (period-filtered, excludes reversals)
        supabaseAdmin
          .from('payments')
          .select('amountLocal')
          .eq('period', period)
          .eq('status', 'PAID')
          .gt('amountLocal', 0),
        // All pending payments across all periods
        supabaseAdmin
          .from('payments')
          .select('amountLocal')
          .eq('status', 'PENDING'),
        // Total count of all real payments (excludes reversal records)
        supabaseAdmin
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .gt('amountLocal', 0),
      ]);

      const totalPaid = (paidResult.data ?? []).reduce((s, p) => s + Number(p.amountLocal), 0);
      const totalPending = (pendingResult.data ?? []).reduce((s, p) => s + Number(p.amountLocal), 0);
      const count = countResult.count ?? 0;

      return { period, totalPaid, totalPending, count };
    }),
});

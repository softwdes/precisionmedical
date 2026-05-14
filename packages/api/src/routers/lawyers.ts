import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const LAWYER_SELECT = 'id, entityType, firstName, lastName, firmName, parentFirmId, email, phone, address, status, createdAt';

export const lawyersRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      search: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'TERMINATED']).optional(),
      entityType: z.enum(['FIRM', 'INDEPENDENT', 'FIRM_MEMBER']).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { page = 1, pageSize = 25, search, status, entityType } = input ?? {};
      const from = (page - 1) * pageSize;

      let q = supabaseAdmin.from('lawyers').select(LAWYER_SELECT, { count: 'exact' });
      if (search) q = q.or(`firstName.ilike.%${search}%,lastName.ilike.%${search}%,firmName.ilike.%${search}%,email.ilike.%${search}%`);
      if (status) q = q.eq('status', status);
      if (entityType) q = q.eq('entityType', entityType);

      const { data, error, count } = await q.order('createdAt', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { items: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('lawyers')
        .select(`${LAWYER_SELECT}, commissionConfig:commission_configs(id, scheme, flatAmount, percentage, effectiveFrom, effectiveTo)`)
        .eq('id', input.id)
        .single();
      if (error) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lawyer not found' });
      return data;
    }),

  create: adminProcedure
    .input(z.object({
      entityType: z.enum(['FIRM', 'INDEPENDENT', 'FIRM_MEMBER']),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      firmName: z.string().optional(),
      parentFirmId: z.string().optional(),
      email: z.string().email(),
      phone: z.string().optional(),
      address: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('lawyers')
        .insert({ ...input, status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .select(LAWYER_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      firmName: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'TERMINATED']).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      const { data, error } = await supabaseAdmin
        .from('lawyers')
        .update({ ...patch, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select(LAWYER_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  saveCommissionConfig: adminProcedure
    .input(z.object({
      lawyerId: z.string(),
      scheme: z.enum(['FLAT_PER_REFERRAL', 'PERCENTAGE_OF_BILLING', 'VOLUME_TIER', 'HYBRID']),
      flatAmount: z.number().optional(),
      percentage: z.number().min(0).max(100).optional(),
      effectiveFrom: z.string(),
      effectiveTo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { lawyerId, ...rest } = input;
      const { data, error } = await supabaseAdmin
        .from('commission_configs')
        .upsert(
          { lawyerId, ...rest, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { onConflict: 'lawyerId' },
        )
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const PROVIDER_SELECT = 'id, firstName, lastName, email, phone, specialty, licenseNumber, status, createdAt';

export const providersRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      search: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'TERMINATED']).optional(),
      specialty: z.enum(['RADIOLOGY', 'NEUROLOGY', 'ORTHOPEDICS', 'PHYSICAL_THERAPY', 'CHIROPRACTIC', 'PAIN_MANAGEMENT', 'PSYCHOLOGY', 'GENERAL', 'OTHER']).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { page = 1, pageSize = 25, search, status, specialty } = input ?? {};
      const from = (page - 1) * pageSize;

      let q = supabaseAdmin.from('providers').select(PROVIDER_SELECT, { count: 'exact' });
      if (search) q = q.or(`firstName.ilike.%${search}%,lastName.ilike.%${search}%,email.ilike.%${search}%`);
      if (status) q = q.eq('status', status);
      if (specialty) q = q.eq('specialty', specialty);

      const { data, error, count } = await q.order('createdAt', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { items: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('providers')
        .select(`${PROVIDER_SELECT}, tariffs:service_tariffs(id, serviceName, amount, currency)`)
        .eq('id', input.id)
        .single();
      if (error) throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
      return data;
    }),

  create: adminProcedure
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      specialty: z.enum(['RADIOLOGY', 'NEUROLOGY', 'ORTHOPEDICS', 'PHYSICAL_THERAPY', 'CHIROPRACTIC', 'PAIN_MANAGEMENT', 'PSYCHOLOGY', 'GENERAL', 'OTHER']),
      licenseNumber: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('providers')
        .insert({ ...input, status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .select(PROVIDER_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      phone: z.string().optional(),
      licenseNumber: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'TERMINATED']).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      const { data, error } = await supabaseAdmin
        .from('providers')
        .update({ ...patch, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select(PROVIDER_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  addTariff: adminProcedure
    .input(z.object({
      providerId: z.string(),
      serviceName: z.string().min(1),
      amount: z.number().min(0),
      currency: z.enum(['USD', 'BOB', 'PEN']),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('service_tariffs')
        .insert({ ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  removeTariff: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabaseAdmin.from('service_tariffs').delete().eq('id', input.id);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { success: true };
    }),
});

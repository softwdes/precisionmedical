import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const APPT_SELECT = 'id, patientId, clinicId, providerId, scheduledFor, durationMinutes, type, status, notes, createdAt, patient:patients(id, patientCode, firstName, lastName), clinic:clinics(id, name), provider:providers(id, firstName, lastName, specialty)';

export const appointmentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      patientId: z.string().optional(),
      clinicId: z.string().optional(),
      status: z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PENDING']).optional(),
      type: z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP', 'CONSULTATION']).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { page = 1, pageSize = 25, patientId, clinicId, status, type, dateFrom, dateTo } = input ?? {};
      const from = (page - 1) * pageSize;

      let q = supabaseAdmin.from('appointments').select(APPT_SELECT, { count: 'exact' });
      if (patientId) q = q.eq('patientId', patientId);
      if (clinicId) q = q.eq('clinicId', clinicId);
      if (status) q = q.eq('status', status);
      if (type) q = q.eq('type', type);
      if (dateFrom) q = q.gte('scheduledFor', dateFrom);
      if (dateTo) q = q.lte('scheduledFor', dateTo);

      const { data, error, count } = await q.order('scheduledFor', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { items: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  listClinics: protectedProcedure.query(async () => {
    const { data, error } = await supabaseAdmin.from('clinics').select('id, name, address, phone').order('name');
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data ?? [];
  }),

  create: adminProcedure
    .input(z.object({
      patientId: z.string(),
      clinicId: z.string(),
      providerId: z.string().optional(),
      scheduledFor: z.string(),
      durationMinutes: z.number().int().min(15).default(30),
      type: z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP', 'CONSULTATION']),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('appointments')
        .insert({
          ...input,
          scheduledFor: new Date(input.scheduledFor).toISOString(),
          status: 'SCHEDULED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select(APPT_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PENDING']),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('appointments')
        .update({ status: input.status, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});

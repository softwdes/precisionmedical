import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const PATIENT_SELECT = 'id, patientCode, firstName, lastName, email, phone, dateOfBirth, accidentDate, accidentType, insuranceCarrier, policyNumber, lawyerReferrerId, providerReferrerId, status, createdAt, lawyerReferrer:lawyers!patients_lawyerReferrerId_fkey(id, firstName, lastName, firmName), providerReferrer:providers!patients_providerReferrerId_fkey(id, firstName, lastName)';

export const patientsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      search: z.string().optional(),
      status: z.enum(['NEW', 'ACTIVE', 'COMPLETED', 'DISCHARGED', 'INACTIVE']).optional(),
      lawyerId: z.string().optional(),
      providerId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { page = 1, pageSize = 25, search, status, lawyerId, providerId } = input ?? {};
      const from = (page - 1) * pageSize;

      let q = supabaseAdmin
        .from('patients')
        .select(PATIENT_SELECT, { count: 'exact' });

      if (search) q = q.or(`firstName.ilike.%${search}%,lastName.ilike.%${search}%,patientCode.ilike.%${search}%`);
      if (status) q = q.eq('status', status);
      if (lawyerId) q = q.eq('lawyerReferrerId', lawyerId);
      if (providerId) q = q.eq('providerReferrerId', providerId);

      const { data, error, count } = await q.order('createdAt', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { items: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('patients')
        .select(`${PATIENT_SELECT}, appointments(id, scheduledFor, type, status, clinic:clinics(name), provider:providers(firstName, lastName)), commissions(id, amount, currency, status, earnedAt, paidAt)`)
        .eq('id', input.id)
        .single();
      if (error) throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      return data;
    }),

  create: adminProcedure
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      dateOfBirth: z.string().optional(),
      accidentDate: z.string().optional(),
      accidentType: z.enum(['AUTO', 'MOTORCYCLE', 'PEDESTRIAN', 'WORKPLACE', 'OTHER']).optional(),
      insuranceCarrier: z.string().optional(),
      policyNumber: z.string().optional(),
      lawyerReferrerId: z.string().optional(),
      providerReferrerId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const patientCode = `PAT-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabaseAdmin
        .from('patients')
        .insert({
          ...input,
          patientCode,
          status: 'NEW',
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth).toISOString() : null,
          accidentDate: input.accidentDate ? new Date(input.accidentDate).toISOString() : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select('id, patientCode, firstName, lastName, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['NEW', 'ACTIVE', 'COMPLETED', 'DISCHARGED', 'INACTIVE']),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('patients')
        .update({ status: input.status, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});

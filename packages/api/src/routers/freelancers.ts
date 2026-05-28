import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const createFreelancerSchema = z.object({
  nombre:     z.string().min(2).max(150),
  email:      z.string().email().optional().or(z.literal('')),
  phone:      z.string().optional(),
  pais:       z.string().min(1),
  modalidad:  z.enum(['POR_HORA', 'POR_SERVICIO', 'CONTRATISTA']),
  tarifaBase: z.number().positive().optional(),
  moneda:     z.enum(['USD', 'BOB', 'PEN']).default('USD'),
  notas:      z.string().optional(),
});

const createPaymentSchema = z.object({
  freelancerId:  z.string(),
  descripcion:   z.string().min(3),
  horas:         z.number().positive().optional(),
  tarifaHora:    z.number().positive().optional(),
  monto:         z.number().positive(),
  moneda:        z.enum(['USD', 'BOB', 'PEN']),
  fechaServicio: z.coerce.date(),
  fechaPago:     z.coerce.date(),
  notas:         z.string().optional(),
});

export const freelancersRouter = router({
  list: protectedProcedure
    .input(z.object({
      page:      z.number().int().positive().default(1),
      pageSize:  z.number().int().positive().max(100).default(25),
      search:    z.string().optional(),
      modalidad: z.enum(['POR_HORA', 'POR_SERVICIO', 'CONTRATISTA']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, search, modalidad } = input;
      const from = (page - 1) * pageSize;
      const to   = from + pageSize - 1;

      let query = supabaseAdmin
        .from('freelancers')
        .select('*, freelancer_payments(id, monto, moneda, fechaPago)', { count: 'exact' })
        .is('deletedAt', null)
        .range(from, to)
        .order('createdAt', { ascending: false });

      if (search)    query = query.ilike('nombre', `%${search}%`);
      if (modalidad) query = query.eq('modalidad', modalidad);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      return {
        items:      data ?? [],
        total:      count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  getSummary: protectedProcedure.query(async () => {
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]!;

    const [{ count: totalActivos }, { data: monthPayments }, { count: totalPagos }] = await Promise.all([
      supabaseAdmin.from('freelancers').select('id', { count: 'exact', head: true }).is('deletedAt', null).eq('status', 'ACTIVE'),
      supabaseAdmin.from('freelancer_payments').select('monto').gte('fechaPago', monthStart).lte('fechaPago', monthEnd),
      supabaseAdmin.from('freelancer_payments').select('id', { count: 'exact', head: true }),
    ]);

    const totalPagadoMes = (monthPayments ?? []).reduce((s, p) => s + Number(p.monto), 0);

    return { totalActivos: totalActivos ?? 0, totalPagadoMes, totalPagos: totalPagos ?? 0 };
  }),

  create: adminProcedure
    .input(createFreelancerSchema)
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancers')
        .insert({
          id:        randomUUID(),
          ...input,
          email:     input.email || null,
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.created',
        entityType:  'Freelancer',
        entityId:    data.id,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  update: adminProcedure
    .input(z.object({ id: z.string(), data: createFreelancerSchema.partial() }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancers')
        .update({ ...input.data, email: input.data.email || null, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.updated',
        entityType:  'Freelancer',
        entityId:    input.id,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancers')
        .update({ status: 'INACTIVE', deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.deactivated',
        entityType:  'Freelancer',
        entityId:    input.id,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  listPayments: protectedProcedure
    .input(z.object({ freelancerId: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancer_payments')
        .select('*')
        .eq('freelancerId', input.freelancerId)
        .order('fechaPago', { ascending: false });

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data ?? [];
    }),

  createPayment: adminProcedure
    .input(createPaymentSchema)
    .mutation(async ({ input, ctx }) => {
      const { data: freelancer } = await supabaseAdmin
        .from('freelancers')
        .select('modalidad')
        .eq('id', input.freelancerId)
        .single();

      if (!freelancer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Freelancer not found' });

      const { data, error } = await supabaseAdmin
        .from('freelancer_payments')
        .insert({
          id:            randomUUID(),
          freelancerId:  input.freelancerId,
          descripcion:   input.descripcion,
          modalidad:     freelancer?.modalidad ?? 'POR_SERVICIO',
          horas:         input.horas ?? null,
          tarifaHora:    input.tarifaHora ?? null,
          monto:         input.monto,
          moneda:        input.moneda,
          fechaServicio: input.fechaServicio.toISOString().split('T')[0],
          fechaPago:     input.fechaPago.toISOString().split('T')[0],
          notas:         input.notas ?? null,
          createdAt:     new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.payment.created',
        entityType:  'FreelancerPayment',
        entityId:    data.id,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),
});

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const departmentsRouter = router({
  list: protectedProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('id, name, description')
      .order('name');

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data ?? [];
  }),

  create: adminProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('departments')
        .insert({ id: randomUUID(), ...input })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  update: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('departments')
        .update({ name: input.name, description: input.description, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});

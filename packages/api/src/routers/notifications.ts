import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { misIds } from '../mis-ids';

export const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('id, type, title, body, linkUrl, readAt, createdAt')
      .in('userId', await misIds(ctx))
      .order('createdAt', { ascending: false })
      .limit(50);

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data ?? [];
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { count } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .in('userId', await misIds(ctx))
      .is('readAt', null);

    return count ?? 0;
  }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ readAt: new Date().toISOString() })
        .eq('id', input.id)
        // Sigue siendo el dueño quien marca: el `in` no afloja eso, solo
        // contempla que "yo" pueda tener dos ids.
        .in('userId', await misIds(ctx));

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { success: true };
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ readAt: new Date().toISOString() })
      .in('userId', await misIds(ctx))
      .is('readAt', null);

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return { success: true };
  }),
});

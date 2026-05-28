import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, superAdminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const clinicsRouter = router({
  // Read available to any admin role (read-only for ADMIN, edit for SUPER_ADMIN)
  list: adminProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from('clinics')
      .select('id, name, display_name, country, lat, lng, radius_m, is_active, address, phone, updated_at')
      .order('country', { ascending: true })
      .order('display_name', { ascending: true });

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data ?? [];
  }),

  // Update only available to SUPER_ADMIN. We don't allow renaming `name`
  // (the legacy key that joins to attendance_records.clinic_name) because
  // that would orphan historical data. display_name is the friendly label.
  update: superAdminProcedure
    .input(z.object({
      id: z.string(),
      display_name: z.string().min(1).optional(),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
      radius_m: z.number().int().min(10).max(50000).nullable().optional(),
      is_active: z.boolean().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;

      const { data, error } = await supabaseAdmin
        .from('clinics')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'clinic.updated',
        entityType: 'Clinic',
        entityId: id,
        after: updates,
        createdAt: new Date().toISOString(),
      });

      return data;
    }),
});

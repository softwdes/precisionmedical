import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, superAdminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const clinicsRouter = router({
  // Read available to any admin role (read-only for ADMIN, edit for SUPER_ADMIN)
  list: adminProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from('clinics')
      .select('id, name, display_name, country, lat, lng, radius_m, is_active, strict_geofencing, address, phone, updated_at')
      .order('country', { ascending: true })
      .order('display_name', { ascending: true });

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data ?? [];
  }),

  // Crear clinica nueva — solo SUPER_ADMIN. El `name` es la clave interna
  // (legacy) que se usa para JOIN con work_schedules.clinic_name y
  // attendance_records.clinic_name. Una vez creado NO se puede cambiar;
  // cambiarlo orfanaria datos historicos. El display_name si es editable.
  create: superAdminProcedure
    .input(z.object({
      name: z.string().min(2).max(60).regex(/^[^\s].*[^\s]$|^[^\s]$/, 'Sin espacios al inicio o final'),
      display_name: z.string().min(2).max(80),
      country: z.enum(['US', 'BO', 'PE']),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
      radius_m: z.number().int().min(10).max(50000).nullable().optional(),
      is_active: z.boolean().optional(),
      strict_geofencing: z.boolean().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verificacion explicita de unicidad para dar un mensaje friendly.
      // El UNIQUE constraint de la DB lo respaldaria igual, pero el error
      // de PG es feo y poco accionable para el admin.
      const { data: existing } = await supabaseAdmin
        .from('clinics')
        .select('id')
        .eq('name', input.name)
        .maybeSingle();

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ya existe una clinica con la clave "${input.name}". Elige una clave unica.`,
        });
      }

      // Geofencing estricto requiere coords — backend valida igual que el UI
      if (input.strict_geofencing && (input.lat === null || input.lat === undefined || input.lng === null || input.lng === undefined)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No se puede activar geofencing estricto sin coordenadas GPS.',
        });
      }

      // clinics.id es text (Prisma cuid). En la migration inicial usamos
      // gen_random_uuid()::text. Aqui igual: UUID v4 desde Node crypto.
      const id = crypto.randomUUID();

      const { data, error } = await supabaseAdmin
        .from('clinics')
        .insert({
          id,
          name: input.name,
          display_name: input.display_name,
          country: input.country,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          radius_m: input.radius_m ?? null,
          is_active: input.is_active ?? true,
          strict_geofencing: input.strict_geofencing ?? false,
          address: input.address ?? null,
          phone: input.phone ?? null,
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'clinic.created',
        entityType: 'Clinic',
        entityId: id,
        after: input,
        createdAt: new Date().toISOString(),
      });

      return data;
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
      strict_geofencing: z.boolean().optional(),
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

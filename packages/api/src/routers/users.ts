import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure, superAdminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { sendWelcomeEmail } from '../email';

export const usersRouter = router({
  ping: protectedProcedure.query(() => 'ok' as const),

  me: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, firstName, lastName, avatarUrl, role, status, preferredLocale, preferredTheme, lastLoginAt')
      .eq('id', ctx.user.id)
      .single();

    if (error || !data) throw new TRPCError({ code: 'NOT_FOUND' });
    return data;
  }),

  updatePreferences: protectedProcedure
    .input(z.object({
      preferredLocale: z.enum(['es', 'en']).optional(),
      preferredTheme: z.enum(['light', 'dark']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ ...input, updatedAt: new Date().toISOString() })
        .eq('id', ctx.user.id)
        .select('id, preferredLocale, preferredTheme')
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  list: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'PROVIDER', 'AUDITOR_AI']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, search, role, status } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('users')
        .select('id, email, firstName, lastName, avatarUrl, role, status, phone, lastLoginAt, createdAt', { count: 'exact' })
        .is('deletedAt', null)
        .range(from, to)
        .order('createdAt', { ascending: false });

      if (search) query = query.or(`email.ilike.%${search}%,firstName.ilike.%${search}%,lastName.ilike.%${search}%`);
      if (role) query = query.eq('role', role);
      if (status) query = query.eq('status', status);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      return {
        users: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, email, firstName, lastName, avatarUrl, phone, role, status, preferredLocale, preferredTheme, mfaEnabled, lastLoginAt, lastLoginIp, createdAt, updatedAt')
        .eq('id', input.id)
        .single();

      if (error || !data) throw new TRPCError({ code: 'NOT_FOUND' });
      return data;
    }),

  create: superAdminProcedure
    .input(z.object({
      email: z.string().email(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'PROVIDER', 'AUDITOR_AI']),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Block if an active (non-deleted) user already has this email
      const { data: existingActive } = await supabaseAdmin
        .from('users').select('id').eq('email', input.email).is('deletedAt', null).maybeSingle();
      if (existingActive) throw new TRPCError({ code: 'CONFLICT', message: 'Email already exists' });

      // Clean up any lingering soft-deleted record to free the UNIQUE constraint
      const { data: existingDeleted } = await supabaseAdmin
        .from('users').select('id').eq('email', input.email).not('deletedAt', 'is', null).maybeSingle();
      if (existingDeleted) {
        await supabaseAdmin.from('users').delete().eq('id', existingDeleted.id);
      }

      // 1. Create auth user (no email sent by Supabase — we handle email via Resend)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        user_metadata: { firstName: input.firstName, lastName: input.lastName },
        email_confirm: false,
      });
      if (authError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Auth creation failed: ${authError.message}` });

      // 2. Insert into users table using the Supabase Auth UUID as id
      const { data, error } = await supabaseAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          ...input,
          status: 'PENDING_VERIFICATION',
          preferredLocale: 'es',
          preferredTheme: 'dark',
          mfaEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        // Roll back: delete the auth user to avoid orphaned auth records
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      }

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'user.created',
        entityType: 'User',
        entityId: data.id,
        after: { ...data, passwordHash: undefined },
        createdAt: new Date().toISOString(),
      });

      // 3. Generate activation link
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: input.email,
        options: { redirectTo: `${appUrl}/auth/invite` },
      });
      if (linkError) console.error('[users.create] generateLink failed:', linkError.message);

      const activationLink = linkData?.properties?.action_link;
      if (!activationLink) {
        console.error('[users.create] No action_link returned — email will not have a valid activation button');
      }

      // 4. Send welcome email via Resend and surface the result
      let emailSent = false;
      try {
        await sendWelcomeEmail({
          to: input.email,
          firstName: input.firstName,
          role: input.role,
          activationLink: activationLink ?? `${appUrl}/login`,
        });
        emailSent = true;
      } catch (emailErr: unknown) {
        const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error('[users.create] Welcome email failed:', msg);
      }

      return { ...data, emailSent };
    }),

  update: superAdminProcedure
    .input(z.object({
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'PROVIDER', 'AUDITOR_AI']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ ...updateData, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'user.updated',
        entityType: 'User',
        entityId: id,
        after: updateData,
        createdAt: new Date().toISOString(),
      });

      return data;
    }),

  listActivity: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const { data } = await supabaseAdmin
        .from('audit_logs')
        .select('id, action, before, after, createdAt, actorUser:users!actorUserId(firstName, lastName)')
        .or(`entityId.eq.${input.userId},actorUserId.eq.${input.userId}`)
        .order('createdAt', { ascending: false })
        .limit(30);
      return data ?? [];
    }),

  delete: superAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { data: target, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id, email, role')
        .eq('id', input.id)
        .single();

      if (fetchError || !target) throw new TRPCError({ code: 'NOT_FOUND' });
      if (target.email === 'erick@precisionmedicalcare.com') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Este usuario no puede ser eliminado' });
      }

      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', input.id);

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.auth.admin.deleteUser(input.id);

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'user.deleted',
        entityType: 'User',
        entityId: input.id,
        createdAt: new Date().toISOString(),
      });

      return { success: true };
    }),

  activateSelf: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ status: 'ACTIVE', updatedAt: new Date().toISOString() })
        .eq('id', ctx.user.id)
        .eq('status', 'PENDING_VERIFICATION');

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { success: true };
    }),

  suspend: superAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ status: 'SUSPENDED', updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'user.suspended',
        entityType: 'User',
        entityId: input.id,
        createdAt: new Date().toISOString(),
      });

      return data;
    }),
});

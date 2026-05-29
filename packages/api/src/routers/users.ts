import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure, superAdminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../email';

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

      // Sidecar: employee currently linked to this user + an available
      // candidate (same email, active, not yet linked). Both nullable.
      // Powers the "Empleado vinculado" section of EditUserDialog without
      // extra round-trips.
      const [{ data: linkedEmp }, { data: candidateEmp }] = await Promise.all([
        supabaseAdmin
          .from('employees')
          .select('id, firstName, lastName, email, employeeCode')
          .eq('userId', data.id)
          .is('deletedAt', null)
          .maybeSingle(),
        supabaseAdmin
          .from('employees')
          .select('id, firstName, lastName, email, employeeCode')
          .eq('email', data.email)
          .is('userId', null)
          .is('deletedAt', null)
          .eq('status', 'ACTIVE')
          .maybeSingle(),
      ]);

      return {
        ...data,
        linkedEmployee: linkedEmp ?? null,
        candidateEmployee: candidateEmp ?? null,
      };
    }),

  create: superAdminProcedure
    .input(z.object({
      email: z.string().email(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'PROVIDER', 'AUDITOR_AI']),
      phone: z.string().optional(),
      /** If provided, the resulting user is linked back to the employee row
       *  via employees.userId. Source of truth for email/firstName/lastName
       *  is the employee record; client should send the same values it read. */
      employeeId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { employeeId, ...userFields } = input;

      // Block if an active (non-deleted) user already has this email
      const { data: existingActive } = await supabaseAdmin
        .from('users').select('id').eq('email', userFields.email).is('deletedAt', null).maybeSingle();
      if (existingActive) throw new TRPCError({ code: 'CONFLICT', message: 'Email already exists' });

      // If linking to an employee, verify it exists and isn't already linked
      if (employeeId) {
        const { data: emp } = await supabaseAdmin
          .from('employees')
          .select('id, userId, email')
          .eq('id', employeeId)
          .maybeSingle();
        if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empleado no encontrado' });
        if (emp.userId) throw new TRPCError({ code: 'CONFLICT', message: 'Este empleado ya tiene un usuario vinculado' });
        if (emp.email !== userFields.email) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'El email no coincide con el del empleado' });
        }
      }

      // Clean up any lingering soft-deleted record to free the UNIQUE constraint
      const { data: existingDeleted } = await supabaseAdmin
        .from('users').select('id').eq('email', userFields.email).not('deletedAt', 'is', null).maybeSingle();
      if (existingDeleted) {
        await supabaseAdmin.from('users').delete().eq('id', existingDeleted.id);
      }

      // 1. Create auth user (no email sent by Supabase — we handle email via Resend)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: userFields.email,
        user_metadata: { firstName: userFields.firstName, lastName: userFields.lastName },
        email_confirm: false,
      });
      if (authError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Auth creation failed: ${authError.message}` });

      // 2. Insert into users table using the Supabase Auth UUID as id
      const { data, error } = await supabaseAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          ...userFields,
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

      // 3. If linking to an employee, set employees.userId = newUserId.
      // We treat the link failure as non-fatal — the user is already created
      // and functional. We log the discrepancy in audit_logs so admin sees it.
      let linkedEmployeeId: string | null = null;
      if (employeeId) {
        const { error: linkError } = await supabaseAdmin
          .from('employees')
          .update({ userId: data.id })
          .eq('id', employeeId);
        if (linkError) {
          console.error('[users.create] employee link failed:', linkError.message);
        } else {
          linkedEmployeeId = employeeId;
        }
      }

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'user.created',
        entityType: 'User',
        entityId: data.id,
        after: { ...data, passwordHash: undefined, linkedEmployeeId },
        createdAt: new Date().toISOString(),
      });

      return data;
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

  // Vincula un user existente con un employee existente.
  // Validaciones:
  //  - employee existe, no soft-deleted
  //  - employee no esta ya vinculado a otro user
  //  - emails coinciden (strict policy)
  linkEmployee: superAdminProcedure
    .input(z.object({
      userId: z.string(),
      employeeId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [{ data: user }, { data: emp }] = await Promise.all([
        supabaseAdmin.from('users').select('id, email').eq('id', input.userId).maybeSingle(),
        supabaseAdmin.from('employees').select('id, email, userId').eq('id', input.employeeId).is('deletedAt', null).maybeSingle(),
      ]);

      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
      if (!emp)  throw new TRPCError({ code: 'NOT_FOUND', message: 'Empleado no encontrado' });
      if (emp.userId && emp.userId !== input.userId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'El empleado ya esta vinculado a otro usuario' });
      }
      if (emp.email !== user.email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Los emails no coinciden (usuario: ${user.email as string}, empleado: ${emp.email as string})`,
        });
      }

      const { error } = await supabaseAdmin
        .from('employees')
        .update({ userId: input.userId })
        .eq('id', input.employeeId);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'user.employee_linked',
        entityType: 'User',
        entityId: input.userId,
        after: { employeeId: input.employeeId },
        createdAt: new Date().toISOString(),
      });

      return { success: true };
    }),

  // Desvincula al empleado que actualmente apunta a este user.
  // No borra el user ni el employee — solo limpia el FK.
  unlinkEmployee: superAdminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { data: emp } = await supabaseAdmin
        .from('employees')
        .select('id')
        .eq('userId', input.userId)
        .is('deletedAt', null)
        .maybeSingle();

      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Este usuario no tiene empleado vinculado' });

      const { error } = await supabaseAdmin
        .from('employees')
        .update({ userId: null })
        .eq('id', emp.id);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'user.employee_unlinked',
        entityType: 'User',
        entityId: input.userId,
        before: { employeeId: emp.id },
        createdAt: new Date().toISOString(),
      });

      return { success: true };
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

  sendPasswordReset: superAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email, firstName, role, status')
        .eq('id', input.id)
        .single();

      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const isFirstAccess = user.status === 'PENDING_VERIFICATION';

      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        // magiclink (not invite) for first access: invite fails when the auth
        // user already exists, which is always our case since users.create
        // already calls admin.createUser. magiclink can be regenerated freely.
        type: isFirstAccess ? 'magiclink' : 'recovery',
        email: user.email,
        options: {
          redirectTo: isFirstAccess
            ? `${appUrl}/auth/invite`
            : `${appUrl}/api/auth/callback?next=/reset-password`,
        },
      });

      if (linkError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: linkError.message });

      const actionLink = linkData?.properties?.action_link;
      if (!actionLink) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No se pudo generar el enlace de acceso' });

      if (isFirstAccess) {
        await sendWelcomeEmail({
          to: user.email,
          firstName: user.firstName,
          role: user.role as string,
          activationLink: actionLink,
        });
      } else {
        await sendPasswordResetEmail({ to: user.email, resetLink: actionLink });
      }
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

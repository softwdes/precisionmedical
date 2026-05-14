import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const searchRouter = router({
  global: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const q = input.query.trim();

      const [{ data: employees }, { data: users }] = await Promise.all([
        supabaseAdmin
          .from('employees')
          .select('id, firstName, lastName, email, employeeCode, position, status')
          .or(`firstName.ilike.%${q}%,lastName.ilike.%${q}%,email.ilike.%${q}%,employeeCode.ilike.%${q}%`)
          .is('deletedAt', null)
          .eq('status', 'ACTIVE')
          .limit(5),
        supabaseAdmin
          .from('users')
          .select('id, firstName, lastName, email, role, avatarUrl')
          .or(`firstName.ilike.%${q}%,lastName.ilike.%${q}%,email.ilike.%${q}%`)
          .is('deletedAt', null)
          .limit(5),
      ]);

      return {
        employees: (employees ?? []).map(e => ({
          id: e.id,
          label: `${e.firstName} ${e.lastName}`,
          sublabel: e.employeeCode,
          href: `/dashboard/employees/${e.id}`,
          type: 'employee' as const,
        })),
        users: (users ?? []).map(u => ({
          id: u.id,
          label: `${u.firstName} ${u.lastName}`,
          sublabel: u.email,
          href: `/dashboard/users/${u.id}`,
          type: 'user' as const,
        })),
      };
    }),
});

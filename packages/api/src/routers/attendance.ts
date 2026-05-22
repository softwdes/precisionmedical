import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const attendanceRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
      employeeId: z.string().optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      isAbsent: z.boolean().optional(),
      isLate: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, employeeId, month, isAbsent, isLate } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('attendance_sync')
        .select(
          'id, date, clockIn, clockOut, totalHours, isLate, isAbsent, employeeId, employee:employees(id,firstName,lastName,employeeCode)',
          { count: 'exact' },
        )
        .range(from, to)
        .order('date', { ascending: false });

      if (employeeId) query = query.eq('employeeId', employeeId);
      if (month) {
        query = query.gte('date', `${month}-01`).lte('date', `${month}-31`);
      }
      if (isAbsent !== undefined) query = query.eq('isAbsent', isAbsent);
      if (isLate !== undefined) query = query.eq('isLate', isLate);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return {
        items: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  create: adminProcedure
    .input(z.object({
      employeeId: z.string(),
      date: z.coerce.date(),
      clockIn: z.coerce.date().optional(),
      clockOut: z.coerce.date().optional(),
      isLate: z.boolean().default(false),
      isAbsent: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const totalHours = input.clockIn && input.clockOut
        ? Number(((input.clockOut.getTime() - input.clockIn.getTime()) / 3_600_000).toFixed(2))
        : null;

      const { data, error } = await supabaseAdmin
        .from('attendance_sync')
        .upsert({
          employeeId: input.employeeId,
          date: input.date.toISOString().split('T')[0],
          clockIn: input.clockIn?.toISOString() ?? null,
          clockOut: input.clockOut?.toISOString() ?? null,
          totalHours,
          isLate: input.isLate,
          isAbsent: input.isAbsent,
          syncedAt: new Date().toISOString(),
        }, { onConflict: 'employeeId,date' })
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  getSummaryByEmployee: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const { data } = await supabaseAdmin
        .from('attendance_sync')
        .select('isLate, isAbsent, totalHours')
        .eq('employeeId', input.employeeId)
        .gte('date', `${input.month}-01`)
        .lte('date', `${input.month}-31`);

      const records = data ?? [];
      const totalDays = records.length;
      const absentDays = records.filter(r => r.isAbsent).length;
      const lateDays = records.filter(r => r.isLate).length;
      const totalHours = records.reduce((s, r) => s + Number(r.totalHours ?? 0), 0);
      const attendanceRate = totalDays > 0 ? ((totalDays - absentDays) / totalDays) * 100 : 0;

      return { totalDays, absentDays, lateDays, totalHours, attendanceRate };
    }),
});

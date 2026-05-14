import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const metricsRouter = router({
  list: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      departmentId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const month = input.month ?? new Date().toISOString().slice(0, 7);

      const { data, error } = await supabaseAdmin
        .from('metric_snapshots')
        .select('id, date, punctualityScore, taskOnTimeScore, productivityScore, qualityScore, attendanceScore, globalScore, grade, employeeId, employee:employees(id,firstName,lastName,employeeCode,position,departmentId)')
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`)
        .order('globalScore', { ascending: false });

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      const items = data ?? [];
      if (input.departmentId) {
        return items.filter(m => {
          const emp = m.employee as unknown as { departmentId?: string } | null;
          return emp?.departmentId === input.departmentId;
        });
      }
      return items;
    }),

  getByEmployee: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      limit: z.number().int().positive().max(24).default(6),
    }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('metric_snapshots')
        .select('id, date, punctualityScore, taskOnTimeScore, productivityScore, qualityScore, attendanceScore, globalScore, grade')
        .eq('employeeId', input.employeeId)
        .order('date', { ascending: false })
        .limit(input.limit);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data ?? [];
    }),

  compute: adminProcedure
    .input(z.object({
      employeeId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .mutation(async ({ input }) => {
      const startDate = `${input.month}-01`;
      const endDate = `${input.month}-31`;

      const [{ data: attendance }, { data: tasks }] = await Promise.all([
        supabaseAdmin
          .from('attendance_sync')
          .select('isLate, isAbsent, totalHours')
          .eq('employeeId', input.employeeId)
          .gte('date', startDate)
          .lte('date', endDate),
        supabaseAdmin
          .from('tasks')
          .select('status, dueDate, completedDate, qualityRating')
          .eq('assigneeId', input.employeeId)
          .gte('dueDate', startDate)
          .lte('dueDate', endDate),
      ]);

      const records = attendance ?? [];
      const taskList = tasks ?? [];

      const totalDays = records.length || 1;
      const absentDays = records.filter(r => r.isAbsent).length;
      const lateDays = records.filter(r => r.isLate).length;

      const attendanceScore = Math.min(100, ((totalDays - absentDays) / totalDays) * 100);
      const punctualityScore = Math.min(100, ((totalDays - lateDays) / totalDays) * 100);

      const completedTasks = taskList.filter(t => t.status === 'REVIEWED' || t.status === 'DELIVERED');
      const onTimeTasks = completedTasks.filter(
        t => t.completedDate && new Date(t.completedDate as string) <= new Date(t.dueDate as string),
      );
      const taskOnTimeScore = completedTasks.length > 0
        ? (onTimeTasks.length / completedTasks.length) * 100
        : 100;

      const ratedTasks = completedTasks.filter(t => t.qualityRating);
      const qualityScore = ratedTasks.length > 0
        ? (ratedTasks.reduce((s, t) => s + Number(t.qualityRating ?? 0), 0) / ratedTasks.length) * 20
        : 100;

      const productivityScore = taskList.length > 0
        ? (completedTasks.length / taskList.length) * 100
        : 100;

      const globalScore =
        attendanceScore * 0.25 +
        punctualityScore * 0.20 +
        taskOnTimeScore * 0.20 +
        qualityScore * 0.20 +
        productivityScore * 0.15;

      const grade =
        globalScore >= 95 ? 'A_PLUS' :
        globalScore >= 85 ? 'A' :
        globalScore >= 75 ? 'B' :
        globalScore >= 65 ? 'C' : 'D';

      const { data, error } = await supabaseAdmin
        .from('metric_snapshots')
        .upsert({
          employeeId: input.employeeId,
          date: startDate,
          punctualityScore: punctualityScore.toFixed(2),
          taskOnTimeScore: taskOnTimeScore.toFixed(2),
          productivityScore: productivityScore.toFixed(2),
          qualityScore: qualityScore.toFixed(2),
          attendanceScore: attendanceScore.toFixed(2),
          globalScore: globalScore.toFixed(2),
          grade,
          computedAt: new Date().toISOString(),
        }, { onConflict: 'employeeId,date' })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const taskStatusEnum = z.enum(['ASSIGNED', 'IN_PROGRESS', 'DELIVERED', 'REVIEWED', 'REJECTED', 'CANCELLED']);
const taskPriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const tasksRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
      assigneeId: z.string().optional(),
      status: taskStatusEnum.optional(),
      priority: taskPriorityEnum.optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, assigneeId, status, priority } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('tasks')
        .select(
          'id, title, description, status, priority, dueDate, completedDate, qualityRating, assigneeId, supervisorId, assignee:employees!tasks_assigneeId_fkey(id,firstName,lastName,employeeCode)',
          { count: 'exact' },
        )
        .range(from, to)
        .order('dueDate', { ascending: true });

      if (assigneeId) query = query.eq('assigneeId', assigneeId);
      if (status) query = query.eq('status', status);
      if (priority) query = query.eq('priority', priority);

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
      title: z.string().min(1),
      description: z.string().optional(),
      assigneeId: z.string(),
      supervisorId: z.string().optional(),
      priority: taskPriorityEnum.default('NORMAL'),
      dueDate: z.coerce.date(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .insert({
          title: input.title,
          description: input.description,
          assigneeId: input.assigneeId,
          supervisorId: input.supervisorId ?? null,
          priority: input.priority,
          dueDate: input.dueDate.toISOString(),
          status: 'ASSIGNED',
          assignedDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: taskStatusEnum,
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .update({ status: input.status, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  complete: adminProcedure
    .input(z.object({
      id: z.string(),
      qualityRating: z.number().int().min(1).max(5).optional(),
      qualityFeedback: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .update({
          status: 'REVIEWED',
          completedDate: new Date().toISOString(),
          qualityRating: input.qualityRating ?? null,
          qualityFeedback: input.qualityFeedback ?? null,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});

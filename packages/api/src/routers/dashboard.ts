import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const dashboardRouter = router({
  kpis: protectedProcedure.query(async () => {
    const now = new Date();
    const currentPeriod = now.toISOString().slice(0, 7);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [
      r0,
      r1,
      r2,
      r3,
      r4,
    ] = await Promise.all([
      supabaseAdmin.from('appointments').select('id', { count: 'exact', head: true })
        .gte('scheduledFor', todayStart).lt('scheduledFor', todayEnd),
      supabaseAdmin.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabaseAdmin.from('payments').select('amountLocal').eq('period', currentPeriod).eq('status', 'PAID'),
      supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'ASSIGNED'),
      supabaseAdmin.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').is('deletedAt', null),
    ]);

    const todayAppointments = r0.count;
    const activePatients = r1.count;
    const monthPayments = r2.data;
    const pendingTasks = r3.count;
    const activeEmployees = r4.count;

    const monthlyRevenue = (monthPayments ?? []).reduce((sum, p) => sum + Number(p.amountLocal), 0);

    return {
      todayAppointments: todayAppointments ?? 0,
      activePatients: activePatients ?? 0,
      monthlyRevenue,
      pendingTasks: pendingTasks ?? 0,
      activeEmployees: activeEmployees ?? 0,
      currentPeriod,
    };
  }),

  activityFeed: protectedProcedure.query(async () => {
    const { data } = await supabaseAdmin
      .from('audit_logs')
      .select('id, action, entityType, entityId, actorUserId, createdAt, actor:users!actorUserId(firstName,lastName,avatarUrl)')
      .order('createdAt', { ascending: false })
      .limit(20);

    return data ?? [];
  }),

  cashBoxes: protectedProcedure.query(async () => {
    const { data } = await supabaseAdmin
      .from('cash_boxes')
      .select('id, name, balance, lowBalanceThreshold, currency, updatedAt')
      .order('name');

    return data ?? [];
  }),
});

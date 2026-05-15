import { router } from './trpc';
import { usersRouter } from './routers/users';
import { employeesRouter } from './routers/employees';
import { departmentsRouter } from './routers/departments';
import { paymentsRouter } from './routers/payments';
import { pettyCashRouter } from './routers/petty-cash';
import { dashboardRouter } from './routers/dashboard';
import { notificationsRouter } from './routers/notifications';
import { searchRouter } from './routers/search';
import { walletsRouter } from './routers/wallets';
import { fxRouter } from './routers/fx';
import { attendanceRouter } from './routers/attendance';
import { metricsRouter } from './routers/metrics';
import { tasksRouter } from './routers/tasks';
import { lawyersRouter } from './routers/lawyers';
import { providersRouter } from './routers/providers';
import { patientsRouter } from './routers/patients';
import { appointmentsRouter } from './routers/appointments';
import { commissionsRouter } from './routers/commissions';
import { aiAgentsRouter } from './routers/ai-agents';
import { freelancersRouter } from './routers/freelancers';

export const appRouter = router({
  users: usersRouter,
  employees: employeesRouter,
  departments: departmentsRouter,
  payments: paymentsRouter,
  pettyCash: pettyCashRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
  search: searchRouter,
  wallets: walletsRouter,
  fx: fxRouter,
  attendance: attendanceRouter,
  metrics: metricsRouter,
  tasks: tasksRouter,
  lawyers: lawyersRouter,
  providers: providersRouter,
  patients: patientsRouter,
  appointments: appointmentsRouter,
  commissions: commissionsRouter,
  aiAgents: aiAgentsRouter,
  freelancers: freelancersRouter,
});

export type AppRouter = typeof appRouter;

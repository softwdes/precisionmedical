import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { MetricsClient } from './metrics-client';

// Métricas por empleado — supervisión, solo ADMIN / SUPER_ADMIN.
// La data llega por API (/api/admin/metrics/employees) porque el período lo
// maneja el cliente; acá solo se verifica el acceso.

export default async function EmployeeMetricsPage() {
  const user = await getSessionUser();
  if (!user?.email) redirect('/login');

  const me = await getDbUserByEmail(user.email);
  if (me?.role !== 'ADMIN' && me?.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return <MetricsClient />;
}

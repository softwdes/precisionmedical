import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { TasksClient } from './tasks-client';

export const metadata = { title: 'Tareas' };

export default async function TasksPage(): Promise<React.ReactElement> {
  const [initial, employees] = await Promise.all([
    // pageSize DEBE coincidir con el de tasks-client: si no, `initial` no
    // corresponde a la primera clave de la query y no puede usarse de initialData.
    api.tasks.list({ page: 1, pageSize: 15 }),
    api.employees.list({ page: 1, pageSize: 200 }),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <TasksClient initial={initial} employees={employees.items} />
    </Suspense>
  );
}

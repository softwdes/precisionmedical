import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { TasksClient } from './tasks-client';

export const metadata = { title: 'Tareas' };

export default async function TasksPage(): Promise<React.ReactElement> {
  const [initial, employees] = await Promise.all([
    api.tasks.list({ page: 1, pageSize: 25 }),
    api.employees.list({ page: 1, pageSize: 200 }),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <TasksClient initial={initial} employees={employees.items} />
    </Suspense>
  );
}

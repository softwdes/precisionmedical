import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from './employees-client';

export const metadata = { title: 'Empleados' };

export default async function EmployeesPage(): Promise<React.ReactElement> {
  const [initial, departments, countries] = await Promise.all([
    api.employees.list({ page: 1, pageSize: 25 }),
    api.departments.list(),
    Promise.resolve([
      { id: 'us', code: 'US', name: 'United States' },
      { id: 'bo', code: 'BO', name: 'Bolivia' },
      { id: 'pe', code: 'PE', name: 'Peru' },
    ]),
  ]);

  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <EmployeesClient initial={initial} departments={departments} />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { AttendanceClient } from './attendance-client';

export const metadata = { title: 'Asistencia' };

export default async function AttendancePage(): Promise<React.ReactElement> {
  const [initial, employees] = await Promise.all([
    api.attendance.list({ page: 1, pageSize: 25 }),
    api.employees.list({ page: 1, pageSize: 200 }),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <AttendanceClient initial={initial} employees={employees.items} />
    </Suspense>
  );
}

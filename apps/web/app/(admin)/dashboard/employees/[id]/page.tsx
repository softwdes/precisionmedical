import * as React from 'react';
import { notFound } from 'next/navigation';
import { api } from '@/lib/trpc/server';
import { EmployeeDetailClient } from './employee-detail-client';

export const metadata = { title: 'Detalle Empleado' };

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const employee = await api.employees.getById({ id }).catch(() => null);
  if (!employee) notFound();
  return <EmployeeDetailClient employee={employee} />;
}

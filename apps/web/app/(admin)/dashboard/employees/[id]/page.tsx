import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { api } from '@/lib/trpc/server';
import { EmployeeDetailClient } from './employee-detail-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  // Igual que patients/[id] y lawyers/[id]: el nombre en la pestaña, y si el
  // registro no está, el título de la sección.
  const employee = await api.employees.getById({ id }).catch(() => null);
  return { title: employee ? `${employee.firstName} ${employee.lastName}` : t('employees.title') };
}

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

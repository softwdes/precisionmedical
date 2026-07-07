import { db } from '@precision-medical/database';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const clinics = await db.clinic.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, address: true, phone: true,
      _count: { select: { appointments: true } },
    },
  });

  return (
    <SettingsClient
      initialClinics={clinics.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address ?? '',
        phone: c.phone ?? '',
        appointmentCount: c._count.appointments,
      }))}
    />
  );
}

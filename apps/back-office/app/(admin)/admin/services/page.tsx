import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { redirect } from 'next/navigation';
import { ServicesClient } from './services-client';

// B.33 — Catálogo de Servicios (CPT/HCPCS/Custom)
export default async function ServicesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const services = await db.serviceCode.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }],
  });

  const favorites = await db.userServiceFavorite.findMany({
    where: { userId: user.id },
    select: { serviceCodeId: true },
  });
  const favIds = new Set(favorites.map((f) => f.serviceCodeId));

  const billable = services.filter((s) => !s.isInternalOnly);
  const internal = services.filter((s) => s.isInternalOnly);

  return (
    <ServicesClient
      services={services.map((s) => ({
        id: s.id,
        code: s.code,
        type: s.type,
        shortDescription: s.shortDescription,
        longDescription: s.longDescription,
        category: s.category,
        currentFee: Number(s.currentFee),
        fiscalYear: s.fiscalYear,
        modifiersAllowed: s.modifiersAllowed,
        bundlingNotes: s.bundlingNotes,
        notes: s.notes,
        isActive: s.isActive,
        isInternalOnly: s.isInternalOnly,
        isFavorite: favIds.has(s.id),
      }))}
      stats={{
        total: services.length,
        active: services.filter((s) => s.isActive).length,
        billable: billable.length,
        internal: internal.length,
        cpt: services.filter((s) => s.type === 'CPT').length,
        hcpcs: services.filter((s) => s.type === 'HCPCS').length,
        custom: services.filter((s) => s.type === 'CUSTOM_PM').length,
        favorites: favIds.size,
      }}
    />
  );
}

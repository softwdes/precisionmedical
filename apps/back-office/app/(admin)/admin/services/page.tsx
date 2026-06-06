import { db } from '@precision-medical/database';
import { ServicesClient } from './services-client';

// B.33 — Catálogo de Servicios (CPT/HCPCS/Custom)
export default async function ServicesPage() {
  const services = await db.serviceCode.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }],
  });

  // Phase 1A: favoritos por user fake (Phase 1B usa auth real)
  const FAKE_USER_ID = 'erick-super-admin-stub';
  const favorites = await db.userServiceFavorite.findMany({
    where: { userId: FAKE_USER_ID },
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

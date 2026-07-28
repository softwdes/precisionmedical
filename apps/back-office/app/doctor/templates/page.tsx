/**
 * Portal Médico · Plantillas clínicas (B.17.7 — T3)
 *
 * Plantillas GLOBALES (scope SHARED): el doctor puede crear y editar;
 * solo el admin puede eliminar (regla confirmada por Erick 2026-07-28).
 * Los favoritos son personales por doctor.
 */

import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionProvider } from '@/lib/get-session-provider';
import { TemplatesClient, type DoctorTemplate } from './templates-client';

export const metadata = { title: 'Plantillas · Portal Médico' };

export default async function DoctorTemplatesPage(): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const rows = await db.template.findMany({
    where: { deletedAt: null },
    include: {
      sections: { orderBy: { orderIndex: 'asc' } },
      favorites: provider.userId
        ? { where: { userId: provider.userId }, select: { id: true } }
        : false,
      _count: { select: { visitNotes: true } },
    },
    orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
  });

  const templates: DoctorTemplate[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    encounterType: t.encounterType,
    caseType: t.caseType,
    scope: t.scope,
    isActive: t.isActive,
    usageCount: t.usageCount,
    notesCount: t._count.visitNotes,
    isFavorite: Array.isArray(t.favorites) ? t.favorites.length > 0 : false,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    sections: t.sections.map((s) => ({
      sectionKey: s.sectionKey,
      content: s.content,
      enabledByDefault: s.enabledByDefault,
      orderIndex: s.orderIndex,
    })),
  }));

  // Solo el admin puede eliminar plantillas (el doctor crea y edita)
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.email ? await fetchDbRole(user.email) : 'DOCTOR';
  const canDelete = role === 'SUPER_ADMIN' || role === 'ADMIN';

  return <TemplatesClient templates={templates} userId={provider.userId} canDelete={canDelete} />;
}

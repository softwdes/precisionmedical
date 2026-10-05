/**
 * Portal Médico · Configuración · Plantillas clínicas (B.17.7 — T3)
 *
 * Vive bajo `/doctor/settings/templates` desde 2026-09-05 (antes `/doctor/templates`,
 * que redirige). El índice izquierdo lo pinta el layout de Configuración.
 *
 * Plantillas GLOBALES (scope SHARED): el doctor puede crear y editar;
 * solo el admin puede eliminar (regla confirmada por Erick 2026-07-28).
 * Los favoritos son personales por doctor.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionProvider, getDoctorViewInfo } from '@/lib/get-session-provider';
import { getSessionUser } from '@/lib/session';
import { filtroPorAlcance } from '@/lib/alcance-listas';
import { TemplatesClient, type DoctorTemplate } from './templates-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('templates') };
}

export default async function DoctorTemplatesPage(): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  /**
   * "Que el admin vea todo" (Erick, 2026-10-05). Esta es la ÚNICA pantalla
   * donde se administran plantillas: la de `(admin)/admin/templates` quedó sin
   * `page.tsx` y no la importa nadie, así que no es una puerta.
   *
   * **Salvo en modo "ver como".** Ahí el admin está mirando el portal de otro
   * médico y la promesa es *"se ve tal como lo ve esa persona"*; abrirle la
   * lista completa justo ahí convertiría en inútil la única herramienta que
   * tiene para responder un "no me aparece".
   */
  const user = await getSessionUser();
  const role = user?.email ? await fetchDbRole(user.email) : 'DOCTOR';
  const esAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const { isViewAs } = await getDoctorViewInfo();

  const rows = await db.template.findMany({
    where: { deletedAt: null, ...filtroPorAlcance(provider.userId, esAdmin && !isViewAs) },
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
    // Hace falta en el cliente para saber si ESTA persona puede pasarla a su
    // lista: mover a personal una plantilla ajena la escondería para todos
    // menos para su autor, que no es quien la está editando.
    createdById: t.createdById,
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
  const canDelete = esAdmin;

  return <TemplatesClient templates={templates} userId={provider.userId} canDelete={canDelete} />;
}

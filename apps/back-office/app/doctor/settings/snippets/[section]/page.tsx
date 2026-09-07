/**
 * Portal Médico · Configuración · Snippets de UNA sección de la nota.
 *
 * La lista de una sección (HPI, ROS…) con favoritos personales y el modal de
 * crear/editar. Misma regla que las plantillas: cualquier provider crea y
 * edita, solo el admin elimina. Ver docs/plan-settings-portal-snippets.md.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { getSectionLabelOverrides, sectionLabelFrom } from '@/lib/section-labels';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getSessionUser } from '@/lib/session';
import { isSnippetSection } from '@/lib/snippet-sections';
import { SnippetsClient, type SnippetRow } from './snippets-client';

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const t = await getTranslations('phoenix.doctor');
  if (!isSnippetSection(section)) return { title: t('settingsTitle') };
  // El nombre propio que puso el admin, si hay — el mismo que el índice y la nota.
  const [overrides, locale] = await Promise.all([getSectionLabelOverrides(), getLocale()]);
  return { title: t('snpTitle', { section: sectionLabelFrom(overrides, section, locale, t(`sec_${section}`)) }) };
}

export default async function SnippetsSectionPage({ params }: Props): Promise<React.ReactElement> {
  const { section } = await params;
  // Una sección que no existe es un 404, no una lista vacía: `DIAGNOSTICOS` o
  // un typo en la URL no tienen que parecer "todavía no hay snippets".
  if (!isSnippetSection(section)) notFound();

  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout del portal ya renderiza el estado sin perfil

  const [rows, user] = await Promise.all([
    db.snippet.findMany({
      where: { deletedAt: null, sectionKey: section },
      include: {
        favorites: provider.userId
          ? { where: { userId: provider.userId }, select: { id: true } }
          : false,
      },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
    }),
    getSessionUser(),
  ]);

  const snippets: SnippetRow[] = rows.map((s) => ({
    id: s.id,
    sectionKey: s.sectionKey,
    title: s.title,
    description: s.description,
    content: s.content,
    isActive: s.isActive,
    usageCount: s.usageCount,
    isFavorite: Array.isArray(s.favorites) ? s.favorites.length > 0 : false,
    updatedAt: s.updatedAt.toISOString(),
  }));

  // Solo el admin puede eliminar (el provider crea y edita) — misma regla que templates.
  const role = user?.email ? await fetchDbRole(user.email) : 'DOCTOR';
  const canDelete = role === 'SUPER_ADMIN' || role === 'ADMIN';

  return <SnippetsClient section={section} snippets={snippets} canDelete={canDelete} />;
}

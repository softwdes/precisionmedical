/**
 * Consultas de las notas de release.
 *
 * Vive acá y no en `@precision/release` porque necesita Prisma, y ese paquete lo
 * importan componentes client. Cada app expone un route handler de 10 líneas que
 * llama a esto — son 6 deploys separados, cada uno con su propio /api/changelog.
 */
import { db } from './index';
import { moduleLabel } from '@precision/release/modules';
import type { Audience } from '@precision/release/audience';
import type { NoteLocale, ReleaseSummary } from '@precision/release/types';
import type { ReleaseAudience } from '@prisma/client';

/** Las audiencias que nunca reciben notas (el paciente). */
const SILENT: readonly Audience[] = ['patient'];

function toDbAudience(audience: Audience): ReleaseAudience {
  return audience.toUpperCase() as ReleaseAudience;
}

export interface ChangelogQuery {
  /** App del monorepo — cada deploy consulta lo suyo. */
  app: string;
  /** SHA con el que arrancó la pestaña del usuario. */
  since: string;
  audience: Audience;
  locale: NoteLocale;
}

/**
 * Lo publicado DESPUÉS del build que tiene el usuario.
 *
 * Si el SHA no existe en `releases` devolvemos vacío a propósito. Pasa cuando el
 * usuario viene de un build anterior a que esto existiera, y la alternativa
 * —mostrarle todo el historial— sería peor que no mostrarle nada.
 */
export async function getChangelog(query: ChangelogQuery): Promise<ReleaseSummary[]> {
  const { app, since, audience, locale } = query;

  if (SILENT.includes(audience)) return [];

  const from = await db.release.findUnique({
    where: { app_sha: { app, sha: since } },
    select: { deployedAt: true },
  });
  if (from === null) return [];

  const releases = await db.release.findMany({
    where: {
      app,
      status: 'PUBLISHED',
      deployedAt: { gt: from.deployedAt },
      publishedAt: { not: null },
    },
    orderBy: { deployedAt: 'desc' },
    // Techo por si alguien vuelve después de meses sin abrir la app.
    take: 20,
    select: {
      sha: true,
      publishedAt: true,
      entries: {
        where: { hidden: false, audiences: { has: toDbAudience(audience) } },
        orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, kind: true, module: true, textEs: true, textEn: true },
      },
    },
  });

  return releases
    .map((release) => {
      // Agrupar por módulo preservando el orden que ya trajo la query.
      const groups = new Map<string, ReleaseSummary['modules'][number]>();

      for (const entry of release.entries) {
        const group = groups.get(entry.module) ?? {
          module: entry.module,
          moduleLabel: moduleLabel(entry.module, locale),
          notes: [],
        };
        group.notes.push({
          id: entry.id,
          kind: entry.kind,
          // Si falta el inglés cae al español antes que mostrar un hueco. El
          // publish debería impedir que llegue así.
          text: locale === 'en' ? (entry.textEn ?? entry.textEs) : entry.textEs,
        });
        groups.set(entry.module, group);
      }

      return {
        sha: release.sha,
        publishedAt: (release.publishedAt ?? new Date()).toISOString(),
        modules: [...groups.values()],
      };
    })
    // Un release cuyas entradas eran todas de otras audiencias no se muestra.
    .filter((release) => release.modules.length > 0);
}

/** Una entrada tal como la ve /admin/releases: con los dos idiomas y las banderas. */
export interface AdminEntry {
  id: string;
  kind: 'FEAT' | 'FIX';
  module: string;
  moduleLabelEs: string;
  moduleLabelEn: string;
  audiences: Audience[];
  textEs: string;
  textEn: string | null;
  hidden: boolean;
  needsReview: boolean;
  sortOrder: number;
  commitSha: string;
  commitScope: string | null;
}

export interface AdminRelease {
  id: string;
  app: string;
  sha: string;
  previousSha: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  deployedAt: string;
  publishedAt: string | null;
  publishedByName: string | null;
  entries: AdminEntry[];
  /** Cuántas entradas visibles todavía no tienen inglés — bloquean el publish. */
  missingEnglish: number;
}

export async function listReleasesForAdmin(limit = 30): Promise<AdminRelease[]> {
  const releases = await db.release.findMany({
    orderBy: { deployedAt: 'desc' },
    take: limit,
    include: {
      // `needsReview` primero: es lo que hay que mirar.
      entries: { orderBy: [{ needsReview: 'desc' }, { module: 'asc' }, { sortOrder: 'asc' }] },
    },
  });

  return releases.map((release) => ({
    id: release.id,
    app: release.app,
    sha: release.sha,
    previousSha: release.previousSha,
    status: release.status,
    deployedAt: release.deployedAt.toISOString(),
    publishedAt: release.publishedAt?.toISOString() ?? null,
    publishedByName: release.publishedByName,
    missingEnglish: release.entries.filter((e) => !e.hidden && e.textEn === null).length,
    entries: release.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      module: entry.module,
      moduleLabelEs: moduleLabel(entry.module, 'es'),
      moduleLabelEn: moduleLabel(entry.module, 'en'),
      audiences: entry.audiences.map((a) => a.toLowerCase() as Audience),
      textEs: entry.textEs,
      textEn: entry.textEn,
      hidden: entry.hidden,
      needsReview: entry.needsReview,
      sortOrder: entry.sortOrder,
      commitSha: entry.commitSha,
      commitScope: entry.commitScope,
    })),
  }));
}

export interface PublishResult {
  ok: boolean;
  /** `MISSING_ENGLISH` con las entradas que faltan traducir. */
  error?: 'NOT_FOUND' | 'ALREADY_PUBLISHED' | 'MISSING_ENGLISH' | 'NOTHING_TO_PUBLISH';
  missing?: { id: string; textEs: string }[];
}

/**
 * Publica un release. Es lo único que lo hace visible en el banner.
 *
 * Bloquea si alguna entrada visible no tiene inglés: el idioma sale de la cookie
 * `locale`, y si el usuario está en EN tiene que ver TODO en EN. Esa regla no se
 * puede expresar en el schema (`textEn` es nullable mientras es borrador), así
 * que se valida acá.
 */
export async function publishRelease(
  releaseId: string,
  publishedBy: { id: string | null; name: string | null },
): Promise<PublishResult> {
  const release = await db.release.findUnique({
    where: { id: releaseId },
    include: { entries: { where: { hidden: false } } },
  });

  if (release === null) return { ok: false, error: 'NOT_FOUND' };
  if (release.status === 'PUBLISHED') return { ok: false, error: 'ALREADY_PUBLISHED' };
  if (release.entries.length === 0) return { ok: false, error: 'NOTHING_TO_PUBLISH' };

  const missing = release.entries.filter((e) => e.textEn === null || e.textEn.trim() === '');
  if (missing.length > 0) {
    return {
      ok: false,
      error: 'MISSING_ENGLISH',
      missing: missing.map((e) => ({ id: e.id, textEs: e.textEs })),
    };
  }

  await db.release.update({
    where: { id: releaseId },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedById: publishedBy.id,
      publishedByName: publishedBy.name,
    },
  });

  return { ok: true };
}

/** Vuelve un release a borrador — deja de mostrarse en el banner. */
export async function unpublishRelease(releaseId: string): Promise<void> {
  await db.release.update({
    where: { id: releaseId },
    data: { status: 'DRAFT', publishedAt: null, publishedById: null, publishedByName: null },
  });
}

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
import type { NoteLocale, ReleaseModuleGroup } from '@precision/release/types';
import type { ReleaseAudience } from '@prisma/client';

/** Las audiencias que nunca reciben notas (el paciente). */
const SILENT: readonly Audience[] = ['patient'];

function toDbAudience(audience: Audience): ReleaseAudience {
  return audience.toUpperCase() as ReleaseAudience;
}

export interface ChangelogQuery {
  /** App del monorepo — cada deploy consulta lo suyo. */
  app: string;
  /** SHA con el que arrancó la pestaña. Ancla de RESERVA. */
  since: string;
  /**
   * Hora del server cuando arrancó la pestaña. El ancla buena.
   *
   * Anclar en el SHA era el bug que hizo que esto no se viera nunca: con
   * `turbo-ignore` salteando builds, Vercel crea deployments para commits que
   * no buildearon esta app, así que el sha en runtime puede no tener fila en
   * `releases` — y el lookup fallaba y devolvíamos vacío en silencio.
   */
  bootAt?: string;
  audience: Audience;
  locale: NoteLocale;
}

/**
 * Desde cuándo contar. Tres niveles, del mejor al peor:
 *
 *  1. `bootAt` — exacto y siempre disponible en bundles nuevos.
 *  2. el `deployedAt` de la fila del sha — para marcas viejas ya guardadas.
 *  3. el último release publicado — antes que no mostrar nada. El usuario
 *     acaba de actualizar: lo más nuevo publicado es, casi siempre, lo que
 *     acaba de recibir.
 */
async function resolveFrom(app: string, since: string, bootAt?: string): Promise<Date | null> {
  if (bootAt !== undefined) {
    const parsed = new Date(bootAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const row = await db.release.findUnique({
    where: { app_sha: { app, sha: since } },
    select: { deployedAt: true },
  });
  if (row !== null) return row.deployedAt;

  const last = await db.release.findFirst({
    where: { app, status: 'PUBLISHED' },
    orderBy: { deployedAt: 'desc' },
    select: { deployedAt: true },
  });
  if (last === null) return null;

  // Un milisegundo antes, para que ESE release entre en el `gt`.
  return new Date(last.deployedAt.getTime() - 1);
}

/** Lo publicado después de que arrancó la pestaña, unificado por módulo. */
export async function getChangelog(
  query: ChangelogQuery,
): Promise<{ modules: ReleaseModuleGroup[]; count: number }> {
  const { app, since, bootAt, audience, locale } = query;

  if (SILENT.includes(audience)) return { modules: [], count: 0 };

  const from = await resolveFrom(app, since, bootAt);
  if (from === null) return { modules: [], count: 0 };

  const releases = await db.release.findMany({
    where: {
      app,
      status: 'PUBLISHED',
      deployedAt: { gt: from },
      publishedAt: { not: null },
    },
    orderBy: { deployedAt: 'desc' },
    // Techo por si alguien vuelve después de meses sin abrir la app.
    take: 20,
    select: {
      entries: {
        where: { hidden: false, audiences: { has: toDbAudience(audience) } },
        orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, kind: true, module: true, textEs: true, textEn: true },
      },
    },
  });

  // Un solo grupo por módulo, aunque las notas vengan de varios deploys.
  const groups = new Map<string, ReleaseModuleGroup>();
  let count = 0;

  for (const release of releases) {
    for (const entry of release.entries) {
      const group = groups.get(entry.module) ?? {
        module: entry.module,
        moduleLabel: moduleLabel(entry.module, locale),
        notes: [],
      };
      group.notes.push({
        id: entry.id,
        kind: entry.kind,
        // Si falta el inglés cae al español antes que mostrar un hueco.
        text: locale === 'en' ? (entry.textEn ?? entry.textEs) : entry.textEs,
      });
      groups.set(entry.module, group);
      count += 1;
    }
  }

  // `other` último: es el cajón de lo que el mapa de scopes no reconoció.
  const modules = [...groups.values()].sort((a, b) =>
    a.module === 'other' ? 1 : b.module === 'other' ? -1 : a.moduleLabel.localeCompare(b.moduleLabel),
  );

  return { modules, count };
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
 * Avisa —no bloquea— si alguna entrada visible no tiene inglés. Arrancó como muro
 * y estaba mal: con 8 notas por deploy sin traducir, el costo de publicar era
 * tan alto que la feature se iba a quedar sin usar, y una nota en español para
 * alguien con la app en inglés es mucho menos malo que no enterarse del cambio.
 * `getChangelog` ya cae al español cuando falta el inglés.
 *
 * Sigue costando un acto deliberado: quien publica tiene que mandar `force` y la
 * UI se lo dice.
 */
export async function publishRelease(
  releaseId: string,
  publishedBy: { id: string | null; name: string | null },
  options: { allowMissingEnglish?: boolean } = {},
): Promise<PublishResult> {
  const release = await db.release.findUnique({
    where: { id: releaseId },
    include: { entries: { where: { hidden: false } } },
  });

  if (release === null) return { ok: false, error: 'NOT_FOUND' };
  if (release.status === 'PUBLISHED') return { ok: false, error: 'ALREADY_PUBLISHED' };
  if (release.entries.length === 0) return { ok: false, error: 'NOTHING_TO_PUBLISH' };

  const missing = release.entries.filter((e) => e.textEn === null || e.textEn.trim() === '');
  if (missing.length > 0 && options.allowMissingEnglish !== true) {
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

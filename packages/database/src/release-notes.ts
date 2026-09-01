/**
 * Consultas de las notas de release.
 *
 * Vive acá y no en `@precision/release` porque necesita Prisma, y ese paquete lo
 * importan componentes client. Cada app expone un route handler de 10 líneas que
 * llama a esto — son 6 deploys separados, cada uno con su propio /api/changelog.
 */
import { db } from './index';
import { traducirPendientes } from './release-translate';
import { moduleLabel } from '@precision/release/modules';
import type { Audience } from '@precision/release/audience';
import type { NoteLocale, ReleaseModuleGroup } from '@precision/release/types';
import type { ReleaseAudience, ReleaseNoteKind } from '@prisma/client';

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

/**
 * Entradas sueltas -> grupos por modulo, traduciendo lo que falte.
 *
 * Lo comparten `getChangelog` (lo publicado desde que arranco la pestaña) y
 * `getInbox` (el buzon permanente de la campana). Cambian en QUE releases miran,
 * no en como se arma la lista: sacarlo aca evita que las dos vistas del mismo
 * changelog se separen con el tiempo.
 */
async function agrupar(
  entries: Array<{ id: string; kind: ReleaseNoteKind; module: string; textEs: string; textEn: string | null }>,
  locale: NoteLocale,
): Promise<{ modules: ReleaseModuleGroup[]; count: number }> {

  // En inglés, traducir lo que falte — una vez en la vida de cada nota. Los
  // commits están en español y siempre lo van a estar; mostrarle español a
  // alguien con la app en inglés se veía roto. Si no hay proveedor o falla,
  // `traducidas` viene vacío y cae al español, que es lo que había antes.
  const traducidas =
    locale === 'en'
      ? await traducirPendientes(
          entries
            .filter((e) => e.textEn === null || e.textEn.trim() === '')
            .map((e) => ({ id: e.id, textEs: e.textEs })),
        )
      : new Map<string, string>();

  // Un solo grupo por módulo, aunque las notas vengan de varios deploys.
  const groups = new Map<string, ReleaseModuleGroup>();
  let count = 0;

  for (const entry of entries) {
    const group = groups.get(entry.module) ?? {
      module: entry.module,
      moduleLabel: moduleLabel(entry.module, locale),
      notes: [],
    };
    group.notes.push({
      id: entry.id,
      kind: entry.kind,
      // Si falta el inglés cae al español antes que mostrar un hueco.
      text:
        locale === 'en'
          ? (entry.textEn ?? traducidas.get(entry.id) ?? entry.textEs)
          : entry.textEs,
    });
    groups.set(entry.module, group);
    count += 1;
  }

  // `other` último: es el cajón de lo que el mapa de scopes no reconoció.
  const modules = [...groups.values()].sort((a, b) =>
    a.module === 'other' ? 1 : b.module === 'other' ? -1 : a.moduleLabel.localeCompare(b.moduleLabel),
  );

  return { modules, count };
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
        // `needsReview` NO se muestra. El script del build publica el release
        // solo, pero lo que no pudo decidir —scope sin mapear, audiencia
        // ambigua— espera a que alguien lo apruebe en /settings. Guardar la
        // entrada en el tab apaga la bandera y ahi si aparece.
        where: {
          hidden: false,
          needsReview: false,
          audiences: { has: toDbAudience(audience) },
        },
        orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, kind: true, module: true, textEs: true, textEn: true },
      },
    },
  });

  const entries = releases.flatMap((release) => release.entries);

  return agrupar(entries, locale);
}


/**
 * Cuantos releases mira el buzon hacia atras.
 *
 * 60 y no 20: la cadencia real de este repo son ~5 deploys por dia (75 releases
 * de back-office en las dos semanas que lleva el sistema), asi que 20 serian
 * cuatro dias de historia y el panel se veria vacio de contenido viejo. Con 60
 * se cubre practicamente todo lo publicado hasta hoy.
 */
const HISTORIAL_RELEASES = 60;

/**
 * Cuantos dias mira hacia atras quien NUNCA abrio el buzon.
 *
 * El corpus entero tiene dos semanas, asi que arrancar en cero le pondria 58
 * notas encima al admin el primer dia — un muro que nadie lee. Medido el
 * 2026-09-01: 3 dias dan ADMIN 22 / DOCTOR 13 / ATTORNEY 6, que se lee de una
 * sentada; 7 dias ya dan 47/28/29.
 *
 * Vive aca y no en el DDL a proposito: moverlo no tiene que costar un ALTER.
 */
export const DIAS_DEBUT = 3;

export interface InboxQuery {
  /** App del monorepo — cada deploy consulta lo suyo. */
  app: string;
  audience: Audience;
  locale: NoteLocale;
  /** Hasta donde leyo el usuario. `null` = nunca abrio el buzon. */
  seenAt: Date | null;
}

export interface Inbox {
  modules: ReleaseModuleGroup[];
  /** Cuantas notas trae el panel (la historia). */
  count: number;
  /** Cuantas de esas son posteriores a `seenAt`. Es lo que cuenta el badge. */
  unseen: number;
  /** Desde cuando se conto lo no visto — el debut si la marca estaba en null. */
  since: Date;
  /** `true` si esta es la primera vez: quien llama deberia sellar la marca. */
  debut: boolean;
}

/**
 * El buzon permanente de la campana: la historia reciente MAS cuanto hay sin ver.
 *
 * Distinto de `getChangelog`, que responde "que cambio desde que arranco esta
 * pestaña" y se muestra una sola vez despues del reload. Este se abre cuando el
 * usuario quiere, asi que devuelve la historia completa igual y usa `seenAt` solo
 * para el contador — cerrar el panel sin leer no destruye nada.
 *
 * Una sola consulta para los dos numeros: lo no visto es un subconjunto de la
 * historia. Si alguien estuvo mas de `HISTORIAL_RELEASES` deploys sin mirar, el
 * contador queda topado por la historia, que es lo honesto: no se puede anunciar
 * lo que no se va a mostrar.
 */
export async function getInbox(query: InboxQuery): Promise<Inbox> {
  const { app, audience, locale, seenAt } = query;
  const debut = seenAt === null;
  const since = seenAt ?? new Date(Date.now() - DIAS_DEBUT * 24 * 60 * 60 * 1000);

  if (SILENT.includes(audience)) {
    return { modules: [], count: 0, unseen: 0, since, debut };
  }

  const releases = await db.release.findMany({
    where: { app, status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: { deployedAt: "desc" },
    take: HISTORIAL_RELEASES,
    select: {
      deployedAt: true,
      entries: {
        // Mismo filtro que `getChangelog`: lo oculto por sensible y lo que
        // espera revision no sale por ninguna de las dos puertas.
        where: {
          hidden: false,
          needsReview: false,
          audiences: { has: toDbAudience(audience) },
        },
        orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
        select: { id: true, kind: true, module: true, textEs: true, textEn: true },
      },
    },
  });

  const unseen = releases
    .filter((release) => release.deployedAt > since)
    .reduce((total, release) => total + release.entries.length, 0);

  const { modules, count } = await agrupar(
    releases.flatMap((release) => release.entries),
    locale,
  );

  return { modules, count, unseen, since, debut };
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

/**
 * Cuantas entradas de un release ya se le mostraron a alguien.
 *
 * Es lo que decide si una entrada todavia se puede editar: una nota publicada Y
 * aprobada ya la leyo gente, y cambiarle el texto seria moverle el piso. Una que
 * sigue en `needsReview` no se mostro nunca, asi que se edita libremente aunque
 * el release este publicado.
 */
export async function countVisibleEntries(releaseId: string): Promise<number> {
  return db.releaseEntry.count({
    where: { releaseId, hidden: false, needsReview: false },
  });
}

/** Vuelve un release a borrador — deja de mostrarse en el banner. */
export async function unpublishRelease(releaseId: string): Promise<void> {
  await db.release.update({
    where: { id: releaseId },
    data: { status: 'DRAFT', publishedAt: null, publishedById: null, publishedByName: null },
  });
}

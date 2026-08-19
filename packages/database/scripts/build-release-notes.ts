/**
 * Crea el Release en DRAFT de un deploy, parseando el `git log`.
 *
 * Corre en el build de cada app (ver el `buildCommand` de su vercel.json):
 *   tsx scripts/build-release-notes.ts --app back-office
 *
 * REGLA DE ORO: esto NUNCA tumba un build. Cualquier falla —sin DB, clone
 * shallow, git raro— se loguea y el proceso sale con 0. Que un deploy se caiga
 * por las notas de release seria peor que no tenerlas.
 *
 * Lo que crea queda en DRAFT: nadie lo ve hasta que se publica desde
 * /admin/releases. Ver el comentario de `Release` en el schema.
 */
import { execFileSync } from 'node:child_process';
import { db } from '../src/index';
import {
  moduleForScope,
  parseHeader,
  toNote,
  type CommitNote,
  type ParsedCommit,
} from '@precision/release';
import type { ReleaseAudience, ReleaseNoteKind } from '@prisma/client';

const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';

/** Cuanto profundizamos el clone shallow de Vercel antes de rendirnos. */
const DEEPEN_STEPS = [50, 200, 500];

function log(message: string): void {
  console.log(`[release-notes] ${message}`);
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function gitQuiet(args: string[]): string | null {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

function hasCommit(sha: string): boolean {
  return gitQuiet(['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

/**
 * Vercel clona shallow (~depth 10) y con `turbo-ignore` salteando builds el
 * deploy anterior de ESTA app puede quedar mucho mas atras que eso. Vamos
 * profundizando hasta encontrarlo.
 */
function ensureCommitReachable(sha: string): boolean {
  if (hasCommit(sha)) return true;

  const isShallow = gitQuiet(['rev-parse', '--is-shallow-repository']) === 'true';
  if (!isShallow) {
    log(`el commit ${sha.slice(0, 8)} no esta en el repo y el clone no es shallow`);
    return false;
  }

  for (const depth of DEEPEN_STEPS) {
    log(`clone shallow: profundizando a ${depth} para alcanzar ${sha.slice(0, 8)}`);
    if (gitQuiet(['fetch', `--deepen=${depth}`, '--quiet']) === null) break;
    if (hasCommit(sha)) return true;
  }

  return false;
}

/** Un chunk = un commit: `sha \x1f asunto \x1f \n path \n path ...` */
function parseLog(raw: string): ParsedCommit[] {
  const commits: ParsedCommit[] = [];

  for (const chunk of raw.split(RECORD_SEP)) {
    if (chunk.trim() === '') continue;

    const [sha, subject, rest = ''] = chunk.split(FIELD_SEP);
    if (sha === undefined || subject === undefined) continue;

    const header = parseHeader(subject);
    if (header === null) continue;

    const paths = rest
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');

    commits.push({
      sha: sha.trim(),
      type: header.type,
      scope: header.scope,
      subject: header.subject,
      paths,
    });
  }

  return commits;
}

function readCommits(from: string, to: string): ParsedCommit[] {
  const raw = gitQuiet([
    'log',
    `${from}..${to}`,
    '--no-merges',
    '--name-only',
    `--format=${RECORD_SEP}%H${FIELD_SEP}%s${FIELD_SEP}`,
  ]);

  if (raw === null) {
    log(`no se pudo leer el rango ${from.slice(0, 8)}..${to.slice(0, 8)}`);
    return [];
  }

  return parseLog(raw);
}

/**
 * `--dry-run --from <sha>` imprime lo que saldria, sin tocar la DB. Es como se
 * cura SCOPE_TO_MODULE: se corre sobre un rango real y se mira que cayo en
 * `other` o quedo para revisar.
 */
function dryRun(from: string, to: string): void {
  const commits = readCommits(from, to);
  const notes = commits
    .map((commit) => toNote(commit))
    .filter((note): note is CommitNote => note !== null);

  const byModule = new Map<string, CommitNote[]>();
  for (const note of notes) {
    const { module } = moduleForScope(note.scope);
    const bucket = byModule.get(module) ?? [];
    bucket.push(note);
    byModule.set(module, bucket);
  }

  log(`${commits.length} commits, ${notes.length} publicables`);

  for (const [module, bucket] of [...byModule.entries()].sort()) {
    console.log(`
  ## ${module} (${bucket.length})`);
    for (const note of bucket) {
      const flags = [
        note.hidden ? 'OCULTA' : null,
        note.needsReview && !note.hidden ? 'revisar' : null,
        note.audiences.length === 0 ? 'sin-audiencia' : note.audiences.join('+'),
      ].filter((f) => f !== null);
      console.log(`  ${note.kind === 'FIX' ? 'fix' : 'new'}  ${note.subject}`);
      console.log(`       [${flags.join('] [')}]  scope=${note.scope ?? '-'}`);
    }
  }

  const unmapped = notes.filter((n) => !moduleForScope(n.scope).mapped);
  const scopes = [...new Set(unmapped.map((n) => n.scope ?? '(sin scope)'))].sort();
  console.log(
    `
  resumen: ${notes.filter((n) => n.needsReview).length} para revisar, ` +
      `${notes.filter((n) => n.hidden).length} ocultas, ` +
      `${unmapped.length} con scope sin mapear`,
  );
  if (scopes.length > 0) console.log(`  scopes sin mapear: ${scopes.join(', ')}`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--dry-run')) {
    const from = argValue('--from');
    if (from === null) {
      log('--dry-run necesita --from <sha>');
      return;
    }
    dryRun(from, argValue('--to') ?? 'HEAD');
    return;
  }

  const app = argValue('--app');
  if (app === null) {
    log('falta --app; no hago nada');
    return;
  }

  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? gitQuiet(['rev-parse', 'HEAD']);
  if (sha === null) {
    log('no hay SHA (ni VERCEL_GIT_COMMIT_SHA ni git rev-parse); no hago nada');
    return;
  }

  // Idempotente: un re-deploy del mismo commit no vuelve a crear nada, y no
  // pisa lo que alguien ya curo.
  const existing = await db.release.findUnique({ where: { app_sha: { app, sha } } });
  if (existing !== null) {
    log(`${app}@${sha.slice(0, 8)} ya existe (${existing.status}); no toco nada`);
    return;
  }

  const previous = await db.release.findFirst({
    where: { app },
    orderBy: { deployedAt: 'desc' },
    select: { sha: true },
  });
  const previousSha = previous?.sha ?? null;

  // Primer deploy con esto: dejamos la baseline sin entradas. Cualquier ventana
  // que eligieramos aca ("los ultimos 20 commits") seria inventada.
  if (previousSha === null) {
    await db.release.create({ data: { app, sha, previousSha: null } });
    log(`${app}: baseline creada en ${sha.slice(0, 8)} — el proximo deploy ya trae notas`);
    return;
  }

  if (!ensureCommitReachable(previousSha)) {
    await db.release.create({ data: { app, sha, previousSha } });
    log(
      `${app}: no alcance ${previousSha.slice(0, 8)} en el clone; release sin entradas ` +
        '(revisar si hace falta un git fetch --deepen en el buildCommand)',
    );
    return;
  }

  const commits = readCommits(previousSha, sha);
  log(`${app}: ${commits.length} commits en ${previousSha.slice(0, 8)}..${sha.slice(0, 8)}`);

  const notes = commits
    .map((commit) => toNote(commit))
    .filter((note): note is CommitNote => note !== null);

  const skipped = commits.length - notes.length;
  if (skipped > 0) log(`${skipped} descartados por tipo interno (chore/docs/refactor/style/...)`);

  await db.release.create({
    data: {
      app,
      sha,
      previousSha,
      entries: {
        create: notes.map((note, index) => {
          const { module, mapped } = moduleForScope(note.scope);
          return {
            kind: note.kind as ReleaseNoteKind,
            commitSha: note.sha,
            commitScope: note.scope,
            module,
            audiences: note.audiences.map(
              (a) => a.toUpperCase() as ReleaseAudience,
            ),
            textEs: note.subject,
            // El ingles hay que escribirlo: los commits estan en español.
            textEn: null,
            hidden: note.hidden,
            // `!mapped` = el scope no esta en SCOPE_TO_MODULE y cayo en `other`.
            needsReview: note.needsReview || !mapped,
            sortOrder: index,
          };
        }),
      },
    },
  });

  const review = notes.filter((note) => note.needsReview).length;
  const hidden = notes.filter((note) => note.hidden).length;
  log(
    `${app}: DRAFT con ${notes.length} entradas — ${review} para revisar, ` +
      `${hidden} ocultas por sensibles`,
  );
}

main()
  .catch((error: unknown) => {
    // A proposito: se loguea y se sigue. El build no se cae por esto.
    log(`falla no fatal: ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(() => {
    void db.$disconnect();
  });

/**
 * Reclasifica las notas de release que quedaron esperando revision.
 *
 * `build-release-notes.ts` decide tres cosas por cada commit —modulo, audiencia
 * y si es sensible— y marca `needsReview` cuando no pudo con alguna. Ese juicio
 * queda congelado en la fila el dia del deploy, asi que corregir el mapa de
 * scopes no destapa nada por si solo: hay que volver a pasar por lo ya escrito.
 * Eso hace esto.
 *
 *   pnpm --filter=@precision-medical/database release:backfill            (simulacro)
 *   pnpm --filter=@precision-medical/database release:backfill -- --apply
 *
 * Sin `--apply` no escribe una sola fila: son ~150 filas de produccion y el
 * simulacro imprime exactamente lo que cambiaria.
 *
 * SOLO toca filas con `needsReview = true`. Una nota que ya se le mostro a
 * alguien es inmutable —el PATCH de /api/admin/releases la rechaza con 409 por
 * esta misma razon— y volver a ocultarla no la des-muestra. Si algo ya salio y
 * hay que revisarlo, se revisa a mano.
 *
 * Pide el repo con historia: los paths de cada commit salen de `git show`. En
 * un clone shallow saltea lo que no alcanza y lo dice al final.
 */
import { execFileSync } from 'node:child_process';
import { db } from '../src/index';
// Subpaths y no el barrel: el barrel exporta `update-banner.tsx`, que es
// 'use client' y arrastraria React a un script de Node.
import { moduleForScope } from '@precision/release/modules';
import { audiencesForPaths, isSensitive } from '@precision/release/commit';
import type { ReleaseAudience } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

/**
 * `--app <nombre>` acota el backfill a una sola app. Sin el, toca todas.
 *
 * Existe porque las apps no van al mismo ritmo: `back-office` sirve los tres
 * portales y ya muestra el modal, mientras que `forms` acumulo releases sin
 * tener siquiera banner. Destapar sus notas no le llega a nadie.
 */
function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i === -1 || i === process.argv.length - 1 ? null : process.argv[i + 1]!;
}

const APP = argValue('--app');

function log(msg: string): void {
  console.log(`[backfill] ${msg}`);
}

/** Paths que toco un commit. `null` = el commit no esta en este clone. */
const cachePaths = new Map<string, string[] | null>();
function pathsDe(sha: string): string[] | null {
  const visto = cachePaths.get(sha);
  if (visto !== undefined) return visto;

  let paths: string[] | null;
  try {
    const raw = execFileSync('git', ['show', '--name-only', '--format=', sha], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    paths = raw.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  } catch {
    paths = null;
  }
  cachePaths.set(sha, paths);
  return paths;
}

interface Fila {
  id: string;
  commitSha: string;
  commitScope: string | null;
  textEs: string;
  module: string;
  audiences: ReleaseAudience[];
  hidden: boolean;
  needsReview: boolean;
  release: { app: string; status: string };
}

/** Lo que la clasificacion de hoy diria de esta fila. */
function reclasificar(fila: Fila): {
  module: string;
  audiences: ReleaseAudience[];
  hidden: boolean;
  needsReview: boolean;
} | null {
  const paths = pathsDe(fila.commitSha);
  if (paths === null) return null;

  const { module, mapped } = moduleForScope(fila.commitScope);
  const { audiences, ambiguous } = audiencesForPaths(paths);
  const hidden = isSensitive(fila.commitScope, fila.textEs);

  return {
    module,
    audiences: audiences.map((a) => a.toUpperCase() as ReleaseAudience),
    hidden,
    // Misma formula que el build: `toNote()` mas el `|| !mapped` que agrega
    // build-release-notes al guardar.
    needsReview: ambiguous || hidden || audiences.length === 0 || !mapped,
  };
}

const esVisible = (f: { hidden: boolean; needsReview: boolean; release: { status: string } }): boolean =>
  f.release.status === 'PUBLISHED' && !f.hidden && !f.needsReview;

async function main(): Promise<void> {
  log(APP === null ? 'todas las apps' : `solo app=${APP}`);
  log(APPLY ? 'MODO ESCRITURA (--apply)' : 'simulacro — no escribe nada (usa --apply para aplicar)');

  const todas = (await db.releaseEntry.findMany({
    ...(APP === null ? {} : { where: { release: { app: APP } } }),
    select: {
      id: true, commitSha: true, commitScope: true, textEs: true,
      module: true, audiences: true, hidden: true, needsReview: true,
      release: { select: { app: true, status: true } },
    },
  })) as Fila[];

  const pendientes = todas.filter((f) => f.needsReview);
  log(`${todas.length} entradas en total · ${pendientes.length} esperando revision`);

  const destapadas: Fila[] = [];
  const ocultadas: Fila[] = [];
  const siguen: Fila[] = [];
  const inalcanzables: Fila[] = [];
  const cambios = new Map<string, ReturnType<typeof reclasificar>>();

  for (const fila of pendientes) {
    const nuevo = reclasificar(fila);
    if (nuevo === null) { inalcanzables.push(fila); continue; }

    cambios.set(fila.id, nuevo);
    if (nuevo.hidden && !fila.hidden) ocultadas.push(fila);
    else if (!nuevo.needsReview) destapadas.push(fila);
    else siguen.push(fila);
  }

  const linea = (f: Fila): string => {
    const n = cambios.get(f.id);
    const mod = n && n.module !== f.module ? `${f.module}→${n.module}` : f.module;
    return `    [${(f.commitScope ?? '-').padEnd(18)}] ${mod.padEnd(22)} ${f.textEs.slice(0, 60)}`;
  };

  console.log(`\n  ── SE OCULTAN por sensibles (${ocultadas.length}) ──`);
  ocultadas.forEach((f) => console.log(linea(f)));

  console.log(`\n  ── SE DESTAPAN (${destapadas.length}) ──`);
  destapadas.forEach((f) => console.log(linea(f)));

  // Se listan una por una: es la cola de curacion que queda, y un "7 pendientes"
  // suelto no le dice a nadie adonde tiene que ir a mirar.
  console.log(`\n  ── siguen esperando ojo humano (${siguen.length}) ──`);
  siguen.forEach((f) => console.log(linea(f)));
  console.log(`  ── sin commit en este clone: ${inalcanzables.length} ──`);

  // Antes / despues de lo que cada audiencia veria.
  const AUDS: ReleaseAudience[] = ['ADMIN', 'DOCTOR', 'ATTORNEY', 'CLINIC', 'TIMECLOCK'];
  const apps = [...new Set(todas.map((f) => f.release.app))].sort();
  console.log('\n  ── notas visibles por app y audiencia ──');
  for (const app of apps) {
    const deLaApp = todas.filter((f) => f.release.app === app);
    const partes = AUDS.map((a) => {
      const antes = deLaApp.filter((f) => esVisible(f) && f.audiences.includes(a)).length;
      const despues = deLaApp.filter((f) => {
        const n = cambios.get(f.id);
        const est = n ?? { hidden: f.hidden, needsReview: f.needsReview, audiences: f.audiences };
        return esVisible({ ...est, release: f.release }) && est.audiences.includes(a);
      }).length;
      return `${a} ${antes}→${despues}`;
    });
    console.log(`    ${app.padEnd(14)} ${partes.join('  ·  ')}`);
  }

  if (!APPLY) {
    console.log('\n  simulacro: no se escribio nada. Volve a correr con --apply.');
    return;
  }

  let escritas = 0;
  for (const [id, nuevo] of cambios) {
    if (nuevo === null) continue;
    await db.releaseEntry.update({
      where: { id },
      data: {
        module: nuevo.module,
        audiences: nuevo.audiences,
        hidden: nuevo.hidden,
        needsReview: nuevo.needsReview,
      },
    });
    escritas++;
  }
  log(`${escritas} filas actualizadas`);
}

main()
  .catch((err) => { console.error('[backfill] fallo:', err); process.exitCode = 1; })
  .finally(() => void db.$disconnect());

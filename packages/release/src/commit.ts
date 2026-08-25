import type { Audience } from './audience';
import { AUDIENCES } from './audience';

/**
 * Parseo de commits → notas de release.
 *
 * Puro a proposito: lo usa el script del build (Node) y tambien la API, sin
 * arrastrar `child_process` ni Prisma a un paquete que importan componentes
 * client.
 */

/** Tipos que se publican, y con que icono. */
const PUBLISHABLE_TYPES: Record<string, 'FEAT' | 'FIX'> = {
  feat: 'FEAT',
  fix: 'FIX',
  // `perf` y `i18n` los ve el usuario —"las pantallas de acceso van siempre en
  // ingles" es un cambio visible— asi que se publican como mejora.
  perf: 'FEAT',
  i18n: 'FEAT',
};

/**
 * `chore`, `ci`, `deps`, `docs`, `refactor`, `style` y `test` no se publican:
 * nadie en recepcion necesita leer "refactor(ui): de 19 bordes a 4".
 */
export function isPublishableType(type: string): boolean {
  return type.toLowerCase() in PUBLISHABLE_TYPES;
}

/**
 * Scopes que llegan OCULTOS por defecto.
 *
 * `fix(security): el Admin dejaba ver plata a cualquiera con sesion iniciada`
 * le regala el mapa a cualquiera que lea el banner. No se descartan —quedan en
 * la tabla con `hidden`— para no perder el registro.
 */
const SENSITIVE_SCOPES = new Set(['security', 'permissions', 'cifrado']);

/**
 * Red conservadora sobre el asunto, para el commit sensible que no vino con
 * scope de seguridad. Solo marca `hidden`; la decision final es de quien cura.
 */
const SENSITIVE_HINTS = [
  'agujero',
  'sin sesion',
  'sin permiso',
  'cualquiera',
  'expon',
  'filtra',
  'bypass',
  'escalada',
  'leak',
  // OJO: 'token' NO va aca. En este repo son design tokens —"el amarillo y el
  // rosa del Excel de Edson, como token por tema"— y ocultaba cambios de color.
  'secret',
];

export interface ParsedCommit {
  sha: string;
  type: string;
  scope: string | null;
  subject: string;
  /** Archivos que toco, relativos a la raiz del repo. */
  paths: string[];
}

export interface CommitNote {
  sha: string;
  kind: 'FEAT' | 'FIX';
  scope: string | null;
  subject: string;
  audiences: Audience[];
  hidden: boolean;
  /** El borrador necesita ojo humano: scope sin mapear o audiencia ambigua. */
  needsReview: boolean;
}

// Capturas posicionales, no con nombre: las apps compilan a ES2017 y los
// grupos con nombre piden ES2018 (TS1503).
//   1 = tipo, 2 = scope (opcional), 3 = asunto
const HEADER_RE = /^([a-z0-9]+)(?:\(([^)]*)\))?!?:\s*(.+)$/i;

export function parseHeader(
  header: string,
): { type: string; scope: string | null; subject: string } | null {
  const match = HEADER_RE.exec(header.trim());
  if (match === null) return null;

  const [, type, rawScope, subject] = match;
  const scope = rawScope === undefined || rawScope.trim() === '' ? null : rawScope.trim();

  return {
    type: type.toLowerCase(),
    scope: scope === null ? null : scope.toLowerCase(),
    subject: subject.trim(),
  };
}

export function isSensitive(scope: string | null, subject: string): boolean {
  if (scope !== null && SENSITIVE_SCOPES.has(scope)) return true;
  const lower = subject.toLowerCase();
  return SENSITIVE_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Reglas path → audiencia, en orden: gana la primera que matchea.
 *
 * La audiencia sale de los ARCHIVOS, no del scope. `feat(ui): primitivo
 * Section` toca `packages/ui` y le afecta a todos; el scope no lo dice.
 *
 * `ambiguous` marca las reglas que son una suposicion —codigo compartido que
 * podria ser de cualquiera de los portales— para que el borrador lo pida revisar.
 */
/**
 * Reglas path → audiencia, en dos niveles.
 *
 * La audiencia sale de los ARCHIVOS, no del scope: `feat(ui): primitivo
 * Section` toca `packages/ui` y le afecta a todos, y el scope no lo dice.
 *
 * PERO el nivel importa. Casi todos los commits tocan de paso un
 * `packages/i18n/messages/*.json` o el schema de Prisma, y si eso abriera el
 * abanico a las 6 audiencias, un cambio de `tracking` terminaria marcado como
 * global. Entonces:
 *
 *   - `specific`: una ruta de un portal. Si matchea aunque sea una, GANA y las
 *     demas no cuentan — el commit es de ese portal, por mas archivos
 *     compartidos que haya tocado al pasar.
 *   - `broad`: codigo compartido de verdad (`packages/api`, `packages/ui`, el
 *     cuerpo de una app). Solo decide cuando NO hay ninguna `specific`, y en
 *     ese caso queda para revisar.
 *   - lo que no esta en ninguna lista (i18n, prisma, configs, docs, CI) no da
 *     señal: no suma audiencias ni las quita.
 */
interface AudienceRule {
  prefix: string;
  audiences: Audience[];
}

/** Rutas de un portal concreto. Ganan sobre todo lo demas. */
const SPECIFIC_RULES: AudienceRule[] = [
  // back-office sirve TRES audiencias desde tres route groups.
  { prefix: 'apps/back-office/app/(admin)/', audiences: ['admin'] },
  { prefix: 'apps/back-office/app/doctor-print/', audiences: ['doctor'] },
  { prefix: 'apps/back-office/app/doctor/', audiences: ['doctor'] },
  { prefix: 'apps/back-office/app/attorney/', audiences: ['attorney'] },

  // clinical: consulta del doctor vs mostrador.
  { prefix: 'apps/clinical/app/visit/', audiences: ['doctor'] },
  { prefix: 'apps/clinical/app/doctor/', audiences: ['doctor'] },
  { prefix: 'apps/clinical/app/checkin/', audiences: ['clinic'] },
  { prefix: 'apps/clinical/app/triage/', audiences: ['clinic', 'doctor'] },

  // forms mezcla rutas internas con rutas de paciente.
  { prefix: 'apps/forms/app/intake/', audiences: ['patient'] },
  { prefix: 'apps/forms/app/cita/', audiences: ['patient'] },
  { prefix: 'apps/forms/app/c/', audiences: ['patient'] },
  { prefix: 'apps/forms/app/lobby/', audiences: ['clinic'] },
  { prefix: 'apps/forms/app/walkin/', audiences: ['clinic'] },

  { prefix: 'apps/attorney/app/', audiences: ['attorney'] },
  { prefix: 'apps/timeclock/app/', audiences: ['timeclock'] },
  { prefix: 'apps/web/app/', audiences: ['admin'] },
];

/**
 * Cuerpo de UNA app, sin ruta de portal. La audiencia sigue siendo acotada
 * —`apps/clinical/**` es de la clinica y del doctor, de nadie mas— asi que NO
 * pide revision: es un default sano, no una duda.
 *
 * Distinguirlo de lo cross-app importa: marcar como dudoso todo lo que tocaba
 * codigo compartido dejaba 88 de ~200 notas esperando aprobacion, y una cola de
 * ese tamaño no se atiende.
 */
const APP_RULES: AudienceRule[] = [
  { prefix: 'apps/back-office/', audiences: ['admin', 'doctor', 'attorney'] },
  { prefix: 'apps/clinical/', audiences: ['clinic', 'doctor'] },
  { prefix: 'apps/forms/', audiences: ['clinic', 'patient'] },
  { prefix: 'apps/attorney/', audiences: ['attorney'] },
  { prefix: 'apps/timeclock/', audiences: ['timeclock'] },
  { prefix: 'apps/web/', audiences: ['admin'] },
];

/**
 * Paquetes compartidos: le pegan a TODOS. Eso si pide revision — el texto de
 * un commit de `packages/**` suele estar escrito para quien programa
 * ("primitivo Section") y no le dice nada a recepcion.
 */
const SHARED_RULES: AudienceRule[] = [
  { prefix: 'packages/api/', audiences: [...AUDIENCES] },
  { prefix: 'packages/auth/', audiences: [...AUDIENCES] },
  { prefix: 'packages/ui/', audiences: [...AUDIENCES] },
  { prefix: 'packages/release/', audiences: [...AUDIENCES] },
];

function collect(paths: string[], rules: AudienceRule[]): Set<Audience> {
  const found = new Set<Audience>();
  for (const path of paths) {
    // `git log --name-only` siempre reporta paths POSIX con `/`, incluso en
    // Windows, asi que los prefijos se comparan tal cual.
    const rule = rules.find((r) => path.startsWith(r.prefix));
    if (rule === undefined) continue;
    for (const audience of rule.audiences) found.add(audience);
  }
  return found;
}

export function audiencesForPaths(paths: string[]): {
  audiences: Audience[];
  ambiguous: boolean;
} {
  const specific = collect(paths, SPECIFIC_RULES);
  if (specific.size > 0) {
    return { audiences: AUDIENCES.filter((a) => specific.has(a)), ambiguous: false };
  }

  const app = collect(paths, APP_RULES);
  if (app.size > 0) {
    return { audiences: AUDIENCES.filter((a) => app.has(a)), ambiguous: false };
  }

  const shared = collect(paths, SHARED_RULES);
  if (shared.size > 0) {
    return { audiences: AUDIENCES.filter((a) => shared.has(a)), ambiguous: true };
  }

  // Solo archivos sin señal (i18n, prisma, configs, docs): no sabemos a quien
  // le toca, asi que no se lo mostramos a nadie hasta que alguien lo revise.
  return { audiences: [], ambiguous: true };
}

/** `null` = el commit no se publica (tipo interno o header que no parsea). */
export function toNote(commit: ParsedCommit): CommitNote | null {
  const kind = PUBLISHABLE_TYPES[commit.type];
  if (kind === undefined) return null;

  const { audiences, ambiguous } = audiencesForPaths(commit.paths);
  const hidden = isSensitive(commit.scope, commit.subject);

  return {
    sha: commit.sha,
    kind,
    scope: commit.scope,
    subject: commit.subject,
    audiences,
    hidden,
    needsReview: ambiguous || hidden || audiences.length === 0,
  };
}

import type { Audience } from './audience';
import { AUDIENCES } from './audience';
import { audiencesForModule, moduleForScope } from './modules';

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
const SENSITIVE_SCOPES = new Set([
  'security',
  'permissions',
  'cifrado',
  // Los commits de este repo se escriben en español, así que la red en inglés
  // no atrapaba nada: `hidden` estuvo en 0 en toda la tabla. Las ocho notas de
  // `seguridad` —"cerrar las puertas publicas del back-office", "el alcance del
  // portal medico sale de la sesion y no de la URL"— quedaron tapadas de
  // casualidad, porque su scope tampoco estaba en el mapa de modulos. Al
  // mapearlo se destapaban solas, que es justo lo que este archivo evita.
  //
  // `cifrado` ya estaba: la lista nacio traducida a medias.
  //
  // NO van aca `auth` ni `activacion`. Son scopes de uso diario ("el login no
  // recordaba el email") y ocultarlos por las dudas apaga media docena de notas
  // legitimas. Aca va el equivalente exacto de los tres de arriba, nada mas.
  'seguridad',
  'permisos',
  'accesos',
]);

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
  /**
   * Linea en INGLES que el autor escribio en el cuerpo del commit, con el
   * trailer `Release-EN:`. `null` si no la puso.
   */
  textEn: string | null;
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
  /** El ingles escrito a mano por el autor. `null` = se muestra el español. */
  textEn: string | null;
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

/**
 * Recorte por modulo: los paths dijeron a QUIEN pudo afectarle, y el modulo
 * dice DONDE se ve. Se queda la interseccion.
 *
 * Nunca agrega audiencias — si el commit no toco el portal legal, que el modulo
 * se vea ahi no lo convierte en una novedad para el bufete. Y nunca vacia la
 * lista: si el modulo y los paths no se cruzan, mandan los paths y la entrada
 * queda `needsReview`. Un cruce vacio significa que uno de los dos esta mal, y
 * de las dos respuestas posibles la unica que no pierde informacion es mostrar
 * de mas.
 */
function narrowByModule(
  audiences: Audience[],
  module: string | undefined,
): { audiences: Audience[]; narrowed: boolean; conflict: boolean } {
  if (module === undefined) return { audiences, narrowed: false, conflict: false };

  const visible = audiencesForModule(module);
  if (visible === null) return { audiences, narrowed: false, conflict: false };

  const cruce = audiences.filter((a) => visible.includes(a));
  if (cruce.length === 0) return { audiences, narrowed: false, conflict: true };

  return { audiences: cruce, narrowed: cruce.length < audiences.length, conflict: false };
}

/**
 * @param module Clave de modulo (`moduleForScope(scope).module`). Opcional: sin
 *   ella el resultado es el de siempre, solo por paths.
 */
export function audiencesForPaths(
  paths: string[],
  module?: string,
): {
  audiences: Audience[];
  ambiguous: boolean;
} {
  const specific = collect(paths, SPECIFIC_RULES);
  if (specific.size > 0) {
    // Una ruta de portal es la señal mas fuerte que hay: el commit vive ahi
    // dentro. No se recorta por modulo — seria discutirle al dato duro.
    return { audiences: AUDIENCES.filter((a) => specific.has(a)), ambiguous: false };
  }

  const app = collect(paths, APP_RULES);
  if (app.size > 0) {
    const techo = AUDIENCES.filter((a) => app.has(a));
    const { audiences, conflict } = narrowByModule(techo, module);
    return { audiences, ambiguous: conflict };
  }

  const shared = collect(paths, SHARED_RULES);
  if (shared.size > 0) {
    const techo = AUDIENCES.filter((a) => shared.has(a));
    const { audiences } = narrowByModule(techo, module);
    // Codigo compartido sigue pidiendo ojo humano aunque el modulo lo haya
    // acotado: lo dudoso ahi no es a quien le llega, es que el texto del commit
    // suele estar escrito para quien programa.
    return { audiences, ambiguous: true };
  }

  // Solo archivos sin señal (i18n, prisma, configs, docs): no sabemos a quien
  // le toca, asi que no se lo mostramos a nadie hasta que alguien lo revise.
  return { audiences: [], ambiguous: true };
}

/** `null` = el commit no se publica (tipo interno o header que no parsea). */
export function toNote(commit: ParsedCommit): CommitNote | null {
  const kind = PUBLISHABLE_TYPES[commit.type];
  if (kind === undefined) return null;

  const { module } = moduleForScope(commit.scope);
  const { audiences, ambiguous } = audiencesForPaths(commit.paths, module);
  const hidden = isSensitive(commit.scope, commit.subject);

  return {
    sha: commit.sha,
    kind,
    scope: commit.scope,
    subject: commit.subject,
    textEn: commit.textEn,
    audiences,
    hidden,
    needsReview: ambiguous || hidden || audiences.length === 0,
  };
}
/**
 * El ingles de la nota, escrito por el autor en el cuerpo del commit:
 *
 *   fix(citas): el QR de firma se leia como un glifo roto
 *
 *   Release-EN: the signature QR read as a broken glyph
 *
 * Vive ACA y no en el script del build —donde estaba— porque es parseo de
 * commit, como `parseHeader`, y porque ahi no se podia testear: la unica prueba
 * posible era re-tipear la funcion en otro archivo, y eso probo una COPIA
 * mientras la de verdad tenia la regex rota. Exportada se prueba la real.
 *
 * Reemplaza al traductor por LLM, que le pedia a un modelo que ADIVINARA que
 * quiso decir una linea corta y jergosa en español, cuando quien escribio el
 * commit sabe exactamente que cambio. Ademas costaba plata, dependia de la red
 * dentro de una peticion de lectura, y fallaba en SILENCIO: el modelo llevaba
 * meses muerto (404) y las 318 notas tenian `textEn` en NULL.
 *
 * Es OPCIONAL: sin trailer se cae al español, igual que antes.
 */
export function trailerEn(body: string): string | null {
  for (const linea of body.split('\n')) {
    const m = /^\s*Release-EN\s*:\s*(.+?)\s*$/i.exec(linea);
    if (m !== null && m[1] !== undefined && m[1].trim() !== '') return m[1].trim();
  }
  return null;
}

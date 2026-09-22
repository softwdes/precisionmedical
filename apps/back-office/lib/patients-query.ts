/**
 * El `where` de la lista de pacientes, en un solo lugar.
 *
 * Lo escribían por separado el server component (`patients-data.tsx`) y la API
 * (`patients/list`), que son las dos mitades de la MISMA pantalla: la primera
 * pinta el render inicial y la segunda lo refresca al teclear. Dos copias de un
 * filtro que tiene que dar el mismo resultado, y ya se habían desincronizado
 * —`q.trim()` en una y `q` crudo en la otra— con el síntoma más confuso posible:
 * escribir un espacio al final cambiaba los resultados.
 *
 * ## La búsqueda por teléfono
 *
 * Los teléfonos migrados del v2 están CIFRADOS en la base (`e:…`, AES-GCM) y se
 * descifran al pintar, así que un `contains` los compara contra el texto cifrado
 * y no matchea nunca: buscar por teléfono no encontraba a ningún paciente
 * migrado. Y el cifrado no es determinista, o sea que tampoco se puede cifrar el
 * término para compararlo.
 *
 * La salida es un segundo pase, y solo cuando hace falta: si el término tiene
 * pinta de teléfono, se traen `id + phone + phone2` de las filas que siguen
 * cifradas, se descifran en memoria y se comparan POR DÍGITOS. Eso arregla de
 * paso el otro problema del `contains`: `(305) 555-1234` guardado no lo
 * encontraba nadie escribiendo `3055551234`, ni al revés.
 *
 * Y había un segundo agujero, más grande y más silencioso: los teléfonos EN
 * CLARO conviven en dos formatos —`(385) 244-7519` y `3852048651`—, así que el
 * `contains` encontraba a alguien sólo si la puntuación que tecleabas era la
 * misma con la que se había cargado esa ficha. Nadie puede saber eso. Ahora
 * los dos lados se comparan por dígitos; el detalle está en
 * `idsPorTelefonoEnDigitos`.
 *
 * Es un parche acotado, no la solución final: lo correcto es una columna
 * normalizada e indexada (`phoneDigits`) que se escriba en cada guardado. Eso
 * necesita migración y backfill — anotado en `pending-tasks.md`.
 *
 * ## La búsqueda por fecha de nacimiento
 *
 * En el mostrador buscan por nombre **o por fecha de nacimiento**, y la fecha
 * no estaba en la consulta: devolvía cero, que se lee como "ese paciente no
 * existe". El intérprete del término vive en `lib/fecha-buscada.ts`, que es
 * donde está explicado por qué el día/mes se lee de las dos formas y por qué
 * el rango va en UTC.
 */

import { db, type Prisma } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec, isCipher } from './decrypt';
import { separarFecha, clausulasDeFecha } from './fecha-buscada';
import { idsPorTelefono, soloDigitos, MIN_DIGITOS_TELEFONO } from './telefono-buscado';
// Los valores y sus guardas viven aparte: los comparte el client component que
// pinta los titulos ordenables de la tabla, y este archivo importa `db`.
import type { OrdenPacientes, TipoDeCaso } from './patients-orden';

export type { OrdenPacientes, TipoDeCaso } from './patients-orden';

export interface FiltroPacientes {
  q?: string;
  inactiveOnly: boolean;
  /** Portal médico: recorte a los pacientes de este provider. */
  providerId?: string | null;
  /**
   * Solo los pacientes con al menos un caso de este tipo. `undefined` = todos.
   *
   * Filtra por el CASO y no por el paciente porque el tipo vive en el caso: una
   * persona puede tener un MVA y un GM a la vez, y con este filtro aparece en
   * las dos listas. Es lo correcto — no hay "pacientes MVA", hay pacientes con
   * un caso MVA.
   */
  caseType?: TipoDeCaso;
}

/**
 * El `orderBy` de Prisma para cada orden. Vive acá por el mismo motivo que el
 * filtro: lo piden el render del servidor y la API, y si divergen la lista
 * "salta" al montar el cliente.
 *
 * El desempate por `id` no es un adorno: sin él, dos pacientes con el mismo
 * apellido —o creados en el mismo milisegundo, que pasa en las migraciones—
 * pueden salir en distinto orden en cada página y repetirse o desaparecer al
 * paginar.
 */
export function ordenPacientes(orden: OrdenPacientes): Prisma.PatientOrderByWithRelationInput[] {
  switch (orden) {
    case 'antiguo':    return [{ createdAt: 'asc' },  { id: 'asc' }];
    case 'nombre':     return [{ lastName: 'asc' },  { firstName: 'asc' },  { id: 'asc' }];
    case 'nombreDesc': return [{ lastName: 'desc' }, { firstName: 'desc' }, { id: 'asc' }];
    default:           return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}

/**
 * Qué es "mi paciente" para un provider: **lo atiendo o lo traje yo**.
 *
 * Era solo lo primero (`appointments.some`), y con eso el alta rápida del
 * portal —que el provider ahora tiene— quedaba en un callejón: daba de alta a
 * un paciente, el paciente todavía no tenía ninguna cita, y por lo tanto no
 * aparecía en su lista ni podía abrir su ficha. Creaba algo que no podía ver.
 *
 * `providerReferrerId` es el provider que REFIRIÓ al paciente, ya existe y está
 * indexado; el alta desde el portal lo sella con el provider de la sesión. Que
 * también lo vea quien lo trajo es la misma regla, no una excepción.
 *
 * Se usa igual para la lista y para el guard de la ficha — `lib/patient-access`
 * importa esta función para no escribir la regla dos veces.
 */
export function alcanceDelProvider(providerId?: string | null): Prisma.PatientWhereInput {
  if (!providerId) return {};
  return {
    OR: [
      { appointments: { some: { providerId } } },
      { providerReferrerId: providerId },
    ],
  };
}

/**
 * Ids cuyo teléfono CIFRADO coincide con estos dígitos.
 *
 * El universo se acota a las filas que siguen cifradas (`e:` o `…|e:`), que es
 * un filtro que sí sabe hacer la base. Se piden dos columnas y nada más.
 *
 * Hoy no hay ninguna fila así —una descifrada masiva del 2026-09-12 vació el
 * sobre `e:` de toda la tabla—, pero la función se queda: el filtro no devuelve
 * nada y no cuesta nada, y si mañana vuelve a entrar data cifrada del v2 la
 * búsqueda sigue encontrándola en vez de empezar a fallar callada.
 */
async function idsPorTelefonoCifrado(
  digitos: string,
  alcance: Prisma.PatientWhereInput,
): Promise<string[]> {
  const cifradas: Prisma.PatientWhereInput = {
    OR: [
      { phone:  { startsWith: 'e:' } },
      { phone2: { startsWith: 'e:' } },
      { phone:  { contains: '|e:' } },
      { phone2: { contains: '|e:' } },
    ],
  };

  const filas = await db.patient.findMany({
    where: { AND: [alcance, cifradas] },
    select: { id: true, phone: true, phone2: true },
  });

  return filas
    .filter(f =>
      [f.phone, f.phone2].some(v =>
        isCipher(v) && soloDigitos(dec(v)).includes(digitos),
      ),
    )
    .map(f => f.id);
}

/**
 * El filtro completo de la lista. Es `async` por el segundo pase del teléfono:
 * sin término numérico no consulta nada de más.
 */
export async function wherePacientes(
  { q, inactiveOnly, providerId, caseType }: FiltroPacientes,
): Promise<Prisma.PatientWhereInput> {
  const statusFilter: Prisma.PatientWhereInput = inactiveOnly
    ? { status: 'INACTIVE' }
    : { NOT: { status: 'INACTIVE' } };

  const providerScope = alcanceDelProvider(providerId);

  /* El tipo de caso entra como un filtro más del AND: se combina con el término
     y con el recorte del provider en vez de competir con ellos. */
  const porTipo: Prisma.PatientWhereInput[] = caseType
    ? [{ cases: { some: { caseType, deletedAt: null } } }]
    : [];

  const termino = (q ?? '').trim();
  if (!termino) return { AND: [statusFilter, providerScope, ...porTipo] };

  /**
   * La fecha de nacimiento se saca del término ANTES de buscar el nombre.
   *
   * Va en `AND` y no adentro del `OR`, que es la diferencia entre filtrar y
   * ensuciar: `Maria 05/12/1980` tiene que ser "las Marías nacidas ese día",
   * no "todo lo que se parezca a Maria más todos los nacidos ese día". Así el
   * dato extra que escriben para desambiguar sirve para desambiguar.
   *
   * Antes de esto, ese mismo término devolvía CERO —el partido en dos pedía un
   * apellido que contuviera "05/12/1980"—, o sea que escribir el nombre bien
   * **con** la fecha al lado encontraba menos que escribir sólo el nombre.
   */
  const { fechas, resto } = separarFecha(termino);
  const porFecha: Prisma.PatientWhereInput[] = fechas.length
    ? [{ OR: clausulasDeFecha(fechas) }]
    : [];

  // Sólo la fecha: no queda texto que buscar, y ese es todo el filtro.
  if (porFecha.length && !resto) {
    return { AND: [statusFilter, providerScope, ...porTipo, ...porFecha] };
  }

  const partes = resto.split(/\s+/).filter(Boolean);
  const nombreCompleto: Prisma.PatientWhereInput[] = partes.length >= 2
    ? [
        { firstName: { contains: partes[0]!, mode: 'insensitive' }, lastName: { contains: partes[partes.length - 1]!, mode: 'insensitive' } },
        { firstName: { contains: partes[partes.length - 1]!, mode: 'insensitive' }, lastName: { contains: partes[0]!, mode: 'insensitive' } },
      ]
    : [];

  const digitos = soloDigitos(resto);
  const alcance: Prisma.PatientWhereInput = { AND: [statusFilter, providerScope] };
  /**
   * Los dos pases del teléfono, en paralelo: el de los guardados en claro (con
   * la puntuación que sea) y el de los que quedaron cifrados. Los ids salen
   * juntos y el `AND` de afuera les vuelve a aplicar estado y alcance, así que
   * ninguno de los dos puede colar un paciente que no corresponde ver.
   */
  const porTelefono = digitos.length >= MIN_DIGITOS_TELEFONO
    ? (await Promise.all([
        idsPorTelefono(digitos),
        idsPorTelefonoCifrado(digitos, alcance),
      ])).flat()
    : [];

  return {
    AND: [
      statusFilter,
      providerScope,
      ...porTipo,
      ...porFecha,
      {
        OR: [
          ...nombreCompleto,
          { firstName:   { contains: resto, mode: 'insensitive' } },
          { lastName:    { contains: resto, mode: 'insensitive' } },
          { email:       { contains: resto, mode: 'insensitive' } },
          { phone:       { contains: resto, mode: 'insensitive' } },
          { phone2:      { contains: resto, mode: 'insensitive' } },
          { patientCode: { contains: resto, mode: 'insensitive' } },
          ...(porTelefono.length ? [{ id: { in: porTelefono } }] : []),
        ],
      },
    ],
  };
}

/**
 * El alcance sin término — para los contadores de las pestañas.
 *
 * El tipo de caso SÍ entra acá: con el filtro MVA puesto, la pestaña
 * "Archivados" tiene que decir cuántos MVA archivados hay, no cuántos
 * archivados hay en total. Si no, el número de la pestaña contradice a la
 * lista que se ve al hacerle clic.
 */
export function alcanceBase(
  { inactiveOnly, providerId, caseType }: Omit<FiltroPacientes, 'q'>,
): Prisma.PatientWhereInput {
  return {
    AND: [
      inactiveOnly ? { status: 'INACTIVE' } : { NOT: { status: 'INACTIVE' } },
      alcanceDelProvider(providerId),
      ...(caseType ? [{ cases: { some: { caseType, deletedAt: null } } }] : []),
    ],
  };
}

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
 * Es un parche acotado, no la solución final: lo correcto es una columna
 * normalizada e indexada (`phoneDigits`) que se escriba en cada guardado. Eso
 * necesita migración y backfill — anotado en `pending-tasks.md`.
 */

import { db, type Prisma } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec, isCipher } from './decrypt';

/** Mínimo de dígitos para tratar el término como un teléfono. */
const MIN_DIGITOS_TELEFONO = 7;

const soloDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export interface FiltroPacientes {
  q?: string;
  inactiveOnly: boolean;
  /** Portal médico: solo pacientes con al menos una cita de este provider. */
  providerId?: string | null;
}

/**
 * Ids cuyo teléfono CIFRADO coincide con estos dígitos.
 *
 * El universo se acota a las filas que siguen cifradas (`e:` o `…|e:`), que es
 * un filtro que sí sabe hacer la base. Se piden dos columnas y nada más.
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
  { q, inactiveOnly, providerId }: FiltroPacientes,
): Promise<Prisma.PatientWhereInput> {
  const statusFilter: Prisma.PatientWhereInput = inactiveOnly
    ? { status: 'INACTIVE' }
    : { NOT: { status: 'INACTIVE' } };

  const providerScope: Prisma.PatientWhereInput = providerId
    ? { appointments: { some: { providerId } } }
    : {};

  const termino = (q ?? '').trim();
  if (!termino) return { AND: [statusFilter, providerScope] };

  const partes = termino.split(/\s+/).filter(Boolean);
  const nombreCompleto: Prisma.PatientWhereInput[] = partes.length >= 2
    ? [
        { firstName: { contains: partes[0]!, mode: 'insensitive' }, lastName: { contains: partes[partes.length - 1]!, mode: 'insensitive' } },
        { firstName: { contains: partes[partes.length - 1]!, mode: 'insensitive' }, lastName: { contains: partes[0]!, mode: 'insensitive' } },
      ]
    : [];

  const digitos = soloDigitos(termino);
  const alcance: Prisma.PatientWhereInput = { AND: [statusFilter, providerScope] };
  const porTelefono = digitos.length >= MIN_DIGITOS_TELEFONO
    ? await idsPorTelefonoCifrado(digitos, alcance)
    : [];

  return {
    AND: [
      statusFilter,
      providerScope,
      {
        OR: [
          ...nombreCompleto,
          { firstName:   { contains: termino, mode: 'insensitive' } },
          { lastName:    { contains: termino, mode: 'insensitive' } },
          { email:       { contains: termino, mode: 'insensitive' } },
          { phone:       { contains: termino, mode: 'insensitive' } },
          { phone2:      { contains: termino, mode: 'insensitive' } },
          { patientCode: { contains: termino, mode: 'insensitive' } },
          ...(porTelefono.length ? [{ id: { in: porTelefono } }] : []),
        ],
      },
    ],
  };
}

/** El alcance sin término — para los contadores de las pestañas. */
export function alcanceBase(
  { inactiveOnly, providerId }: Omit<FiltroPacientes, 'q'>,
): Prisma.PatientWhereInput {
  return {
    AND: [
      inactiveOnly ? { status: 'INACTIVE' } : { NOT: { status: 'INACTIVE' } },
      providerId ? { appointments: { some: { providerId } } } : {},
    ],
  };
}

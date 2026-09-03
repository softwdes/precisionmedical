/**
 * ¿Quién más usa este teléfono o este correo?
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 *
 * Una familia entera —papá, mamá, hijos, a veces los abuelos— usa el mismo
 * número y el mismo correo. Hoy el sistema lo trata como un duplicado y lo
 * bloquea: "ese correo ya está registrado", "ya existe un paciente con ese
 * nombre y teléfono", y ahí se termina. La recepcionista queda sin salida y el
 * dato del parentesco —que en ese momento lo sabe— se pierde.
 *
 * Este módulo no bloquea: **devuelve a quiénes les llega ese contacto**, para
 * que la pantalla pueda preguntar lo único que importa: ¿es la misma persona, es
 * un familiar, o es una coincidencia?
 *
 * ── Por qué el teléfono se compara normalizado ──────────────────────────────
 *
 * El chequeo viejo comparaba el STRING exacto (`phone: parsed.patient.phone`), y
 * los números están guardados en cinco formatos: 1.425 como `(DDD) DDD-DDDD`,
 * 661 como `DDDDDDDDDD`, más `DDD-DDD-DDDD` y otros. Medido el 2026-09-02:
 * **36 números son el mismo escrito distinto** y el chequeo no los veía.
 *
 * Es decir que hoy el sistema falla en las DOS direcciones — bloquea familias
 * que debería dejar pasar, y deja pasar duplicados reales por una diferencia de
 * paréntesis. Normalizar es el prerequisito de todo lo demás: sin esto el
 * diálogo de vínculo no se dispararía cuando tiene que dispararse.
 *
 * ── Por qué SQL crudo y no Prisma ──────────────────────────────────────────
 *
 * La comparación tiene que ser sobre los dígitos, y para eso hace falta
 * `regexp_replace` en el `WHERE` — Prisma no expresa eso. No hay columna
 * normalizada porque agregarla es DDL, y en este repo el schema se aplica con
 * `db push` (ver la trampa del `@default(cuid())`). Con 6.180 pacientes el
 * escaneo secuencial no se siente; cuando se sienta, la solución es la columna
 * generada + índice, y esta función es el único lugar que hay que cambiar.
 *
 * Se comparan `phone` Y `phone2`: el celular de la mamá aparece tanto como
 * teléfono principal de uno como segundo de otro.
 */

import { db } from '@precision-medical/database';
import { phoneKey } from './phone';

/** Por qué canal coincide este paciente con el contacto consultado. */
export type CanalCoincidente = 'PHONE' | 'EMAIL';

export interface PacienteConEseContacto {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  /** El correo propio del paciente — para distinguir "es su correo" de "lo comparte". */
  email: string | null;
  phone: string | null;
  canales: CanalCoincidente[];
}

interface Consulta {
  phone?: string | null;
  email?: string | null;
  /** Paciente a excluir — al editar, uno no colisiona consigo mismo. */
  excluirPatientId?: string | null;
}

/**
 * Los pacientes que ya usan ese teléfono o ese correo.
 *
 * Devuelve `[]` cuando no hay nada que consultar (sin teléfono útil y sin
 * correo). Ordena por apellido para que la lista se lea como una familia.
 */
export async function quienUsaEsteContacto(
  { phone, email, excluirPatientId }: Consulta,
): Promise<PacienteConEseContacto[]> {
  const clave  = phoneKey(phone);
  const correo = email?.trim().toLowerCase() || null;

  if (!clave && !correo) return [];

  type Fila = {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    email: string | null;
    phone: string | null;
    por_telefono: boolean;
    por_correo: boolean;
  };

  /**
   * `right(regexp_replace(...), 10)` es el equivalente en SQL de `phoneKey`: los
   * últimos 10 dígitos. Si acá se cambia el criterio, hay que cambiarlo en
   * `phone.ts` también — son la misma regla en dos lenguajes, y es la única
   * duplicación que este archivo no puede evitar.
   */
  const filas = await db.$queryRaw<Fila[]>`
    SELECT
      p.id, p."patientCode", p."firstName", p."lastName", p."dateOfBirth",
      p.email, p.phone,
      (${clave} <> '' AND (
         right(regexp_replace(COALESCE(p.phone,  ''), '\\D', '', 'g'), 10) = ${clave} OR
         right(regexp_replace(COALESCE(p.phone2, ''), '\\D', '', 'g'), 10) = ${clave}
      )) AS por_telefono,
      (${correo}::text IS NOT NULL AND lower(p.email) = ${correo}) AS por_correo
    FROM patients p
    WHERE
      (${clave} <> '' AND (
         right(regexp_replace(COALESCE(p.phone,  ''), '\\D', '', 'g'), 10) = ${clave} OR
         right(regexp_replace(COALESCE(p.phone2, ''), '\\D', '', 'g'), 10) = ${clave}
      ))
      OR (${correo}::text IS NOT NULL AND lower(p.email) = ${correo})
    ORDER BY p."lastName" ASC, p."firstName" ASC
    LIMIT 20
  `;

  return filas
    .filter((f) => f.id !== excluirPatientId)
    .map((f) => ({
      id: f.id,
      patientCode: f.patientCode,
      firstName: f.firstName,
      lastName: f.lastName,
      dateOfBirth: f.dateOfBirth,
      email: f.email,
      phone: f.phone,
      canales: [
        ...(f.por_telefono ? ['PHONE' as const] : []),
        ...(f.por_correo   ? ['EMAIL' as const] : []),
      ],
    }));
}

/**
 * ¿Alguno de estos es *la misma persona* y no un familiar?
 *
 * Heurística para ordenar la pregunta, NO para decidir sola: mismo apellido +
 * mismo nombre + el contacto coincide. La decisión siempre la toma quien está
 * dando el alta — dos hermanos pueden llamarse igual (Jr.) y dos personas
 * distintas pueden compartir todo menos la fecha de nacimiento.
 */
export function probableMismaPersona(
  candidatos: PacienteConEseContacto[],
  firstName: string,
  lastName: string,
): PacienteConEseContacto | null {
  const n = firstName.trim().toLowerCase();
  const a = lastName.trim().toLowerCase();
  return candidatos.find(
    (c) => c.firstName.trim().toLowerCase() === n && c.lastName.trim().toLowerCase() === a,
  ) ?? null;
}

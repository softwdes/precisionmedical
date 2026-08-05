/**
 * Buscar pacientes por número de teléfono.
 *
 * Compartido entre el historial de llamadas (que resuelve el "quién llamó" de
 * las filas sin vincular) y el webhook de entrantes (que necesita reconocer al
 * llamante mientras el teléfono suena).
 *
 * La comparación va por los últimos 10 dígitos, normalizados EN SQL de los dos
 * lados: en la base los teléfonos conviven como `(801) 367-9254`, `8013679254`
 * y `+18013679254`, y compararlos crudos no matchea nunca. Es la trampa #1 del
 * plan y la razón por la que esto es una función y no una query suelta.
 *
 * Límite conocido: 8 de 5940 pacientes tienen el teléfono cifrado (`e:`, resto
 * de la migración v2) y no se pueden comparar en SQL. Esos no se reconocen.
 */

import { db } from '@precision-medical/database';
import { phoneKey } from '@/lib/phone';

export interface PatientPhoneMatch {
  id: string;
  patientCode: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  phone2: string | null;
}

/**
 * Devuelve, por cada clave de teléfono pedida, los pacientes que la tienen.
 *
 * Un número puede pertenecer a VARIOS pacientes — 99 números de la base los
 * comparten familias enteras — así que devuelve lista y no un único paciente.
 * Quien llame decide qué hacer con la ambigüedad; asumir el primero en silencio
 * le erraría en ~5% de los casos.
 *
 * Ordenados por `createdAt` desc para que el primero sea estable.
 */
export async function findPatientsByPhoneKeys(
  keys: string[],
): Promise<Map<string, PatientPhoneMatch[]>> {
  const wanted = [...new Set(keys.filter(Boolean))];
  const byKey = new Map<string, PatientPhoneMatch[]>();
  if (wanted.length === 0) return byKey;

  const matches = await db.$queryRaw<PatientPhoneMatch[]>`
    SELECT id, "patientCode", "firstName", "lastName", phone, phone2
    FROM patients
    WHERE right(regexp_replace(coalesce(phone,  ''), '\D', '', 'g'), 10) = ANY(${wanted}::text[])
       OR right(regexp_replace(coalesce(phone2, ''), '\D', '', 'g'), 10) = ANY(${wanted}::text[])
    ORDER BY "createdAt" DESC
  `;

  for (const m of matches) {
    // Un paciente puede matchear por `phone` o por `phone2`; el Set evita
    // contarlo dos veces cuando tiene el mismo número en los dos campos.
    for (const key of new Set([phoneKey(m.phone), phoneKey(m.phone2)])) {
      if (!key || !wanted.includes(key)) continue;
      const list = byKey.get(key);
      if (list) list.push(m); else byKey.set(key, [m]);
    }
  }

  return byKey;
}

/** Atajo para un solo número. Devuelve todos los pacientes que lo tienen. */
export async function findPatientsByPhone(raw: string | null | undefined): Promise<PatientPhoneMatch[]> {
  const key = phoneKey(raw);
  if (!key) return [];
  return (await findPatientsByPhoneKeys([key])).get(key) ?? [];
}

/**
 * AES-256-GCM field decryptor for legacy migrated data.
 *
 * Some patient fields (employer, preferredPharmacy, etc.) were migrated from
 * the original system without being decrypted first, so they may still carry
 * the "e:" prefix cipher format.
 *
 * Format: "e:<base64(iv[12] + tag[16] + ciphertext)>"
 * Key:    AES_GCM_KEY_B64 env var (32-byte key, base64-encoded)
 */

import { createDecipheriv } from 'crypto';

let _key: Buffer | null = null;
function getKey(): Buffer {
  if (_key) return _key;
  const b64 = process.env.AES_GCM_KEY_B64 ?? '';
  if (!b64) return (_key = Buffer.alloc(0));
  const k = Buffer.from(b64, 'base64');
  _key = k.length === 32 ? k : Buffer.alloc(0);
  return _key;
}

/**
 * Decrypts a field value if it starts with "e:". Returns the original string
 * unchanged for plain-text values. Returns null if decryption fails.
 */
export function decryptField(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return value ?? null;

  let b64: string | null = null;
  const pipeIdx = value.indexOf('|e:');
  if (pipeIdx !== -1) {
    b64 = value.slice(pipeIdx + 3);
  } else if (value.startsWith('e:')) {
    b64 = value.slice(2);
  } else {
    return value; // plain text
  }

  const key = getKey();
  if (key.length !== 32) return null; // no key configured

  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 28) return null;
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const dec = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** True si el valor sigue en formato cifrado (`e:…` o `…|e:…`). */
export function isCipher(value: string | null | undefined): boolean {
  return !!value && (value.startsWith('e:') || value.includes('|e:'));
}

/**
 * Descifra un campo. Texto plano pasa intacto.
 *
 * Si el descifrado falla (típicamente porque `AES_GCM_KEY_B64` no está en el
 * entorno) devuelve **null**, NO el cifrado crudo — antes el staff veía
 * `e:bC43szK6BQNR7fphLRXO2rS6HGe+nZ…` en pantalla, que no dice nada.
 *
 * ⚠️ Devolver null hace que el valor NO viaje al cliente, así que un PATCH que
 * escriba el campo tal como vino borraría el cifrado de la DB de forma
 * irreversible. Por eso `PATCH /api/admin/patients/[id]` usa `isCipher()`
 * contra el valor guardado para no pisar un cifrado con vacío.
 */
export function decryptFieldOrOriginal(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (!isCipher(value)) return value;
  return decryptField(value);
}

/**
 * Descifra TODOS los campos de texto de un registro de una sola pasada.
 *
 * Existe porque el patrón "envolver campo por campo con `dec()`" ya falló: de
 * los archivos que leen `employer`/`emergencyContact*`, la mitad se lo olvidaba,
 * y el PDF del caso llegó a producción imprimiendo `e:bC43szK6BQNR7fphLRXO…`.
 * Usar esto en el borde donde el registro sale de Prisma hacia una vista o un
 * documento: así una columna nueva del schema queda cubierta sola.
 *
 * Los no-string (fechas, números, relaciones) no se tocan, y el texto plano pasa
 * intacto — `decryptFieldOrOriginal` solo actúa sobre lo que empieza con `e:`.
 */
export function decryptScalars<T extends Record<string, unknown>>(rec: T): T {
  const out = { ...rec };
  for (const clave of Object.keys(out) as (keyof T)[]) {
    if (typeof out[clave] === 'string') {
      out[clave] = decryptFieldOrOriginal(out[clave] as string) as T[keyof T];
    }
  }
  return out;
}

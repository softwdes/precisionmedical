import { createDecipheriv } from 'crypto'

const KEY = Buffer.from(process.env.AES_GCM_KEY_B64 || '', 'base64')
if (KEY.length !== 32) throw new Error('AES_GCM_KEY_B64 must be 32 bytes')

/**
 * Decrypts a field value from the original system.
 * Format: t:TOKEN1,...|e:BASE64  or  e:BASE64  or plain text
 * Encrypted layout: IV(12) + TAG(16) + CIPHERTEXT
 */
export function decrypt(value) {
  if (!value || typeof value !== 'string') return value

  // Extract the e: part
  let b64 = null
  const pipeIdx = value.indexOf('|e:')
  if (pipeIdx !== -1) {
    b64 = value.slice(pipeIdx + 3)
  } else if (value.startsWith('e:')) {
    b64 = value.slice(2)
  } else {
    return value // plain text, not encrypted
  }

  try {
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 28) return value
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const dec = createDecipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 })
    dec.setAuthTag(tag)
    return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8')
  } catch {
    return null // return null so caller can handle missing data
  }
}

/** Decrypt legacy SSP (base64url format, tag at end) */
export function decryptSSP(value) {
  if (!value || value.startsWith('*')) return null
  try {
    const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 29) return null
    const iv = buf.subarray(0, 12)
    const ct = buf.subarray(12, buf.length - 16)
    const tag = buf.subarray(buf.length - 16)
    const dec = createDecipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 })
    dec.setAuthTag(tag)
    return Buffer.concat([dec.update(ct), dec.final()]).toString('utf8')
  } catch {
    return null
  }
}

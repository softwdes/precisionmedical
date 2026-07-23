import { createDecipheriv } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually
const envFile = readFileSync(join(__dirname, '.env'), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
    .filter(([k]) => k)
)

const KEY = Buffer.from(env.AES_GCM_KEY_B64, 'base64')

function decrypt(encrypted) {
  // Format: t:TOKEN1,TOKEN2,...|e:BASE64_CIPHERTEXT
  // We only need the e: part
  const eMatch = encrypted.match(/\|e:(.+)$/)
  if (!eMatch) {
    // Maybe it's just e:... without t: prefix
    const eOnly = encrypted.match(/^e:(.+)$/)
    if (!eOnly) return encrypted // not encrypted
    return decryptValue(eOnly[1])
  }
  return decryptValue(eMatch[1])
}

function decryptValue(b64) {
  try {
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 28) throw new Error('Payload too short')
    // Format: IV(12) + TAG(16) + CIPHERTEXT — tag comes BEFORE ciphertext
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const dec = createDecipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 })
    dec.setAuthTag(tag)
    return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8')
  } catch (e) {
    return `[DECRYPT_ERROR: ${e.message}]`
  }
}

// Test with a real encrypted value from the CSV
const testCases = [
  // name field from users CSV
  't:pgEFAyUVE00hLMp7,WecNMiVBw0s9WvhK,j//hwS6Se36Fj1N9,upeQ7kT4BHkYZSPq|e:KCWFEPMjXKuYzUmh5Efdbpmjh5u/LAdncF+PzxJowHlkww==',
  // lastname field
  't:JW3EQQn+qfxqka1Y,SYoDuPYRnsUVcVkr,+UJkSxXLHJYjojZy|e:SvDD2kTzH/hgvhD35hsRNN72NJ18KYiGcwlaQ6ID1/TD',
  // another name
  't:6+sa10LJAEApwdF1,UxVAwi914Nm7G6uV,9zg0a5pizD72S+0J,+H8tKAB9Dqc2rdEO|e:3o1UDZh3rsyyH6PqHChHxbhs8XQfa5frbt3o8mUBemHtQaQ=',
]

console.log('=== Decryption Test ===\n')
for (const t of testCases) {
  const result = decrypt(t)
  console.log('Input:  ', t.substring(0, 60) + '...')
  console.log('Output: ', result)
  console.log()
}

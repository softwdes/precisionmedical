/**
 * fix-employer-decrypt.mjs
 *
 * One-time fix: decrypts the employer field for patients where it was stored
 * encrypted (e:...) due to a missing decrypt() call in 04-patients.mjs.
 *
 * Usage:
 *   node --env-file=.env fix-employer-decrypt.mjs
 */

import { createDecipheriv } from 'crypto'
import { openPool, closePool } from './utils/db.mjs'

const KEY = Buffer.from(process.env.AES_GCM_KEY_B64 || '', 'base64')
if (KEY.length !== 32) {
  console.error('❌ AES_GCM_KEY_B64 must be 32 bytes — check your .env')
  process.exit(1)
}

function decrypt(value) {
  if (!value || typeof value !== 'string') return value

  let b64 = null
  const pipeIdx = value.indexOf('|e:')
  if (pipeIdx !== -1) {
    b64 = value.slice(pipeIdx + 3)
  } else if (value.startsWith('e:')) {
    b64 = value.slice(2)
  } else {
    return value // plain text, nothing to do
  }

  try {
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 28) return null
    const iv  = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const dec = createDecipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 })
    dec.setAuthTag(tag)
    return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8')
  } catch {
    return null
  }
}

async function main() {
  const db = await openPool()

  // Find all patients with encrypted employer field
  const { rows } = await db.query(`
    SELECT id, employer
    FROM patients
    WHERE employer IS NOT NULL
      AND (employer LIKE 'e:%' OR employer LIKE '%|e:%')
  `)

  console.log(`\n🔍 Found ${rows.length} patients with encrypted employer field\n`)

  let fixed = 0
  let failed = 0

  for (const row of rows) {
    const plain = decrypt(row.employer)
    if (plain && plain !== row.employer) {
      await db.query(
        `UPDATE patients SET employer = $1, "updatedAt" = NOW() WHERE id = $2`,
        [plain, row.id]
      )
      console.log(`  ✅ ${row.id} → "${plain}"`)
      fixed++
    } else if (!plain) {
      console.log(`  ⚠️  ${row.id} — decrypt failed, skipping`)
      failed++
    } else {
      console.log(`  ℹ️  ${row.id} — already plain text, skipping`)
    }
  }

  console.log(`\n📊 Done: ${fixed} fixed, ${failed} failed, ${rows.length - fixed - failed} skipped`)
  await closePool()
}

main().catch(e => { console.error(e); process.exit(1) })

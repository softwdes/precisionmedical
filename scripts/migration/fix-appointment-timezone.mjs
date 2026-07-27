/**
 * Fix appointment timezone — migrated appointments were stored without
 * timezone offset (local Mountain time treated as UTC by Postgres).
 *
 * Root cause: migration script 06-appointments.mjs used
 *   `${date}T${time}` (no offset) with ::timestamp cast.
 * Postgres (UTC session) stored those as UTC, but the actual clinic
 * times were in America/Denver (MDT = UTC-6 / MST = UTC-7).
 *
 * Fix: re-interpret stored UTC value as America/Denver local time,
 * then convert to real UTC.
 *
 * Example:
 *   Current DB:  2024-05-15T14:00:00Z  (14:00 UTC)
 *   Displays as: 08:00 MDT — WRONG (appointment was at 2 PM local)
 *   After fix:   2024-05-15T20:00:00Z  (14:00 + 6h offset)
 *   Displays as: 14:00 MDT — CORRECT
 *
 * Safety filter: only touches appointments with scheduledFor before
 * 2026-07-13 (migration date). New v3 appointments are correctly stored.
 *
 * Run from scripts/migration/:
 *   node fix-appointment-timezone.mjs --dry-run   (preview)
 *   node fix-appointment-timezone.mjs              (apply)
 */
import 'dotenv/config'
import { getPool, closePool } from './utils/db.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const CUTOFF  = '2026-07-13'  // migration date — only fix historical records

async function main() {
  const pool = getPool()

  // 1. Count affected rows
  const { rows: countRows } = await pool.query(`
    SELECT COUNT(*) AS n
    FROM appointments
    WHERE "scheduledFor" < $1::date
  `, [CUTOFF])
  const total = parseInt(countRows[0].n)
  console.log(`\n📊 Appointments before ${CUTOFF}: ${total}`)

  // 2. Preview 10 sample rows before/after
  const { rows: sample } = await pool.query(`
    SELECT
      id,
      "scheduledFor"                                           AS current_utc,
      "scheduledFor" AT TIME ZONE 'UTC'                        AS stripped,
      ("scheduledFor" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Denver' AS fixed_utc,
      ("scheduledFor" AT TIME ZONE 'UTC')::text                AS local_text
    FROM appointments
    WHERE "scheduledFor" < $1::date
    ORDER BY "scheduledFor" DESC
    LIMIT 10
  `, [CUTOFF])

  console.log('\n🔍 Sample rows (current → fixed):')
  for (const r of sample) {
    const cur = new Date(r.current_utc).toISOString()
    const fix = new Date(r.fixed_utc).toISOString()
    const localH = r.local_text.slice(11, 16) // HH:MM from "YYYY-MM-DD HH:MM:SS"
    // Show time in MDT (UTC-6)
    const curMDT = new Date(r.current_utc)
    const curH = ((curMDT.getUTCHours() - 6 + 24) % 24).toString().padStart(2, '0')
    const fixH = ((new Date(r.fixed_utc).getUTCHours() - 6 + 24) % 24).toString().padStart(2, '0')
    console.log(`  ${r.id.slice(0, 8)}... | stored: ${cur.slice(11,16)}Z (shows ${curH}:xx MDT) → ${fix.slice(11,16)}Z (shows ${fixH}:xx MDT) | v2 time was: ${localH}`)
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes made. Run without --dry-run to apply.\n')
    await closePool()
    return
  }

  // 3. Apply fix
  console.log('\n🔧 Applying timezone fix...')
  const { rowCount } = await pool.query(`
    UPDATE appointments
    SET "scheduledFor" = ("scheduledFor" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Denver',
        "updatedAt"    = NOW()
    WHERE "scheduledFor" < $1::date
  `, [CUTOFF])

  console.log(`✅ Updated ${rowCount} appointments`)
  console.log('   All migrated appointments now have correct UTC timestamps.')
  console.log('   (e.g., a 10 AM Mountain appointment is now stored as 16:00 UTC or 17:00 UTC)')

  await closePool()
}

main().catch(e => { console.error(e); process.exit(1) })

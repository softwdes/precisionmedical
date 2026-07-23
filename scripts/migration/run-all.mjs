/**
 * Run all migration scripts in order.
 * Each script must complete successfully before the next runs.
 *
 * Usage: node --env-file=.env run-all.mjs
 *   or:  node --env-file=.env run-all.mjs 01 02 03   (run specific scripts)
 */
import { execSync } from 'child_process'
import { resolve } from 'path'

const ALL_SCRIPTS = [
  { num: '01', file: '01-clinics.mjs', desc: 'Clinics' },
  { num: '02', file: '02-providers.mjs', desc: 'Providers (Doctors)' },
  { num: '03', file: '03-attorneys.mjs', desc: 'Attorneys / Law Firms' },
  { num: '04', file: '04-patients.mjs', desc: 'Patients' },
  { num: '05', file: '05-cases.mjs', desc: 'Cases' },
  { num: '06', file: '06-appointments.mjs', desc: 'Appointments' },
]

const filter = process.argv.slice(2)
const toRun = filter.length > 0
  ? ALL_SCRIPTS.filter(s => filter.includes(s.num))
  : ALL_SCRIPTS

console.log('╔══════════════════════════════════════╗')
console.log('║     LM v3 Migration — Run All        ║')
console.log('╚══════════════════════════════════════╝\n')

for (const script of toRun) {
  console.log(`\n▶  Step ${script.num}: ${script.desc}`)
  console.log('─'.repeat(40))
  try {
    execSync(`node --env-file=.env ${script.file}`, {
      stdio: 'inherit',
      cwd: import.meta.dirname || process.cwd(),
    })
    console.log(`✅ Step ${script.num} complete\n`)
  } catch (e) {
    console.error(`\n❌ Step ${script.num} failed — stopping migration`)
    process.exit(1)
  }
}

console.log('\n╔══════════════════════════════════════╗')
console.log('║       Migration Complete ✅           ║')
console.log('╚══════════════════════════════════════╝')

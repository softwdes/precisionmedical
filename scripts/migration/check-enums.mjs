import { getPool, closePool } from './utils/db.mjs'
const db = getPool()
for (const e of ['LawyerEntityType','LawyerMemberRole','PatientSex','MaritalStatus','PatientRace','PatientEthnicity','CaseTypeWorkflow','CaseStatus','AppointmentType','AppointmentStatus']) {
  const res = await db.query(`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid=pg_type.oid WHERE pg_type.typname=$1 ORDER BY enumsortorder`, [e])
  console.log(`${e}: [${res.rows.map(r => `'${r.enumlabel}'`).join(', ')}]`)
}
await closePool()

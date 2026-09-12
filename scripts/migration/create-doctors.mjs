import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('.env', import.meta.url).pathname.slice(1) });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const DEPT_MEDICAL_STAFF = 'cmrjoxlz30005apc6vzgyaa3x';
const COUNTRY_US         = 'cmrjoxkct0000apc68jpfx3f8';
const START_DATE = '2020-01-01T00:00:00.000Z';

const doctors = [
  { firstName: 'Cassie',    lastName: 'Broadhead', email: 'cbroadhead@precisionmedicalcare.com'  },
  { firstName: 'Barry',     lastName: 'Clanton',   email: 'bclanton@precisionmedicalcare.com'    },
  { firstName: 'Nathaniel', lastName: 'Gay',        email: 'ngay@precisionmedicalcare.com'        },
  { firstName: 'Justin',    lastName: 'Loder',      email: 'jloder@precisionmedicalcare.com'      },
  { firstName: 'David',     lastName: 'Miller',     email: 'dmiller@precisionmedicalcare.com'     },
  { firstName: 'Andrew',    lastName: 'Nielsen',    email: 'anielsen@precisionmedicalcare.com'    },
  { firstName: 'Scott',     lastName: 'Rigdon',     email: 'srigdon@precisionmedicalcare.com'     },
  { firstName: 'Mark',      lastName: 'Stouffer',   email: 'mstouffer@precisionmedicalcare.com'   },
];

function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'cm';
  for (let i = 0; i < 23; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const year = new Date().getFullYear();
const now = new Date().toISOString();
let created = 0;

for (let i = 0; i < doctors.length; i++) {
  const doc = doctors[i];

  // Check if already exists by email
  const { rows: existing } = await pool.query(
    `SELECT id FROM employees WHERE email = $1 LIMIT 1`,
    [doc.email]
  );
  if (existing.length > 0) {
    console.log(`⚠️  Skip (ya existe): ${doc.firstName} ${doc.lastName}`);
    continue;
  }

  const id = generateId();
  const employeeCode = `EMP-${year}-${String(i + 1).padStart(4, '0')}`;

  await pool.query(
    `INSERT INTO employees (id, "employeeCode", "firstName", "lastName", email, position, type, status, "departmentId", "countryId", "baseCurrency", "startDate", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'DOCTOR', 'FULL_TIME', 'ACTIVE', $6, $7, 'USD', $8, $9, $9)`,
    [id, employeeCode, doc.firstName, doc.lastName, doc.email, DEPT_MEDICAL_STAFF, COUNTRY_US, START_DATE, now]
  );
  console.log(`✅ ${employeeCode} — ${doc.firstName} ${doc.lastName} (${id})`);
  created++;
}

console.log(`\nTotal creados: ${created}/${doctors.length}`);
await pool.end();

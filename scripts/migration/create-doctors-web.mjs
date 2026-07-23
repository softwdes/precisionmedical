import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:Dr4--kors1q2w3e@db.ztyahzvwwvesthmzfutu.supabase.co:5432/postgres'
});

const DEPT_CLINICA = 'dept-clinica';
const COUNTRY_US   = 'US';
const START_DATE   = '2020-01-01T00:00:00.000Z';
const now          = new Date().toISOString();

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

// Get current count to generate codes
const { rows: countRow } = await pool.query(`SELECT COUNT(*) as cnt FROM employees`);
let nextNum = parseInt(countRow[0].cnt) + 1;
const year = new Date().getFullYear();

let created = 0;
for (const doc of doctors) {
  const { rows: existing } = await pool.query(
    `SELECT id FROM employees WHERE email = $1 LIMIT 1`, [doc.email]
  );
  if (existing.length > 0) {
    console.log(`⚠️  Skip: ${doc.firstName} ${doc.lastName}`);
    continue;
  }

  const id = generateId();
  const employeeCode = `EMP-${year}-${String(nextNum).padStart(4, '0')}`;
  nextNum++;

  await pool.query(
    `INSERT INTO employees (id, "employeeCode", "firstName", "lastName", email, position, type, status, "departmentId", "countryId", "baseCurrency", "startDate", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,'DOCTOR','FULL_TIME','ACTIVE',$6,$7,'USD',$8,$9,$9)`,
    [id, employeeCode, doc.firstName, doc.lastName, doc.email, DEPT_CLINICA, COUNTRY_US, START_DATE, now]
  );
  console.log(`✅ ${employeeCode} — ${doc.firstName} ${doc.lastName}`);
  created++;
}

console.log(`\nTotal: ${created}/${doctors.length}`);
await pool.end();

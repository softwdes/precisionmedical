/**
 * Alta de los 8 doctores como `employees` — **en la base del ADMIN**, no en la
 * de Phoenix.
 *
 * ⚠️ ESTE SCRIPT ES LA EXCEPCIÓN DE LA CARPETA.
 *
 * Los otros 57 corren contra Phoenix con `DATABASE_URL`. Este va contra el
 * proyecto del Admin (`ztyahz…`), que es donde vive el módulo de empleados.
 *
 * Por eso NO usa `DATABASE_URL`, aunque sea "lo que hacen los demás": en
 * `scripts/migration/.env` esa variable apunta a Phoenix — verificado el
 * 2026-09-11 — y **Phoenix también tiene una tabla `employees`**. Con
 * `DATABASE_URL` este INSERT no fallaría: entraría callado en la base
 * equivocada, y ocho doctores fantasma en Phoenix no los encuentra nadie hasta
 * que alguien se pregunta por qué aparecen dos veces.
 *
 * ── Las credenciales salen del entorno ─────────────────────────────────────
 * Hasta el 2026-09-11 la cadena de conexión —con la contraseña— estaba escrita
 * acá adentro, y estuvo siete semanas en el historial público de GitHub
 * (`605154f7` la subió, `80884567` la sacó de HEAD, que no es lo mismo que del
 * historial). Esa contraseña ya está rotada. Lo que se arregla acá es el
 * hábito: el archivo enseñaba a poner la clave en el archivo.
 */

import pg from 'pg';

/** El ref de Phoenix. No es un secreto —va en la URL pública— y acá sirve de tope. */
const REF_PHOENIX = 'kiqlhwncfqfftaqqvadj';

const conexion = process.env.ADMIN_DATABASE_URL;
if (!conexion) {
  throw new Error(
    'Falta ADMIN_DATABASE_URL en scripts/migration/.env.\n' +
    'Es la base del ADMIN (ztyahz…), NO la de Phoenix: DATABASE_URL no sirve acá,\n' +
    'apunta a Phoenix y el INSERT entraría en la tabla equivocada sin avisar.',
  );
}

// Red de seguridad para el copiar-pegar: si alguien puso la cadena de Phoenix
// en la variable del Admin, se frena antes de escribir.
if (conexion.includes(REF_PHOENIX)) {
  throw new Error(
    'ADMIN_DATABASE_URL apunta a Phoenix, no al Admin. Este script escribe en\n' +
    '`employees` del proyecto del Admin; Phoenix tiene una tabla con el mismo\n' +
    'nombre y el INSERT entraría ahí sin dar error.',
  );
}

// Se dice a qué host se conecta, sin la credencial: es la única forma de
// enterarse ANTES de escribir, y este script escribe.
console.log(`→ Admin: ${conexion.replace(/\/\/[^@]*@/, '//…@').replace(/\?.*$/, '')}`);

const pool = new pg.Pool({ connectionString: conexion });

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

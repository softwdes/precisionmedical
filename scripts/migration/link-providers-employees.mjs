import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('.env', import.meta.url).pathname.slice(1) });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const now = new Date().toISOString();

// Soft-delete Barry Clanton duplicado (0 citas, es el de admin)
await pool.query(
  `UPDATE providers SET "deletedAt" = $1, status = 'INACTIVE', "updatedAt" = $1 WHERE id = $2`,
  [now, 'cmrjfnkgnyzwcwhjw7z']
);
console.log('🗑️  Eliminado Barry Clanton duplicado (0 citas)');

// Vincular providers reales con sus empleados
const links = [
  { providerId: 'cmrjfnk21vgrdrncs9n', employeeId: 'cmdvi50ewmka9rmdpbpaekh7x', name: 'Cassie Broadhead'    },
  { providerId: 'cmrjfnjna5gpg1d2djw', employeeId: 'cmdx3nlxdpfgvzghjzk4mp6b9', name: 'Barry Clanton'      },
  { providerId: 'cmrjfniv4378py7hk91', employeeId: 'cmrbytzb5p5w0itke4w5hi4rp', name: 'Nathaniel Gay'      },
  { providerId: 'cmrjfnjuqqdytbz8h7p', employeeId: 'cmedus3zxm9anhfi19kaqjxfu', name: 'Justin Loder'       },
  { providerId: 'cmrjfnkd1hi4fiijgnt', employeeId: 'cmql5d5r83pb5ao5epe83ovh6', name: 'David Miller'       },
  { providerId: 'cmrjfnknzqcwxkp3xcq', employeeId: 'cmbddva7mbm8pg79jv19rybux', name: 'Andrew Nielsen'     },
  { providerId: 'cmrjfnkrlyhg5dl61og', employeeId: 'cmy0mdl9xiktj3jbga9wsnl7n', name: 'Scott Rigdon'       },
  { providerId: 'cmrjfnjydi7wx6png7u', employeeId: 'cm2onya9ippn4d614sy6gcdb9', name: 'Mark Stouffer'      },
];

let linked = 0;
for (const link of links) {
  await pool.query(
    `UPDATE providers SET "employeeId" = $1, "updatedAt" = $2 WHERE id = $3`,
    [link.employeeId, now, link.providerId]
  );
  console.log(`✅ ${link.name}`);
  linked++;
}

console.log(`\nTotal vinculados: ${linked}/${links.length}`);
await pool.end();

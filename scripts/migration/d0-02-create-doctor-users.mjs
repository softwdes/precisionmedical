/**
 * D0-02 · Crear cuentas de login para los 8 doctores y vincular Provider.userId.
 *
 * Por cada Employee position=DOCTOR con Provider vinculado:
 *   1. Crea el auth user en Supabase (email corporativo, password temporal, confirmado).
 *   2. Upsert en tabla `users` con role=PROVIDER.
 *   3. UPDATE providers SET "userId" = <users.id>.
 *
 * Idempotente: si el auth user o el row ya existen, los reutiliza.
 *
 * Uso:  node d0-02-create-doctor-users.mjs           (dry-run)
 *       node d0-02-create-doctor-users.mjs --apply   (ejecuta)
 *
 * Las contraseñas temporales se escriben en PASSWORDS_OUT (fuera del repo).
 */
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from 'dotenv';

config();

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PASSWORDS_OUT = process.env.PASSWORDS_OUT
  ?? 'C:/Users/Erick/Documents/doctor-temp-passwords.txt';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en .env');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const cuid = () => 'c' + crypto.randomBytes(16).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 23);
const tempPassword = () => {
  // Formato legible para entregar en mano: Abc-1234-Xyz
  const seg = (n) => crypto.randomBytes(8).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);
  return `${seg(4)}-${crypto.randomInt(1000, 9999)}-${seg(4)}`;
};

const authHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function findAuthUserByEmail(email) {
  // GoTrue admin: filtro por email (fallback: paginado)
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, { headers: authHeaders });
  if (!res.ok) throw new Error(`admin/users list ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.users ?? [];
  return list.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function createAuthUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json();
  if (res.ok) return { user: body, created: true };
  // 422 = ya existe
  if (res.status === 422 || `${body.msg ?? body.message ?? ''}`.includes('already')) {
    const existing = await findAuthUserByEmail(email);
    if (existing) return { user: existing, created: false };
  }
  throw new Error(`createAuthUser(${email}) → ${res.status} ${JSON.stringify(body)}`);
}

console.log(`\n${APPLY ? '⚡ APPLY' : '🔍 DRY-RUN'} — d0-02 crear cuentas de doctores\n`);

const { rows: doctors } = await pool.query(`
  SELECT e.id AS employee_id, e."firstName", e."lastName", e.email,
         p.id AS provider_id, p."userId" AS provider_user_id
  FROM employees e
  JOIN providers p ON p."employeeId" = e.id
  WHERE e.position = 'DOCTOR' AND e."deletedAt" IS NULL AND p."deletedAt" IS NULL
  ORDER BY e."lastName"`);

console.log(`Doctores con Provider vinculado: ${doctors.length}\n`);

const credentials = [];

for (const d of doctors) {
  const tag = `${d.firstName} ${d.lastName} <${d.email}>`;

  if (d.provider_user_id) {
    console.log(`= ${tag} — Provider ya vinculado a userId ${d.provider_user_id}, skip`);
    continue;
  }

  // ¿Ya existe row en users?
  const { rows: existingUsers } = await pool.query(
    `SELECT id, role, status FROM users WHERE lower(email) = lower($1)`, [d.email]);
  const existing = existingUsers[0];

  if (existing && existing.role !== 'PROVIDER') {
    console.log(`⚠ ${tag} — users row existe con rol ${existing.role}; NO se toca (revisar a mano)`);
    continue;
  }

  console.log(`+ ${tag}`);
  console.log(`    auth: ${existing ? 'verificar/crear' : 'crear'} · users: ${existing ? `reusar ${existing.id}` : 'crear rol PROVIDER'} · providers.userId: set`);

  if (!APPLY) continue;

  // 1 — Supabase auth user
  const password = tempPassword();
  const { user: authUser, created } = await createAuthUser(d.email, password);
  if (created) credentials.push({ email: d.email, password, name: `${d.firstName} ${d.lastName}` });
  console.log(`    auth user ${created ? 'creado' : 'ya existía'} (${authUser.id})`);

  // 2 — users row
  let userId = existing?.id;
  if (!userId) {
    userId = cuid();
    await pool.query(
      `INSERT INTO users (id, email, "firstName", "lastName", role, status, "emailVerifiedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'PROVIDER', 'ACTIVE', now(), now(), now())`,
      [userId, d.email, d.firstName, d.lastName],
    );
    console.log(`    users row creado (${userId})`);
  }

  // 3 — vínculo Provider.userId
  await pool.query(`UPDATE providers SET "userId" = $1, "updatedAt" = now() WHERE id = $2`, [userId, d.provider_id]);
  console.log(`    providers.userId ✓`);
}

if (APPLY && credentials.length > 0) {
  const out = [
    `Cuentas temporales portal médico — generadas ${new Date().toISOString()}`,
    'ENTREGAR EN MANO y pedir cambio de contraseña al primer login.',
    '',
    ...credentials.map((c) => `${c.name.padEnd(24)} ${c.email.padEnd(42)} ${c.password}`),
    '',
  ].join('\n');
  fs.writeFileSync(PASSWORDS_OUT, out, 'utf8');
  console.log(`\n🔑 ${credentials.length} contraseñas temporales escritas en: ${PASSWORDS_OUT}`);
}

if (APPLY) {
  const { rows: check } = await pool.query(`
    SELECT p."firstName", p."lastName", p.email, u.role,
           (p."userId" IS NOT NULL) AS linked
    FROM providers p LEFT JOIN users u ON u.id = p."userId"
    WHERE p."deletedAt" IS NULL AND p.status = 'ACTIVE' ORDER BY p."lastName"`);
  console.log('\nVerificación final:');
  console.table(check);
}

console.log(`\n${APPLY ? '✅ Aplicado' : 'ℹ Dry-run — nada escrito. Correr con --apply para ejecutar.'}\n`);
await pool.end();

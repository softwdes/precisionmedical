/**
 * D0-03 · Crear los 8 doctores en el proyecto ADMIN (ztyahz) — login unificado.
 *
 * Replica el flujo del módulo Usuarios del Admin (users.create):
 *   1. Auth user en Supabase del Admin (password temporal, confirmado).
 *   2. Fila en `users` con id = UUID del auth, role = DOCTOR, status = ACTIVE.
 *
 * Los doctores quedan visibles en Admin → Usuarios con rol Doctor.
 * Idempotente. Lee credenciales del Admin desde apps/web/.env.local.
 *
 * Uso:  node d0-03-create-doctors-admin-project.mjs           (dry-run)
 *       node d0-03-create-doctors-admin-project.mjs --apply
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const PASSWORDS_OUT = 'C:/Users/Erick/Documents/doctor-passwords-admin.txt';

const webEnv = fs.readFileSync('D:/PROYECTOS/PM/apps/web/.env.local', 'utf8');
const get = (k) => webEnv.match(new RegExp('^' + k + '="?([^"\r\n]+)"?', 'm'))?.[1];
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
if (!URL_ || !KEY) { console.error('Faltan credenciales del Admin'); process.exit(1); }

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const DOCTORS = [
  { firstName: 'Cassie',    lastName: 'Broadhead', email: 'cbroadhead@precisionmedicalcare.com' },
  { firstName: 'Barry',     lastName: 'Clanton',   email: 'bclanton@precisionmedicalcare.com' },
  { firstName: 'Nathaniel', lastName: 'Gay',       email: 'ngay@precisionmedicalcare.com' },
  { firstName: 'Justin',    lastName: 'Loder',     email: 'jloder@precisionmedicalcare.com' },
  { firstName: 'David',     lastName: 'Miller',    email: 'dmiller@precisionmedicalcare.com' },
  { firstName: 'Andrew',    lastName: 'Nielsen',   email: 'anielsen@precisionmedicalcare.com' },
  { firstName: 'Scott',     lastName: 'Rigdon',    email: 'srigdon@precisionmedicalcare.com' },
  { firstName: 'Mark',      lastName: 'Stouffer',  email: 'mstouffer@precisionmedicalcare.com' },
];

const tempPassword = () => {
  const seg = (n) => crypto.randomBytes(8).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);
  return `${seg(4)}-${crypto.randomInt(1000, 9999)}-${seg(4)}`;
};

async function listAuthUsers() {
  const res = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=1000`, { headers: h });
  const data = await res.json();
  return Array.isArray(data) ? data : data.users ?? [];
}

console.log(`\n${APPLY ? '⚡ APPLY' : '🔍 DRY-RUN'} — d0-03 doctores en proyecto ADMIN (${URL_})\n`);

const existingAuth = await listAuthUsers();
const credentials = [];

for (const d of DOCTORS) {
  const authUser = existingAuth.find((u) => u.email?.toLowerCase() === d.email.toLowerCase());
  const usersRow = await fetch(`${URL_}/rest/v1/users?select=id,role,status&email=eq.${encodeURIComponent(d.email)}`, { headers: h })
    .then((r) => r.json()).then((a) => a[0] ?? null);

  console.log(`${authUser || usersRow ? '=' : '+'} ${d.firstName} ${d.lastName} <${d.email}>`);
  console.log(`    auth: ${authUser ? 'ya existe' : 'crear'} · users row: ${usersRow ? `ya existe (${usersRow.role})` : 'crear rol DOCTOR'}`);
  if (usersRow && usersRow.role !== 'DOCTOR') console.log('    ⚠ rol distinto — revisar a mano, no se toca');
  if (!APPLY) continue;

  // 1 — auth user
  let authId = authUser?.id;
  if (!authId) {
    const password = tempPassword();
    const res = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ email: d.email, password, email_confirm: true }),
    });
    const body = await res.json();
    if (!res.ok) { console.log(`    ✗ auth error: ${JSON.stringify(body).slice(0, 120)}`); continue; }
    authId = body.id;
    credentials.push({ ...d, password });
    console.log(`    auth creado (${authId})`);
  }

  // 2 — users row (id = auth UUID, como hace users.create del Admin)
  if (!usersRow) {
    const res = await fetch(`${URL_}/rest/v1/users`, {
      method: 'POST',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: authId,
        email: d.email,
        firstName: d.firstName,
        lastName: d.lastName,
        role: 'DOCTOR',
        status: 'ACTIVE',
        preferredLocale: 'es',
        preferredTheme: 'dark',
        mfaEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    console.log(res.ok ? '    users row DOCTOR ✓' : `    ✗ users insert: ${res.status} ${(await res.text()).slice(0, 150)}`);
  }
}

if (APPLY && credentials.length > 0) {
  const out = [
    `Cuentas doctores — proyecto ADMIN (login unificado) — ${new Date().toISOString()}`,
    'ENTREGAR EN MANO y pedir cambio de contraseña al primer login.',
    '',
    ...credentials.map((c) => `${(c.firstName + ' ' + c.lastName).padEnd(24)} ${c.email.padEnd(44)} ${c.password}`),
    '',
  ].join('\n');
  fs.writeFileSync(PASSWORDS_OUT, out, 'utf8');
  console.log(`\n🔑 ${credentials.length} contraseñas en: ${PASSWORDS_OUT}`);
}

if (APPLY) {
  const check = await fetch(`${URL_}/rest/v1/users?select=email,role,status&role=eq.DOCTOR&order=email`, { headers: h }).then((r) => r.json());
  console.log('\nUsuarios DOCTOR en Admin:', check.length);
  check.forEach((u) => console.log(` - ${u.email} [${u.status}]`));
}

console.log(`\n${APPLY ? '✅ Aplicado' : 'ℹ Dry-run. Correr con --apply para ejecutar.'}\n`);

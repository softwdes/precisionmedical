/**
 * Sincroniza el DIRECTORIO DE LOGINS (proyecto Supabase "Admin") con la tabla
 * `users` de la app (proyecto "Phoenix", vía Prisma).
 *
 * ¿Por qué existe? Los dos proyectos están desconectados: el middleware
 * autentica y resuelve roles contra Admin, pero todas las FK de la app
 * (AuditLog.actorUserId, MessageRecipient.userId, user_activity.userId,
 * MessageThread.createdByUserId) apuntan a `users` de Phoenix. Un usuario que
 * solo existe en Admin no tiene identidad para la app:
 *   · mensajería interna → 401 en todas las rutas (badge en 0/0, modal muerto)
 *   · métricas por empleado → heartbeat 403 USER_NOT_LINKED, tiempo activo vacío
 *   · audit log → sus acciones quedan sin autor
 *
 * Esto es el BACKFILL de una vez. El goteo continuo lo cubre la provisión al
 * vuelo en `apps/back-office/lib/actor.ts` (provisionFromDirectory), para no
 * depender de que alguien recuerde correr este script cuando RRHH cree gente.
 *
 * Idempotente: hace match por email (case-insensitive) y no duplica.
 * `--apply` para escribir; sin flag hace dry-run.
 *
 * Vive acá (y no en scripts/) porque ESM resuelve `@prisma/client` desde la
 * ubicación del ARCHIVO, no del cwd — igual que los seed-*.mjs vecinos.
 *
 * Uso:
 *   node packages/database/prisma/sync-users-from-directory.mjs           # dry-run
 *   node packages/database/prisma/sync-users-from-directory.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
/** packages/database/prisma → raíz del monorepo */
const ROOT = path.resolve(import.meta.dirname, '../../..');

/** El id de Phoenix es un cuid propio — nunca el UUID de Supabase Auth. */
const KNOWN_ROLES = new Set([
  'SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'EMPLOYEE', 'FRONT_DESK',
  'DOCTOR', 'LAWYER', 'PROVIDER', 'AUDITOR_AI',
]);

function readEnv(file, keys) {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = {};
  for (const k of keys) {
    const m = raw.match(new RegExp(`^${k}=(.*)$`, 'm'));
    if (m) out[k] = m[1].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const env = readEnv('apps/back-office/.env.local', [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);
  const dirUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dirUrl || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const res = await fetch(
    `${dirUrl}/rest/v1/users?select=email,firstName,lastName,role,status&order=role.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`Directorio respondió ${res.status}`);
  const directory = await res.json();

  const db = new PrismaClient({ log: [] });
  const existing = await db.user.findMany({ select: { id: true, email: true, role: true } });
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));

  const toCreate = [];
  const skipped = [];

  for (const d of directory) {
    const email = (d.email ?? '').trim();
    if (!email) { skipped.push(['sin email', JSON.stringify(d)]); continue; }
    if (d.status !== 'ACTIVE') { skipped.push([email, `status ${d.status}`]); continue; }
    if (!KNOWN_ROLES.has(d.role)) { skipped.push([email, `rol desconocido ${d.role}`]); continue; }
    if (byEmail.has(email.toLowerCase())) continue; // ya está en Phoenix
    toCreate.push(d);
  }

  console.log(`Directorio (Admin): ${directory.length} · app (Phoenix): ${existing.length}`);
  console.log(`Faltan en la app: ${toCreate.length}`);
  for (const d of toCreate) {
    console.log(`  + ${d.email.padEnd(38)} ${String(d.role).padEnd(12)} ${d.firstName} ${d.lastName}`);
  }
  if (skipped.length > 0) {
    console.log('Omitidos:');
    skipped.forEach(([a, b]) => console.log(`  - ${a} → ${b}`));
  }

  if (!APPLY) {
    console.log('\nDRY-RUN. Volvé a correr con --apply para escribir.');
    await db.$disconnect();
    return;
  }

  let created = 0;
  for (const d of toCreate) {
    await db.user.create({
      data: {
        email: d.email.trim(),
        firstName: d.firstName || d.email.split('@')[0],
        lastName: d.lastName || '',
        role: d.role,
        status: 'ACTIVE',
      },
    });
    created++;
  }
  console.log(`\nOK · ${created} usuarios creados en la app.`);
  await db.$disconnect();
}

main().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });

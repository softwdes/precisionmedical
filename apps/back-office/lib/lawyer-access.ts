import { createAdminClient } from '@precision-medical/auth/admin';
import { db } from '@precision-medical/database';

/**
 * Estado del acceso al portal legal de cada ficha, leído del directorio Admin.
 *
 * `lawyers` (Phoenix) y `users` (Admin) son dos bases distintas: Prisma no puede
 * hacer el join, así que se resuelve con UNA consulta por lote de emails y se
 * arma el mapa en memoria. Una consulta por miembro serían 7 viajes para el tab
 * Miembros de un bufete mediano.
 */
export type LawyerAccessState =
  /** Sin cuenta en el directorio. */
  | 'none'
  /** Cuenta creada, todavía no activó su contraseña. */
  | 'pending'
  /** Cuenta activa. */
  | 'active'
  /** Cuenta revocada (baneada en Auth). */
  | 'revoked'
  /** El email tiene cuenta, pero de otro rol — no es un acceso de abogado. */
  | 'other-role';

export async function getLawyerAccessMap(
  emails: Array<string | null>,
): Promise<Record<string, LawyerAccessState>> {
  const clean = [...new Set(emails.filter((e): e is string => !!e).map(e => e.toLowerCase()))];
  if (clean.length === 0) return {};

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('email, role, status')
    .in('email', clean)
    .is('deletedAt', null);

  // Sin directorio no se puede afirmar que nadie tiene acceso: devolver todo en
  // 'none' mostraría "Crear acceso" para cuentas que sí existen y el primer clic
  // fallaría con un 409. Mejor no afirmar nada — la UI lo trata como desconocido.
  if (error || !data) return {};

  const map: Record<string, LawyerAccessState> = {};
  for (const row of data as Array<{ email: string; role: string; status: string }>) {
    const key = row.email.toLowerCase();
    if (row.role !== 'LAWYER') { map[key] = 'other-role'; continue; }
    map[key] =
      row.status === 'PENDING_VERIFICATION' ? 'pending'
      : row.status === 'ACTIVE' ? 'active'
      : 'revoked';
  }
  return map;
}

// ─── Alta y baja del acceso al portal ────────────────────────────────────────
//
// Viven acá y no en una ruta porque DOS puertas las necesitan con permisos
// distintos: el admin desde Externals, y el titular del bufete desde su propio
// portal. Duplicar el flujo de creación de cuentas era garantizar que se
// desincronizaran — y es justo el flujo donde un paso de menos deja un usuario
// de Auth huérfano que bloquea todo reintento.
//
// La AUTORIZACIÓN no está acá a propósito: cada ruta decide si quien pide tiene
// derecho, y recién entonces llama. Un helper que además autoriza es un helper
// que alguien va a llamar sin mirar.

/** Ban efectivamente permanente (100 años) — Supabase no expone "ban forever". */
const BAN_FOREVER = '876000h';
const BAN_NONE = 'none';

export type GrantError =
  | 'NO_EMAIL' | 'NOT_ACTIVE' | 'EMAIL_IN_USE'
  | 'AUTH_CREATE_FAILED' | 'USER_INSERT_FAILED';

export interface GrantResult {
  ok: boolean;
  error: GrantError | null;
  message?: string;
  created?: boolean;
  emailSent?: boolean;
  activationLink?: string | null;
  directoryUserId?: string | null;
}

export interface LawyerForAccess {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  firmName: string | null;
  status: string;
  parentFirm?: { firmName: string | null } | null;
}

interface DirectoryRow { id: string; status: string; role: string }

async function findDirectoryUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<DirectoryRow | null> {
  const { data } = await admin
    .from('users').select('id, status, role').ilike('email', email).is('deletedAt', null).maybeSingle();
  return (data as DirectoryRow | null) ?? null;
}

/**
 * Crea (o reenvía / reactiva) el acceso al portal legal de una ficha.
 *
 * Réplica del flujo probado en `packages/api/src/routers/users.ts`, con sus dos
 * aciertos: rollback del auth user si falla el insert en el directorio, y
 * `magiclink` en vez de `invite` para el primer acceso — `invite` falla cuando
 * el auth user ya existe, que es siempre nuestro caso.
 */
export async function grantLawyerAccess(lawyer: LawyerForAccess): Promise<GrantResult> {
  // El email ES la llave del puente entre Phoenix y el directorio Admin. Sin él
  // la cuenta no podría vincularse nunca con la ficha.
  if (!lawyer.email) {
    return { ok: false, error: 'NO_EMAIL', message: 'Esta ficha no tiene email. Agregalo antes de crear el acceso.' };
  }
  if (lawyer.status !== 'ACTIVE') {
    return { ok: false, error: 'NOT_ACTIVE', message: 'La ficha no está activa.' };
  }

  const email = lawyer.email;
  const firstName = lawyer.firstName ?? lawyer.firmName ?? email.split('@')[0]!;
  const lastName = lawyer.lastName ?? '';
  const firmName = lawyer.parentFirm?.firmName ?? lawyer.firmName;
  const admin = createAdminClient();

  const existing = await findDirectoryUser(admin, email);

  // Cuenta ya existente de OTRO rol: no se pisa. Reetiquetarla a LAWYER le
  // quitaría de golpe los accesos que ya tiene.
  if (existing && existing.role !== 'LAWYER') {
    return {
      ok: false,
      error: 'EMAIL_IN_USE',
      message: `Ese email ya tiene una cuenta con rol ${existing.role}. No se puede convertir en acceso de abogado.`,
    };
  }

  let userId = existing?.id ?? null;
  let created = false;

  if (!userId) {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      user_metadata: { firstName, lastName },
      email_confirm: false,
    });
    if (authError || !authData?.user) {
      return { ok: false, error: 'AUTH_CREATE_FAILED', message: authError?.message ?? 'No se pudo crear la cuenta' };
    }

    const now = new Date().toISOString();
    const { error: insertError } = await admin.from('users').insert({
      id: authData.user.id,
      email, firstName, lastName,
      role: 'LAWYER',
      status: 'PENDING_VERIFICATION',
      preferredLocale: 'en',
      preferredTheme: 'dark',
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    if (insertError) {
      // Sin este rollback queda un auth user huérfano que bloquea todo reintento.
      await admin.auth.admin.deleteUser(authData.user.id);
      return { ok: false, error: 'USER_INSERT_FAILED', message: insertError.message };
    }

    userId = authData.user.id;
    created = true;
  } else {
    // Reenvío sobre una cuenta existente: levantar el ban si estaba revocada.
    await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_NONE });
    await admin.from('users')
      .update({ status: 'PENDING_VERIFICATION', updatedAt: new Date().toISOString() })
      .eq('id', userId);
  }

  const portalUrl =
    process.env.NEXT_PUBLIC_ATTORNEY_PORTAL_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3002';

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${portalUrl}/api/auth/callback` },
  });

  const activationLink = linkData?.properties?.action_link ?? null;
  const emailSent = activationLink
    ? await sendActivationEmail({ to: email, firstName, firmName, link: activationLink })
    : false;

  // Denormalización, NUNCA llave de autorización (ver `get-session-lawyer.ts`).
  // El id de Phoenix se conoce recién cuando la persona entra por primera vez,
  // así que acá solo se puede guardar si ya tenía fila.
  const phoenixUser = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (phoenixUser) {
    await db.lawyer
      .update({ where: { id: lawyer.id }, data: { userId: phoenixUser.id } })
      .catch(() => { /* userId es @unique: si ya está tomado, no es fatal */ });
  }

  return { ok: true, error: null, created, emailSent, activationLink, directoryUserId: userId };
}

export type RevokeError = 'NO_EMAIL' | 'NO_ACCESS' | 'NOT_A_LAWYER_ACCOUNT' | 'BAN_FAILED';

export interface RevokeResult {
  ok: boolean;
  error: RevokeError | null;
  message?: string;
  directoryUserId?: string | null;
}

/**
 * Revoca el acceso al portal.
 *
 * Se BANEA la cuenta en Auth; no alcanza con marcarla INACTIVE, porque el
 * middleware decide el acceso solo por `users.role` y nunca mira `users.status`
 * — una cuenta "inactiva" seguiría entrando igual. El status se actualiza
 * también, para que el directorio no mienta.
 */
export async function revokeLawyerAccess(
  lawyer: { id: string; email: string | null },
): Promise<RevokeResult> {
  if (!lawyer.email) return { ok: false, error: 'NO_EMAIL' };

  const admin = createAdminClient();
  const existing = await findDirectoryUser(admin, lawyer.email);

  if (!existing) return { ok: false, error: 'NO_ACCESS' };
  if (existing.role !== 'LAWYER') return { ok: false, error: 'NOT_A_LAWYER_ACCOUNT' };

  const { error: banError } = await admin.auth.admin.updateUserById(existing.id, {
    ban_duration: BAN_FOREVER,
  });
  if (banError) return { ok: false, error: 'BAN_FAILED', message: banError.message };

  await admin.from('users')
    .update({ status: 'INACTIVE', updatedAt: new Date().toISOString() })
    .eq('id', existing.id);

  return { ok: true, error: null, directoryUserId: existing.id };
}

/**
 * Correo de bienvenida por la API REST de Resend.
 *
 * Por `fetch` y no por el SDK a propósito: el back-office no depende de
 * `packages/api` (que es tRPC y arrastraría media app) ni tenía `resend` entre
 * sus dependencias. Para UN correo, el REST evita las dos cosas.
 *
 * No lanza: si el correo no sale, la cuenta ya quedó creada y el enlace se
 * devuelve igual para pasarlo a mano. Fallar acá y hacer creer que no se creó
 * nada sería peor — el siguiente intento chocaría con la cuenta existente.
 */
async function sendActivationEmail(args: {
  to: string; firstName: string; firmName: string | null; link: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM_EMAIL ?? 'Precision Medical <onboarding@resend.dev>';
  const firmLine = args.firmName
    ? ` on behalf of <strong style="color:#E2E2EE;">${args.firmName}</strong>`
    : '';

  const html = [
    '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:#0A0A0F;font-family:system-ui,sans-serif;">',
    '<div style="max-width:560px;margin:0 auto;padding:32px 16px;">',
    '<div style="background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);border-radius:12px;padding:24px 28px;margin-bottom:24px;text-align:center;">',
    '<p style="margin:0;color:#fff;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Precision Medical &mdash; Legal Portal</p>',
    '</div>',
    '<div style="background:#111118;border:1px solid #1E1E2E;border-radius:12px;padding:28px;">',
    `<h2 style="color:#E2E2EE;font-size:22px;margin:0 0 8px;text-align:center;">Welcome, ${args.firstName}</h2>`,
    `<p style="color:#8888AA;font-size:13px;line-height:1.6;text-align:center;margin:0 0 24px;">An account has been created for you${firmLine} to follow your clients&rsquo; cases at Precision Medical. Activate it to get started.</p>`,
    `<div style="text-align:center;"><a href="${args.link}" style="display:inline-block;background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:700;font-size:14px;">Activate my account</a></div>`,
    `<p style="color:#3D3D52;font-size:11px;margin:24px 0 0;text-align:center;">If the button does not work, copy this link into your browser:<br/><span style="color:#6366F1;word-break:break-all;">${args.link}</span></p>`,
    '</div></div></body></html>',
  ].join('');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: args.to, subject: 'Your Precision Medical legal portal access', html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

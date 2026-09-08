/**
 * Pedidos de bufete · quién atiende cada escritorio (lado servidor).
 *
 * La lista vive en `message_desk_members` y se edita desde Configuración →
 * "Pedidos de bufetes". Este archivo resuelve a QUIÉN le llega un pedido y
 * ofrece los candidatos para esa pantalla. La parte pura (escritorios, temas,
 * validaciones) está en `escritorios.ts`, que también importa el cliente.
 *
 * Tres reglas que no se negocian:
 *  · Solo gente INTERNA y ACTIVA. Un abogado jamás puede ser miembro de un
 *    escritorio: configurar su correo por error mandaría el pedido de un bufete
 *    a otro bufete.
 *  · Un escritorio vacío CAE al de respaldo (Admisión), y si ese también está
 *    vacío, a la variable de entorno vieja. Un pedido tiene que llegar a alguien
 *    o rebotar con un 503 claro — nunca perderse ni ir "a cualquier admin".
 *  · Asignar a alguien que todavía no inició sesión (Brunella, 2026-09-07) crea
 *    su fila de Phoenix en el acto: `actor.ts` la provisiona solo en el PRIMER
 *    login, y sin fila no puede ser destinataria. Los mensajes se acumulan y
 *    los ve el día que entre.
 */

import { db, type UserRole } from '@precision-medical/database';
import { createAdminClient } from '@precision-medical/auth/admin';
import { MESSAGING_ROLES } from '@/lib/messaging';
import { destinatariosDePedidos } from '@/lib/vigia/pedidos';
import { ESCRITORIOS, ESCRITORIO_RESPALDO, type Escritorio } from './escritorios';

export interface MiembroEscritorio {
  id: string;
  name: string;
  email: string;
  role: string;
  /** true si la fila de Phoenix se creó al asignarla y la persona aún no entró. */
  pendienteDePrimerIngreso: boolean;
}

export interface DestinatariosResueltos {
  destinatarios: Array<{ id: string; name: string }>;
  /** El escritorio que finalmente recibió: el pedido o el de respaldo. */
  escritorioEfectivo: Escritorio | null;
  /** Por qué no fue el pedido: 'respaldo' (Admisión), 'env' (variable vieja) o null. */
  respaldo: 'respaldo' | 'env' | null;
}

const ROLES_INTERNOS: readonly UserRole[] = MESSAGING_ROLES;

function nombre(u: { firstName: string; lastName: string; email: string }): string {
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

/** Los miembros de un escritorio que hoy pueden recibir: activos, internos, no borrados. */
export async function miembrosActivos(desk: Escritorio): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.messageDeskMember.findMany({
    where: {
      desk,
      user: { status: 'ACTIVE', deletedAt: null, role: { in: [...ROLES_INTERNOS] } },
    },
    select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({ id: r.user.id, name: nombre(r.user) }));
}

/**
 * A quién le llega un pedido dirigido a `desk`.
 *
 * El orden de caída es escritorio pedido → Admisión → variable de entorno.
 * Cada salto queda dicho en `respaldo` para que la ruta lo escriba en el audit:
 * si Facturación estuvo vacía una semana y todo cayó en Admisión, tiene que
 * poder verse después.
 */
export async function destinatariosDeEscritorio(desk: Escritorio): Promise<DestinatariosResueltos> {
  const propios = await miembrosActivos(desk);
  if (propios.length > 0) return { destinatarios: propios, escritorioEfectivo: desk, respaldo: null };

  if (desk !== ESCRITORIO_RESPALDO) {
    const respaldo = await miembrosActivos(ESCRITORIO_RESPALDO);
    if (respaldo.length > 0) {
      return { destinatarios: respaldo, escritorioEfectivo: ESCRITORIO_RESPALDO, respaldo: 'respaldo' };
    }
  }

  const env = await destinatariosDePedidos();
  if (env.length > 0) return { destinatarios: env, escritorioEfectivo: null, respaldo: 'env' };

  return { destinatarios: [], escritorioEfectivo: null, respaldo: null };
}

/** Los tres escritorios con su gente, para la pantalla de Configuración. */
export async function escritoriosConMiembros(): Promise<Record<Escritorio, MiembroEscritorio[]>> {
  const rows = await db.messageDeskMember.findMany({
    where: { user: { deletedAt: null } },
    select: {
      desk: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, _count: { select: { activityBuckets: true } } } },
    },
    orderBy: [{ desk: 'asc' }, { createdAt: 'asc' }],
  });
  const out = Object.fromEntries(ESCRITORIOS.map((d) => [d, [] as MiembroEscritorio[]])) as Record<Escritorio, MiembroEscritorio[]>;
  for (const r of rows) {
    out[r.desk as Escritorio].push({
      id: r.user.id,
      name: nombre(r.user),
      email: r.user.email,
      role: r.user.role,
      // Sin un solo minuto de actividad registrado = nunca entró. Es la señal
      // más barata que tenemos y alcanza para el aviso de la pantalla.
      pendienteDePrimerIngreso: r.user._count.activityBuckets === 0,
    });
  }
  return out;
}

export interface CandidatoEscritorio {
  email: string;
  name: string;
  role: string;
  /** Sin fila en Phoenix todavía: existe en el directorio pero nunca entró. */
  sinFilaPhoenix: boolean;
}

/**
 * Gente que se puede asignar a un escritorio: el staff interno del directorio
 * (proyecto Admin, que es donde se dan de alta las cuentas), marcando a los que
 * todavía no tienen fila en Phoenix. Se lista desde el directorio y no desde
 * Phoenix a propósito: si se listara desde Phoenix, Brunella no aparecería
 * hasta su primer login, que es justo el caso que hay que cubrir.
 */
export async function candidatosParaEscritorio(): Promise<CandidatoEscritorio[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('email, firstName, lastName, role, status')
    .in('role', [...ROLES_INTERNOS])
    .is('deletedAt', null)
    .order('firstName', { ascending: true });
  if (error || !data) return [];

  type Dir = { email: string; firstName: string | null; lastName: string | null; role: string; status: string };
  const dir = (data as Dir[]).filter((u) => u.status === 'ACTIVE' || u.status === 'PENDING_VERIFICATION');

  const emails = dir.map((u) => u.email.toLowerCase());
  const enPhoenix = await db.user.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
    select: { email: true },
  });
  const tienenFila = new Set(enPhoenix.map((u) => u.email.toLowerCase()));

  return dir.map((u) => ({
    email: u.email.toLowerCase(),
    name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
    role: u.role,
    sinFilaPhoenix: !tienenFila.has(u.email.toLowerCase()),
  }));
}

/**
 * Devuelve el `users.id` de Phoenix para un email interno, creando la fila si
 * la persona existe en el directorio pero nunca entró. Espejo de la provisión
 * de `actor.ts` (mismos campos, mismo criterio de roles), hecha ANTES del
 * primer login porque hay que poder escribirle desde hoy.
 *
 * Null = no es alguien a quien se le pueda dar un escritorio (no existe, no es
 * interno, o está bloqueado). Nunca se crea una fila para un LAWYER.
 */
export async function asegurarFilaPhoenix(email: string): Promise<{ id: string; name: string } | null> {
  const existente = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
  if (existente) {
    if (!ROLES_INTERNOS.includes(existente.role)) return null;
    return { id: existente.id, name: nombre(existente) };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('email, firstName, lastName, role, status')
    .ilike('email', email)
    .is('deletedAt', null)
    .maybeSingle();
  const dir = data as { email: string; firstName: string | null; lastName: string | null; role: string; status: string } | null;
  if (!dir) return null;
  if (!ROLES_INTERNOS.includes(dir.role as UserRole)) return null;
  if (dir.status !== 'ACTIVE' && dir.status !== 'PENDING_VERIFICATION') return null;

  const creado = await db.user.create({
    data: {
      email: dir.email,
      firstName: dir.firstName || dir.email.split('@')[0]!,
      lastName: dir.lastName || '',
      role: dir.role as UserRole,
      status: 'ACTIVE',
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return { id: creado.id, name: nombre(creado) };
}

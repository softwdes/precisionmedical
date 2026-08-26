import { db } from '@precision-medical/database';

/**
 * Vigía · a quién le llega un pedido del bufete.
 *
 * Erick, 2026-08-26: el destinatario natural es **el encargado del caso por
 * parte de la clínica** — pero ese dato NO EXISTE todavía. `CaseManager` es del
 * lado del bufete (apunta a `Lawyer`), y del lado nuestro el caso no tiene
 * dueño; se va a asignar al crearlo, y eso se debate en la clínica.
 *
 * Así que el destinatario sale de una variable de entorno, y el día que exista
 * el encargado se usa ese y esto queda como respaldo para los casos sin asignar.
 * Se eligió una variable y no un valor en el código para que cambiar quién
 * recibe no necesite un deploy.
 *
 *   VIGIA_REQUEST_RECIPIENTS="devin@…,beatriz@…"
 *
 * Sin la variable NO se inventa un destinatario: se devuelve vacío y la ruta
 * responde 503. Mandarle el pedido "a cualquier admin" es peor que no mandarlo:
 * nadie se hace cargo de lo que llega por accidente.
 */

export interface DestinatarioPedido {
  id: string;
  name: string;
}

/** Emails configurados, normalizados. */
function emailsConfigurados(): string[] {
  return (process.env.VIGIA_REQUEST_RECIPIENTS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function destinatariosDePedidos(): Promise<DestinatarioPedido[]> {
  const emails = emailsConfigurados();
  if (emails.length === 0) return [];

  /**
   * Solo gente INTERNA y activa.
   *
   * El filtro de rol no es decorativo: sin él, configurar por error el email de
   * un abogado mandaría el pedido del bufete a otro bufete. Y `status: ACTIVE`
   * evita escribirle a alguien que ya no trabaja acá.
   */
  const users = await db.user.findMany({
    where: {
      email: { in: emails, mode: 'insensitive' },
      status: 'ACTIVE',
      deletedAt: null,
      role: { in: ['SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'EMPLOYEE', 'FRONT_DESK', 'DOCTOR'] },
    },
    select: { id: true, firstName: true, lastName: true },
  });

  return users.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
  }));
}

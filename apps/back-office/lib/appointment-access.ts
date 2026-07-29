/**
 * Guard compartido de las APIs que trabajan sobre UNA cita (portal médico y
 * Day Admission).
 *
 * Quién pasa (decisión de Erick 2026-07-29):
 *   - el doctor dueño de la cita
 *   - SUPER_ADMIN / ADMIN
 *   - cualquier staff con acceso al back-office (los asistentes son EMPLOYEE):
 *     completan la nota en borrador y las órdenes cuando el doctor no lo hace.
 *     Flujo de escriba médico — el audit log guarda quién escribió.
 *
 * `requireProvider` deja fuera al staff: se usa para la FIRMA de la nota, que es
 * la firma legal del médico y no se delega.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { fetchDbRole, fetchRoleClinicAccess } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';

export interface ApptActor {
  email: string;
  /** Nombre para los snapshots ("ordenado por", "resultado subido por") */
  name: string;
  /** true solo si es el doctor de la cita */
  isProviderOwner: boolean;
  role: string;
}

/** @deprecated nombre viejo — usar ApptActor */
export type LabActor = ApptActor;

type Result =
  | { deny: NextResponse; actor?: never }
  | { deny?: never; actor: ApptActor };

interface Options {
  /** Solo el doctor de la cita (o admin) — para firmar la nota */
  requireProvider?: boolean;
}

export async function checkAppointmentAccess(
  appointmentId: string,
  opts: Options = {},
): Promise<Result> {
  const user = await getSessionUser();
  const email = user?.email;
  if (!email) return { deny: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { provider: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!appt) return { deny: NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) };

  const role = await fetchDbRole(email);

  // 1 — El doctor de la cita
  if (appt.provider?.email?.toLowerCase() === email.toLowerCase()) {
    return {
      actor: {
        email,
        name: `Dr. ${appt.provider.firstName} ${appt.provider.lastName}`.trim(),
        isProviderOwner: true,
        role,
      },
    };
  }

  // 2 — Admins
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return { actor: { email, name: email, isProviderOwner: false, role } };
  }

  // 3 — Staff del back-office (asistentes). No firma notas.
  if (!opts.requireProvider && await fetchRoleClinicAccess(role)) {
    return { actor: { email, name: email, isProviderOwner: false, role } };
  }

  return { deny: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
}

/** Igual que el anterior, pero partiendo del id de una orden de laboratorio. */
export async function checkOrderAccess(orderId: string): Promise<Result> {
  const order = await db.labOrder.findUnique({
    where: { id: orderId },
    select: { appointmentId: true },
  });
  if (!order) return { deny: NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) };
  return checkAppointmentAccess(order.appointmentId);
}

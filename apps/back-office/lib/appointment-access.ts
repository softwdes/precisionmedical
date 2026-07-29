/**
 * Guard compartido de las APIs del portal médico sobre UNA cita.
 *
 * Misma regla que la nota clínica: pasa el doctor dueño de la cita, o
 * SUPER_ADMIN / ADMIN (soporte y registro del resultado desde el back-office).
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';

export interface LabActor {
  email: string;
  /** Nombre para el snapshot de "ordenado por" / "resultado subido por" */
  name: string;
  isProviderOwner: boolean;
}

/** Email de la sesión (memorizado por request). Null si no hay sesión. */
async function sessionEmail(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.email ?? null;
}

/**
 * Verifica acceso a la cita.
 * @returns `{ deny }` con la respuesta de error, o `{ actor }` si está autorizado.
 */
export async function checkAppointmentAccess(
  appointmentId: string,
): Promise<{ deny: NextResponse; actor?: never } | { deny?: never; actor: LabActor }> {
  const email = await sessionEmail();
  if (!email) return { deny: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { provider: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!appt) return { deny: NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) };

  if (appt.provider?.email?.toLowerCase() === email.toLowerCase()) {
    return {
      actor: {
        email,
        name: `Dr. ${appt.provider.firstName} ${appt.provider.lastName}`.trim(),
        isProviderOwner: true,
      },
    };
  }

  const role = await fetchDbRole(email);
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return { actor: { email, name: email, isProviderOwner: false } };
  }

  return { deny: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
}

/** Igual que el anterior, pero partiendo del id de una orden. */
export async function checkOrderAccess(
  orderId: string,
): Promise<{ deny: NextResponse; actor?: never } | { deny?: never; actor: LabActor }> {
  const order = await db.labOrder.findUnique({
    where: { id: orderId },
    select: { appointmentId: true },
  });
  if (!order) return { deny: NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) };
  return checkAppointmentAccess(order.appointmentId);
}

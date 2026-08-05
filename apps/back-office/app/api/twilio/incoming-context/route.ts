/**
 * GET /api/twilio/incoming-context?from=+1801... — quién llama y por qué.
 *
 * Lo pide el navegador mientras el teléfono suena, así que tiene que ser
 * barato: el valor de atender sabiendo quién llama se pierde si el dato llega
 * después de que la persona ya dijo "hola".
 *
 * Devuelve el paciente reconocido y su contexto clínico inmediato: caso activo
 * y próxima cita. El estado de admisión que propone el mockup queda afuera a
 * propósito — se calcula a partir de `consentsData` con la misma lógica de la
 * lista de pacientes, y duplicarla acá sería una segunda implementación lista
 * para desviarse.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { findPatientsByPhone } from '@/lib/patient-phone-lookup';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const from = new URL(req.url).searchParams.get('from') ?? '';
  const matches = await findPatientsByPhone(from);

  if (matches.length === 0) {
    return NextResponse.json({ patient: null, sharedBy: 0, activeCase: null, nextAppointment: null });
  }

  // Con varios pacientes en el mismo número no se elige: se muestra el primero
  // y se avisa. Afirmar quién llama cuando no lo sabemos es peor que no saberlo.
  const p = matches[0]!;

  const [activeCase, nextAppointment] = await Promise.all([
    db.case.findFirst({
      where:   { patientId: p.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, caseCode: true, caseType: true, status: true },
    }),
    db.appointment.findFirst({
      where:   { patientId: p.id, scheduledFor: { gte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      select:  {
        id: true, scheduledFor: true,
        provider: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    patient: {
      id: p.id,
      patientCode: p.patientCode,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: dec(p.phone),
    },
    /** >1 = el número lo comparten varios pacientes; el nombre es una deducción. */
    sharedBy: matches.length,
    activeCase,
    nextAppointment: nextAppointment && {
      id: nextAppointment.id,
      scheduledFor: nextAppointment.scheduledFor.toISOString(),
      providerName: nextAppointment.provider
        ? `${nextAppointment.provider.firstName} ${nextAppointment.provider.lastName}`.trim()
        : null,
    },
  });
}

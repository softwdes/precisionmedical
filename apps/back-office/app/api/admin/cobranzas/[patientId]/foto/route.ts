/**
 * GET /api/admin/cobranzas/[patientId]/foto
 *
 *   La foto del paciente con una URL RECIÉN firmada, para abrirla en grande.
 *
 * ## Por qué no alcanza la de la lista
 *
 * Las URLs del bucket privado vienen firmadas y **vencen a los 15 minutos**. La
 * lista de pacientes se vuelve a pedir al navegar, así que ahí la de la carita
 * chiquita siempre está fresca; Cobranzas no: es una COLA DE TRABAJO que se
 * deja abierta mientras se llama por teléfono y se revisan facturas. Media hora
 * después, la URL que trajo la lista ya venció y agrandar la foto mostraría el
 * ícono de imagen rota — justo en la pantalla donde la cara sirve para
 * confirmar que el que está del otro lado es quien dice ser.
 *
 * Por eso el clic pide una URL nueva. Es una consulta y una firma: más barato
 * que recargar la lista entera, y no depende de cuánto tiempo estuvo abierta.
 *
 * El pulgar de 24px sigue saliendo de la lista. Si vence, se ve mal un círculo
 * chiquito; agrandar, que es la acción, siempre funciona.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import { selfiesDePacientes } from '@/lib/fotos-identidad';
import { resolveActor } from '@/lib/actor';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ patientId: string }> },
): Promise<NextResponse> {
  // Misma puerta que el resto de Cobranzas: back-office sí, portal no.
  const acceso = await checkPatientStaff();
  if (acceso.deny) return acceso.deny;
  if (acceso.actor?.portalOnly) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { patientId } = await ctx.params;

  const paciente = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, patientCode: true },
  });
  if (!paciente) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  /**
   * El audit va ANTES de servir, y con `await`.
   *
   * Es un documento de identidad de un paciente: si se entrega la URL y el
   * registro falla después, quedó divulgado sin constancia. Ver la regla del
   * proyecto sobre el audit de divulgación.
   */
  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'VIEW_PATIENT_PHOTO',
    entityType: 'patients',
    entityId: patientId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { patientCode: paciente.patientCode, desde: 'cobranzas' },
  });

  const selfies = await selfiesDePacientes([patientId]).catch(() => new Map<string, string>());

  return NextResponse.json({
    photoUrl: selfies.get(patientId) ?? null,
    nombre: `${paciente.firstName} ${paciente.lastName}`.trim(),
  });
}

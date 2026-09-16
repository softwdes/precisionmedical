/**
 * GET /api/admin/cobranzas/[patientId]
 *
 *   El detalle que se abre al desplegar una fila de la cola de cobranzas:
 *   los casos con saldo (para saber contra cuál cobrar) y TODOS los pagos ya
 *   registrados del paciente.
 *
 *   Se pide bajo demanda, una fila a la vez. Traerlo con la lista sería cargar
 *   546 pagos para mostrar diez filas — y sobre todo, sería servir el historial
 *   de plata de 5.738 pacientes a quien solo abrió la pantalla.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import { resolveActor } from '@/lib/actor';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ patientId: string }> },
): Promise<NextResponse> {
  /**
   * Cobranzas es del back-office, no del portal.
   *
   * No se usa `{ admin: true }`: esa lista es la del MOSTRADOR y deja afuera a
   * CONTADOR, que es justamente el rol del encargado de cobranza. Lo que hay
   * que cerrar acá es el portal —un provider no tiene nada que hacer viendo la
   * deuda de la clínica entera— y eso lo dice `portalOnly`.
   */
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
   * El audit se escribe ANTES de servir el dato y con `await`.
   *
   * Acá se abre el expediente económico de un paciente ajeno. Si se sirviera
   * primero y el registro fallara después, habría divulgación sin constancia.
   * Ver la regla del proyecto sobre el audit de divulgación.
   */
  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'VIEW_PATIENT_COLLECTIONS',
    entityType: 'patients',
    entityId: patientId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { patientCode: paciente.patientCode },
  });

  const casos = await db.case.findMany({
    where: { patientId, deletedAt: null },
    select: {
      id: true, caseCode: true, caseType: true, status: true,
      lawFirm: { select: { id: true, firmName: true } },
      primaryInsurance: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const caseIds = casos.map(c => c.id);

  /**
   * `AppointmentBilling.caseId` es un String suelto, sin relación de Prisma, y
   * además puede venir en NULL: hay un cargo (uno, de $10) que solo llega al
   * caso por su cita. Por eso el mismo `OR` que usa la pantalla del caso — si
   * acá se filtrara solo por `caseId`, el total del paciente no coincidiría
   * con el de su propio expediente.
   */
  const cargos = caseIds.length === 0 ? [] : await db.appointmentBilling.findMany({
    where: {
      OR: [
        { caseId: { in: caseIds } },
        { appointment: { caseId: { in: caseIds } } },
      ],
    },
    select: {
      id: true, caseId: true, totalCost: true, amountPaid: true, balanceDue: true,
      serviceCode: true, serviceDescription: true,
      appointment: { select: { id: true, caseId: true, scheduledFor: true } },
      payments: {
        where: { status: { not: 'CANCELLED' } },
        select: {
          id: true, amount: true, discount: true, source: true, method: true,
          paymentType: true, notes: true, paidAt: true, createdAt: true,
          insuranceCarrier: { select: { id: true, name: true } },
        },
      },
    },
  });

  const porCaso = new Map<string, typeof cargos>();
  for (const b of cargos) {
    const cid = b.caseId ?? b.appointment?.caseId ?? null;
    if (!cid) continue;
    const lista = porCaso.get(cid);
    if (lista) lista.push(b); else porCaso.set(cid, [b]);
  }

  /**
   * Un renglón por caso, con su saldo. Es lo que decide si el botón de cobrar
   * puede ir directo al modal o tiene que preguntar contra cuál caso.
   *
   * Los dos circuitos NO se mezclan nunca en un mismo cobro (regla de Erick,
   * 2026-08-08), y eso incluye no mezclar dos casos: un MVA lo paga el abogado
   * del acuerdo y un GENERAL lo paga el paciente o su seguro de salud.
   */
  const casosResumen = casos.map(c => {
    const suyos  = porCaso.get(c.id) ?? [];
    const total  = suyos.reduce((s, b) => s + Number(b.totalCost), 0);
    const pagado = suyos.reduce((s, b) => s + Number(b.amountPaid), 0);
    const deuda  = suyos.reduce((s, b) => s + Number(b.balanceDue), 0);
    return {
      caseId:   c.id,
      caseCode: c.caseCode,
      caseType: c.caseType,
      status:   c.status,
      bufete:   c.lawFirm?.firmName ?? null,
      aseguradora: c.primaryInsurance?.name ?? null,
      total, pagado, deuda,
      /** Igual que en la lista: despejado de los otros tres, nunca sumado. */
      descontado: total - pagado - deuda,
      cargos: suyos.length,
    };
  });

  /**
   * Los pagos, planos y ordenados del más nuevo al más viejo.
   *
   * Cada uno dice contra QUÉ se aplicó (servicio + visita + caso): un monto
   * suelto con su fecha no le sirve a quien concilia contra una factura.
   *
   * ⚠️ Falta "quién lo registró". No está en ningún lado: `billing_payments` no
   * tiene autor y **ninguno de los 546 pagos tiene entrada de auditoría**
   * (todos vinieron de la migración del v2, y por v3 todavía no se registró
   * ninguno). Es una decisión pendiente de Erick, no un campo que me olvidé.
   */
  const codigoDe = new Map(casos.map(c => [c.id, c.caseCode]));
  const pagos = cargos.flatMap(b => {
    const cid = b.caseId ?? b.appointment?.caseId ?? null;
    return b.payments.map(p => ({
      id: p.id,
      billingId: b.id,
      caseId: cid,
      caseCode: cid ? codigoDe.get(cid) ?? null : null,
      amount:   Number(p.amount),
      discount: Number(p.discount),
      source:   p.source,
      method:   p.method,
      paymentType: p.paymentType,
      insuranceCarrier: p.insuranceCarrier,
      notes: p.notes,
      paidAt: p.paidAt ?? p.createdAt,
      serviceCode: b.serviceCode,
      serviceDescription: b.serviceDescription,
      appointmentDate: b.appointment?.scheduledFor ?? null,
    }));
  }).sort((a, z) => new Date(z.paidAt).getTime() - new Date(a.paidAt).getTime());

  return NextResponse.json({
    patient: {
      id: paciente.id,
      patientCode: paciente.patientCode,
      firstName: paciente.firstName,
      lastName: paciente.lastName,
    },
    casos: casosResumen,
    pagos,
  });
}

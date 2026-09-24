/**
 * GET /api/admin/cases/[id]/billing
 *   Lista los registros de facturación del caso (AppointmentBilling + pagos).
 *   Ordenados por fecha de cita descendente (más reciente primero).
 *   Incluye KPIs agregados: totalCost, totalPaid, totalBalance.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      deletedAt: true,
      /**
       * Para el encabezado del modal de cobro. Quien cobra desde Finanzas pasa
       * de un paciente a otro sin abrir la ficha de ninguno: el modal decía solo
       * "Pago del caso" y no había forma de saber de quién era la cuenta que se
       * tenía adelante (Erick, 2026-09-22, mirándolo).
       */
      caseCode: true,
      patient: { select: { firstName: true, lastName: true } },
      /** Para decir QUIÉN paga arriba del cobro, al lado del nombre. */
      primaryPolicyNumber: true,
      primaryInsurance:   { select: { id: true, name: true } },
      secondaryInsurance: { select: { id: true, name: true } },
    },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const insurances = [
    caseRecord.primaryInsurance   ? { ...caseRecord.primaryInsurance,   label: `${caseRecord.primaryInsurance.name} (Principal)` }   : null,
    caseRecord.secondaryInsurance ? { ...caseRecord.secondaryInsurance, label: `${caseRecord.secondaryInsurance.name} (Secundario)` } : null,
  ].filter(Boolean);

  const billings = await db.appointmentBilling.findMany({
    where: {
      OR: [
        { caseId },
        { appointment: { caseId } },
      ],
    },
    include: {
      appointment: {
        select: {
          id: true, scheduledFor: true, status: true,
          /**
           * En qué clínica fue la visita, con su color.
           *
           * Son SIETE sedes y el equipo se orienta por el color que tienen
           * puesto en Settings — Darrell trabaja así (Erick, 2026-09-23). El
           * cobro no mostraba la clínica en ningún lado: dos visitas del mismo
           * paciente en la misma semana se veían idénticas aunque fueran de
           * West Valley y de Provo.
           */
          clinic: { select: { name: true, color: true } },
        },
      },
      payments: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { paidAt: 'desc' },
        include: {
          insuranceCarrier: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Sort by appointment date desc (most recent first)
  billings.sort((a, b) => {
    const da = a.appointment?.scheduledFor?.getTime() ?? 0;
    const db2 = b.appointment?.scheduledFor?.getTime() ?? 0;
    return db2 - da;
  });

  // Serialize Decimals to numbers for JSON transport
  const serialized = billings.map(b => ({
    id: b.id,
    appointmentId: b.appointmentId,
    appointmentDate: b.appointment?.scheduledFor ?? null,
    /** La sede de la visita y su color. `null` en un cargo sin cita. */
    clinicName: b.appointment?.clinic?.name ?? null,
    clinicColor: b.appointment?.clinic?.color ?? null,
    appointmentStatus: b.appointment?.status ?? null,
    serviceCode: (b as Record<string, unknown>).serviceCode as string | null ?? null,
    serviceDescription: (b as Record<string, unknown>).serviceDescription as string | null ?? null,
    /**
     * Quién paga esta línea — son dos circuitos con tiempos distintos
     * (regla de Erick 2026-08-08):
     *  · PATIENT   — férulas, servicios/inyectables del catálogo cash y
     *    laboratorios. Se cobran EN EL MOMENTO, al salir.
     *  · INSURANCE — los CPT. La clínica solo anota los códigos; después el
     *    encargado le cobra al seguro o al abogado, y eso puede tardar MESES.
     *    Nunca se le pide al paciente en el mostrador.
     */
    payer: (b.braceId || b.cashServiceId || b.labOrderId)
      ? 'PATIENT' as const
      : 'INSURANCE' as const,
    /**
     * Vino del v2. La marca NO cambia quién paga: cambia DÓNDE se muestra.
     *
     * Un cargo migrado no tiene férula, servicio de mostrador ni laboratorio,
     * así que el `payer` de arriba lo manda al circuito del seguro y la
     * pantalla —que solo lista lo del mostrador— lo escondía por completo: un
     * caso con $26.945 de saldo se veía en $0.00. Con esto el cliente lo saca
     * en su propia sección, de solo lectura, sin sumarlo a ningún total de
     * cobro. Ver `prisma/sql/20260915-cargos-del-v2.sql`.
     */
    migratedFromV2: b.migratedFromV2,
    /**
     * De dónde nació el cargo. El `payer` dice QUIÉN paga; esto dice QUÉ es.
     *
     * En el modal de cobro las líneas salían todas bajo "SERVICE": dos
     * laboratorios y una inyección se veían idénticas, y el que cobra no sabía
     * qué estaba cobrando (Erick, 2026-08-13). Además explica por qué el total
     * del cobro es mayor que el del tab de Servicios — ahí los labs no están.
     */
    origin: b.labOrderId ? 'LAB' as const
          : b.cashServiceId ? 'CASH' as const
          : b.braceId ? 'BRACE' as const
          : 'CPT' as const,
    totalCost: Number(b.totalCost),
    discount: Number(b.discount),
    insuranceCovered: Number(b.insuranceCovered),
    amountPaid: Number(b.amountPaid),
    balanceDue: Number(b.balanceDue),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    payments: b.payments.map(p => ({
      id: p.id,
      amount: Number(p.amount),
      /** Lo perdonado en ESE cobro. Baja el saldo y no cuenta como cobrado. */
      discount: Number(p.discount),
      source: p.source,
      paymentType: p.paymentType,
      method: p.method,
      status: p.status,
      insuranceCarrier: p.insuranceCarrier,
      notes: p.notes,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
  }));

  const totalCost    = serialized.reduce((s, b) => s + b.totalCost, 0);
  const totalPaid    = serialized.reduce((s, b) => s + b.amountPaid, 0);
  const totalBalance = serialized.reduce((s, b) => s + b.balanceDue, 0);
  // Los dos saldos NO se mezclan: uno se cobra hoy en el mostrador, el otro
  // lo gestiona el encargado con el seguro o el abogado y puede tardar meses.
  const patientBalance   = serialized.filter(b => b.payer === 'PATIENT').reduce((s, b) => s + b.balanceDue, 0);
  const insuranceBalance = serialized.filter(b => b.payer === 'INSURANCE').reduce((s, b) => s + b.balanceDue, 0);

  /**
   * Lo cobrado, por QUIÉN LO PUSO — se mira el `source` del pago, no de qué
   * circuito es la línea. No es lo mismo: un copago es plata del PACIENTE
   * sobre un CPT que se le factura al SEGURO, y pasa de verdad. Con un solo
   * "Total pagado" no había forma de saber de dónde salió esa plata.
   */
  const pagos = serialized.flatMap(b => b.payments).filter(p => p.status !== 'CANCELLED');
  const suma = (src: string): number =>
    pagos.filter(p => p.source === src).reduce((s, p) => s + p.amount, 0);
  const paidByPatient   = suma('PATIENT');
  const paidByInsurance = suma('INSURANCE') + suma('LAWYER');

  /**
   * Lo PERDONADO, aparte de lo cobrado.
   *
   * No entra en "Total cobrado" a propósito: es plata que la clínica resignó,
   * no que recibió, y sumarla ahí haría que el mostrador vea ingresos que no
   * existieron. Se muestra sola, y solo cuando hay algo que mostrar.
   */
  const totalDiscount = pagos.reduce((s, p) => s + p.discount, 0);

  /**
   * Lo del PACIENTE, que es lo único que se cobra en el mostrador.
   *
   * Los CPT no van en Finanzas del caso: se anotan y los cobra Cobranzas al
   * seguro o al abogado meses (o años) después — regla de Erick 2026-08-10. El
   * mostrador que ve ese total pendiente termina pidiéndoselo al paciente.
   */
  const delPaciente = serialized.filter(b => b.payer === 'PATIENT');
  const patientCost = delPaciente.reduce((s, b) => s + b.totalCost, 0);
  const patientPaid = delPaciente.reduce((s, b) => s + b.amountPaid, 0);

  /**
   * Historial de pagos, plano y sin los anulados.
   *
   * Antes solo se podía ver expandiendo servicio por servicio, así que "cuándo
   * pagó y cuánto" obligaba a abrir doce filas y sumar a mano. Los anulados no
   * aparecen: el mostrador ve lo que entró, y la anulación queda en el AuditLog
   * (CANCEL_BILLING_PAYMENT) para quien tenga que auditar.
   */
  const payments = serialized.flatMap(b => b.payments
    .filter(p => p.status !== 'CANCELLED')
    .map(p => ({
      id: p.id,
      billingId: b.id,
      amount: p.amount,
      discount: p.discount,
      source: p.source,
      method: p.method,
      paymentType: p.paymentType,
      insuranceCarrier: p.insuranceCarrier,
      notes: p.notes,
      paidAt: p.paidAt ?? p.createdAt,
      appointmentId: b.appointmentId,
      appointmentDate: b.appointmentDate,
      clinicName: b.clinicName,
      clinicColor: b.clinicColor,
      serviceCode: b.serviceCode,
      serviceDescription: b.serviceDescription,
    })))
    .sort((a, z) => new Date(z.paidAt).getTime() - new Date(a.paidAt).getTime());

  return NextResponse.json({
    /** Quién es el dueño de esta cuenta — lo muestra el encabezado del cobro. */
    caso: {
      caseCode: caseRecord.caseCode,
      paciente: `${caseRecord.patient?.firstName ?? ''} ${caseRecord.patient?.lastName ?? ''}`.trim() || null,
      /**
       * La aseguradora del caso, para el encabezado del cobro.
       *
       * `null` cuando no hay ninguna cargada, y el encabezado lo DICE en vez de
       * dejar el lugar en blanco: un hueco deja al que cobra sin saber si el
       * sistema no lo sabe o si él no encontró dónde mirar. Darrell, 2026-09-22:
       * *"I can't find where the details for the patient is to even find out
       * what insurance he has."*
       *
       * Sale de `primaryInsuranceId`, el carrier normalizado — el único que
       * está poblado de verdad: 577 de los 1.096 casos de medicina general con
       * cita este año lo tienen (medido 2026-09-22), contra 18 que traen algo
       * del intake y 0 con `coverageCarrierName`. "Self Pay" y "Direct Care
       * Membership" están cargados COMO aseguradora, así que el campo también
       * responde por los que pagan de su bolsillo.
       *
       * Los últimos 4 de la póliza y no la póliza entera: alcanza para cotejar
       * contra la tarjeta y no desparrama el número por una pantalla que se
       * mira con el paciente enfrente.
       */
      seguro: caseRecord.primaryInsurance?.name ?? null,
      polizaFin: caseRecord.primaryPolicyNumber?.trim()
        ? caseRecord.primaryPolicyNumber.trim().slice(-4)
        : null,
    },
    billings: serialized,
    kpis: {
      totalCost, totalPaid, totalBalance, patientBalance, insuranceBalance,
      paidByPatient, paidByInsurance, patientCost, patientPaid, totalDiscount,
    },
    payments,
    insurances,
  });
}

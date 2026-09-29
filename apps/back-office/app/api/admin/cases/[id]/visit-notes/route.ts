/**
 * GET /api/admin/cases/[id]/visit-notes
 *
 * Las notas clínicas de las visitas de UN caso, una por cita.
 *
 * Vive en el tab Citas del caso, junto a la cita que la produjo (decisión de
 * Erick, 2026-08-13). Antes esto era un endpoint por PACIENTE que alimentaba una
 * sección del Historial Médico, y estaba mal de raíz: el Historial Médico es la
 * ficha clínica del paciente —alergias, problemas, medicamentos—, no el archivo
 * de notas. La nota pertenece a una cita, y una cita pertenece a un caso.
 *
 * El corte por caso además deja de mandar PHI de más: la vista de un caso no
 * tiene por qué recibir las notas de otro caso del mismo paciente.
 *
 * Devuelve las CERRADAS y las abiertas, con su estado: un borrador también es
 * parte del registro de esa visita, y verlo acá le dice al doctor que tiene algo
 * sin terminar. Las anuladas (VOIDED) quedan afuera.
 *
 * Orden: la visita MÁS RECIENTE primero — al revés que la cola de pendientes, que
 * ordena por la más vieja porque ahí lo que importa es el atraso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { evaluarReapertura } from '@/lib/visit-note-reopen';

type Ctx = { params: Promise<{ id: string }> };

export interface CaseVisitNote {
  appointmentId: string;
  scheduledFor: string;
  status: 'DRAFT' | 'SIGNED' | 'ARCHIVED';
  signedAt: string | null;
  signedByName: string | null;
  providerName: string | null;
  clinicName: string | null;
  /** Secciones tal como las guardó el editor (HTML). Se sanean al renderizar. */
  chiefComplaint: string | null;
  hpi: string | null;
  ros: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
  diagnoses: Array<{ icd10Code: string | null; icd10Label: string | null }>;
  /**
   * LOS ADDENDA SON PARTE DEL DOCUMENTO.
   *
   * Faltaban: el caso mostraba el cuerpo de la nota y nada de lo agregado
   * después de firmar. Quien abría el expediente para leer una visita corregida
   * veía la versión sin la corrección — un archivo incompleto, que es peor que
   * no tenerlo, porque parece completo.
   */
  addenda: Array<{
    id: string; numero: number; texto: string;
    signedAt: string; signedByName: string | null;
  }>;
  /**
   * Si esta persona puede agregar uno. Lo decide el SERVIDOR con la misma regla
   * que aplica la ruta que los crea —dueño de la nota o admin, sobre una nota
   * firmada y no reabierta—, para que la pantalla no la reescriba por su cuenta
   * y terminen discrepando.
   */
  puedeAgregarAddendum: boolean;
  /** Por qué no puede, cuando no puede: la pantalla lo explica en vez de esconder. */
  motivoSinAddendum: 'no-es-suya' | 'sin-firmar' | 'reabierta' | null;
  /**
   * LA VENTANA DE CORRECCIÓN, dicha en voz alta.
   *
   * Reabrir una nota firmada solo se puede dentro de las 48 h siguientes a la
   * firma (regla de Devin). Pasado eso el botón desaparece — correctamente —
   * pero la pantalla no lo explicaba en ningún lado, así que el propio Devin
   * preguntó qué le había pasado al botón (2026-09-29).
   *
   * `null` cuando no aplica: la nota no está firmada, o ya se reabrió.
   */
  ventanaCorreccion: { abierta: boolean; venceEn: string } | null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id: caseId } = await ctx.params;

  const rows = await db.visitNote.findMany({
    where: {
      /**
       * Las ARCHIVADAS también.
       *
       * Archivar saca la nota de la cola de trabajo, no del expediente: las 161
       * que entraron con la migración tienen texto clínico real y 142 tienen CPT.
       * Esconderlas acá sería perder el historial del paciente para arreglar una
       * lista de tareas. Las VOIDED siguen afuera, que esas sí se declararon sin
       * valor.
       */
      status: { in: ['DRAFT', 'SIGNED', 'ARCHIVED'] },
      appointment: { caseId },
    },
    orderBy: { appointment: { scheduledFor: 'desc' } },
    select: {
      status: true,
      signedAt: true,
      signedByName: true,
      reopenedAt: true,
      signedById: true,
      addenda: {
        orderBy: { numero: 'asc' },
        select: { id: true, numero: true, texto: true, signedAt: true, signedByName: true },
      },
      chiefComplaint: true,
      hpi: true,
      ros: true,
      physicalExam: true,
      assessment: true,
      plan: true,
      diagnoses: {
        orderBy: { sortOrder: 'asc' },
        select: { icd10Code: true, icd10Label: true },
      },
      appointment: {
        select: {
          id: true,
          scheduledFor: true,
          // El correo es con lo que la ruta de addenda decide si es tuya.
          provider: { select: { firstName: true, lastName: true, email: true } },
          clinic: { select: { name: true } },
        },
      },
    },
  });

  /**
   * La MISMA regla que `visit-notes/[appointmentId]/addenda`: dueño o admin.
   * Se calcula acá una sola vez en vez de por nota, y se aplica igual — si un
   * día cambia allá, este es el otro lugar que hay que tocar.
   */
  const role = await fetchDbRole(user.email);
  const esAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const miCorreo = user.email.toLowerCase();

  const notes: CaseVisitNote[] = rows.map((n) => ({
    appointmentId: n.appointment.id,
    scheduledFor: n.appointment.scheduledFor.toISOString(),
    status: n.status as 'DRAFT' | 'SIGNED',
    addenda: n.addenda.map((a) => ({
      id: a.id, numero: a.numero, texto: a.texto,
      signedAt: a.signedAt.toISOString(), signedByName: a.signedByName,
    })),
    /**
     * Se calcula con `evaluarReapertura`, el MISMO helper que usa la ruta que
     * reabre. Recalcular acá las 48 h a mano sería tener la regla escrita en
     * dos lugares: el día que cambie, la pantalla del caso mentiría.
     *
     * Se pregunta con el usuario REAL, y de la respuesta se usa solo el
     * vencimiento: lo que esta línea informa es el estado de la VENTANA, no si
     * esta persona en particular puede reabrir.
     */
    ventanaCorreccion: (() => {
      if (n.status !== 'SIGNED' || !n.signedAt || n.reopenedAt) return null;
      const v = evaluarReapertura(
        { status: n.status, signedAt: n.signedAt, signedById: null, reopenedAt: n.reopenedAt },
        null, null, new Date(),
      );
      if (!v.venceEn) return null;
      return { abierta: v.motivo !== 'ventana-vencida', venceEn: v.venceEn.toISOString() };
    })(),
    ...(() => {
      const suya = n.appointment.provider?.email?.toLowerCase() === miCorreo;
      if (n.status !== 'SIGNED') return { puedeAgregarAddendum: false, motivoSinAddendum: 'sin-firmar' as const };
      if (n.reopenedAt)          return { puedeAgregarAddendum: false, motivoSinAddendum: 'reabierta' as const };
      if (!suya && !esAdmin)     return { puedeAgregarAddendum: false, motivoSinAddendum: 'no-es-suya' as const };
      return { puedeAgregarAddendum: true, motivoSinAddendum: null };
    })(),
    signedAt: n.signedAt?.toISOString() ?? null,
    signedByName: n.signedByName,
    providerName: n.appointment.provider
      ? `${n.appointment.provider.firstName} ${n.appointment.provider.lastName}`.trim()
      : null,
    clinicName: n.appointment.clinic?.name ?? null,
    chiefComplaint: n.chiefComplaint,
    hpi: n.hpi,
    ros: n.ros,
    physicalExam: n.physicalExam,
    assessment: n.assessment,
    plan: n.plan,
    diagnoses: n.diagnoses,
  }));

  return NextResponse.json({
    notes,
    signed: notes.filter((n) => n.status === 'SIGNED').length,
    open: notes.filter((n) => n.status === 'DRAFT').length,
  });
}

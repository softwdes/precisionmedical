/**
 * GET /api/admin/patients/[id]/visit-notes
 *
 * Las notas anteriores de UN PACIENTE, para traer texto de una visita previa a
 * la que se está escribiendo.
 *
 * Pedido de Devin (2026-09-17): *"Need to pull from prior visits with a dropdown
 * of visits so you can choose which to pull and choose all sections or just
 * certain sections."*
 *
 * ── Por qué por PACIENTE y no por caso ──────────────────────────────────────
 *
 * Decisión de Erick (2026-09-18), textual: *"traer notas anteriores de uno mismo
 * y de otros providers que escribieron en ese paciente anteriormente"*.
 *
 * Existe `cases/[id]/visit-notes`, que corta por CASO y cuyo docblock explica
 * por qué: la vista de un caso no tiene por qué recibir las notas de otro caso.
 * Eso sigue siendo cierto **para esa pantalla**. Acá la pregunta es otra —"¿qué
 * se le escribió antes a esta persona?"— y es la misma regla que ya rige desde
 * el 16-sep: el provider ve la clínica entera sin restricción. Sería incoherente
 * darle la ficha completa y esconderle lo que un colega escribió en ella.
 *
 * Por eso son DOS endpoints y no uno con bandera: preguntas distintas, alcances
 * distintos, y cada uno con su motivo escrito.
 *
 * ── Las ARCHIVED van INCLUIDAS ──────────────────────────────────────────────
 *
 * Y son la mayoría de lo que hay: tras el archivado del 22-sep, 161 de las 168
 * notas de la base están archivadas. Son las que vinieron de Medusa — es decir,
 * **exactamente el historial que Devin quiere traer**. Filtrando solo
 * DRAFT/SIGNED este endpoint encontraría 7 notas en toda la clínica.
 *
 * Archivar sacó la nota de la cola de trabajo, no del registro del paciente.
 *
 * ── La columna MOTIVO, en tres escalones ────────────────────────────────────
 *
 * Devin sobre Medusa: *"none of the visits in this particular chart have a
 * 'reason for visit' listed… if there was reason for visit listed, selecting a
 * prior visit would be much easier"*. Es la única objeción que le puso al flujo.
 *
 * Hacerlo obligatorio al agendar arregla el futuro y deja el pasado igual: de
 * las 168 notas que hay, solo 69 tienen motivo escrito. Así que la lista cae en
 * cascada, y DICE de dónde sacó cada texto:
 *
 *   1. `Appointment.notes` — el "Reason for visit" del diálogo de cita  → 69
 *   2. la queja principal de esa nota                                   → +11
 *   3. las primeras palabras del HPI                                    → +88
 *                                                                  ───────────
 *                                                                   168 de 168
 *
 * La marca (`motivoOrigen`) no es decoración: sin ella, un fragmento de HPI se
 * leería como si alguien lo hubiera escrito a propósito como motivo de la visita.
 *
 * ── Los borradores: SOLO los propios ────────────────────────────────────────
 *
 * Un borrador es texto que nadie atestiguó todavía. El propio sirve —es la nota
 * de esta mañana que se quiere continuar—; el de otro provider a medio escribir
 * no es algo sobre lo que construir. "Propio" se resuelve por el provider de la
 * cita, que es quien la firma.
 *
 * ── La constancia va ANTES ──────────────────────────────────────────────────
 *
 * Esto sirve PHI de otras visitas, así que el registro de divulgación se escribe
 * con `await` y antes de las queries. Si sirviéramos el dato y después fallara
 * el log, habría divulgación sin rastro. Ver `regla-el-audit-de-divulgacion-va-antes`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { getSessionProvider } from '@/lib/get-session-provider';
import { auditarFichaAjenaDesdeLaPagina } from '@/lib/patient-access';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Cuántas visitas trae por defecto. Un paciente de PI de larga data puede tener
 * veinte; todas juntas es exacto pero no se puede usar. Con `?all=1` vienen el
 * resto — la lista nunca esconde en silencio, avisa cuántas quedan.
 */
const TOPE = 10;

/** De dónde salió el texto de la columna "Motivo". */
export type MotivoOrigen = 'cita' | 'queja' | 'hpi' | null;

export interface NotaAnterior {
  appointmentId: string;
  noteId: string;
  scheduledFor: string;
  status: 'DRAFT' | 'SIGNED' | 'ARCHIVED';
  providerName: string | null;
  caseCode: string | null;
  /** La visita es del MISMO caso que se está escribiendo. */
  mismoCaso: boolean;
  /** Cuántas secciones tienen texto — se ve si vale la pena antes de abrirla. */
  secciones: number;
  /** Para qué vino, en una línea. Ver la cascada del docblock. */
  motivo: string | null;
  motivoOrigen: MotivoOrigen;
  /** Los diagnósticos de esa visita, que ahora también se pueden traer. */
  diagnoses: Array<{ icd10Code: string | null; icd10Label: string | null; snomedCode: string | null; snomedLabel: string | null }>;
  chiefComplaint: string | null;
  hpi: string | null;
  ros: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
}

const pelado = (v: string | null): string =>
  (v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/s+/g, ' ').trim();

const conTexto = (v: string | null): boolean => pelado(v).length > 0;

/**
 * El largo del motivo en la lista.
 *
 * 90 caracteres: entra en una fila sin romper el ancho y alcanza para
 * distinguir dos visitas parecidas. Más que eso y la tabla se vuelve un párrafo.
 */
const RECORTE = 90;

const recortar = (v: string): string =>
  v.length <= RECORTE ? v : v.slice(0, RECORTE).replace(/s+S*$/, '') + '…';

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id: patientId } = await ctx.params;
  const url = req.nextUrl.searchParams;
  /** La cita que se está escribiendo — se excluye a sí misma de la lista. */
  const excluir = url.get('excludeAppointment');
  /** El caso en curso, para marcar cuáles son de otro. */
  const casoActual = url.get('caseId');
  const todas = url.get('all') === '1';

  /**
   * ANTES de las queries: quien pide esto está por leer notas de otras visitas.
   *
   * Se reusa el helper del portal en vez de armar el actor a mano — él ya sabe
   * las tres cosas que hay que saber: que solo se registra para los roles del
   * portal, que no se registra si el paciente es suyo, y cómo resolver el
   * `users.id` que espera el audit log. Duplicar eso acá es cómo se desincronizan.
   */
  await auditarFichaAjenaDesdeLaPagina(patientId);

  const provider = await getSessionProvider();

  const rows = await db.visitNote.findMany({
    where: {
      // VOIDED afuera: se declaró sin valor, no es algo de donde copiar.
      status: { in: ['DRAFT', 'SIGNED', 'ARCHIVED'] },
      appointment: {
        patientId,
        ...(excluir ? { id: { not: excluir } } : {}),
      },
      /**
       * Los borradores, solo los propios. Se expresa como OR para no perder las
       * firmadas ni las archivadas de los demás, que sí sirven.
       */
      OR: [
        { status: { in: ['SIGNED', 'ARCHIVED'] } },
        { status: 'DRAFT', appointment: { providerId: provider?.id ?? '—' } },
      ],
    },
    orderBy: { appointment: { scheduledFor: 'desc' } },
    // Uno más que el tope: así se sabe si hay más SIN una segunda query.
    take: todas ? undefined : TOPE + 1,
    select: {
      id: true,
      status: true,
      chiefComplaint: true, hpi: true, ros: true,
      physicalExam: true, assessment: true, plan: true,
      diagnoses: {
        orderBy: { sortOrder: 'asc' },
        select: { icd10Code: true, icd10Label: true, snomedCode: true, snomedLabel: true },
      },
      appointment: {
        select: {
          id: true,
          scheduledFor: true,
          caseId: true,
          // El "Reason for visit" del diálogo de cita: el primer escalón.
          notes: true,
          case: { select: { caseCode: true } },
          provider: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  const hayMas = !todas && rows.length > TOPE;
  const lista = hayMas ? rows.slice(0, TOPE) : rows;

  const notas: NotaAnterior[] = lista.map((n) => {
    const secciones = [n.chiefComplaint, n.hpi, n.ros, n.physicalExam, n.assessment, n.plan]
      .filter(conTexto).length;
    const p = n.appointment.provider;

    // La cascada. El orden importa: lo que alguien escribió a propósito gana
    // sobre lo que deducimos del cuerpo de la nota.
    const deLaCita = (n.appointment.notes ?? '').trim();
    const deLaQueja = pelado(n.chiefComplaint);
    const delHpi = pelado(n.hpi);
    const [motivo, motivoOrigen]: [string | null, NotaAnterior['motivoOrigen']] =
      deLaCita  ? [recortar(deLaCita),  'cita']
    : deLaQueja ? [recortar(deLaQueja), 'queja']
    : delHpi    ? [recortar(delHpi),    'hpi']
    :             [null, null];

    return {
      motivo,
      motivoOrigen,
      diagnoses: n.diagnoses,
      appointmentId: n.appointment.id,
      noteId: n.id,
      scheduledFor: n.appointment.scheduledFor.toISOString(),
      status: n.status as NotaAnterior['status'],
      providerName: p ? `${p.firstName} ${p.lastName}`.trim() : null,
      caseCode: n.appointment.case?.caseCode ?? null,
      mismoCaso: !!casoActual && n.appointment.caseId === casoActual,
      secciones,
      chiefComplaint: n.chiefComplaint,
      hpi: n.hpi,
      ros: n.ros,
      physicalExam: n.physicalExam,
      assessment: n.assessment,
      plan: n.plan,
    };
  });

  return NextResponse.json({ notas, hayMas });
}

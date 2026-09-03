/**
 * GET /api/admin/notes/provider/[providerId] — las visitas de UN provider.
 *
 * Alimenta el modal de `/doctor/notes`: la pantalla principal es solo la lista de
 * providers, y el detalle se pide al abrirlo. Por eso es una API y no parte del
 * server component — el modal se abre sobre la pantalla, sin navegar.
 *
 * Mismo criterio de "cita que debe nota" que todo lo demás (`lib/notes-audit`),
 * así que el número de la fila y lo que se ve adentro no pueden discrepar.
 *
 * NO devuelve contenido clínico: solo el estado de la nota y su firma. El texto
 * se pide aparte, por visita, cuando el supervisor abre una.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { canAuditNotes } from '@/lib/notes-audit-access';
import { getSessionRole, PORTAL_ONLY_ROLES } from '@/lib/get-session-provider';
import {
  COVERAGE_FIELDS, resolveCoverage, serializeCoverage, type CoverageDTO,
} from '@/lib/coverage';
import {
  whereNotas, antiguedadEnDias, estadoDeLaNota, filtrosDesdeParams,
  etapaDeLaVisita, type EtapaVisita,
} from '@/lib/notes-audit';

/** Tope por provider. El que más debe hoy tiene 32; 300 deja aire de sobra. */
const LIMIT = 300;

export interface VisitaDelProvider {
  appointmentId: string;
  scheduledFor: string;
  patientId: string;
  patientName: string;
  caseId: string | null;
  caseCode: string | null;
  clinicName: string;
  estado: ReturnType<typeof estadoDeLaNota>;
  /**
   * Hasta dónde llegó la visita. Va SIEMPRE, no solo cuando falta la nota: en
   * un borrador de una visita que quedó trabada en check-in, saber que el
   * paciente nunca pasó a sala explica por qué la nota quedó a medias.
   */
  etapa: EtapaVisita;
  /** Para el picker de la penalidad, si el supervisor sella un desenlace. */
  coverage: CoverageDTO;
  ageDays: number;
  signedAt: string | null;
  signedByName: string | null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ providerId: string }> },
): Promise<NextResponse> {
  if (!(await canAuditNotes())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { providerId } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  // El provider sale de la RUTA, no de los filtros: el modal es de uno solo y
  // un `?provider=` en la query no puede cambiarlo por otro.
  const filtros = { ...filtrosDesdeParams((k) => sp.get(k) ?? undefined), providerId };

  const rows = await db.appointment.findMany({
    where: whereNotas(filtros),
    orderBy: { scheduledFor: 'desc' },
    take: LIMIT,
    select: {
      id: true,
      scheduledFor: true,
      // Los tres sellos del flujo: llegó, pasó a sala, el doctor cerró.
      status: true,
      checkedInAt: true,
      admittedAt: true,
      doctorDoneAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      case: { select: { id: true, caseCode: true, ...COVERAGE_FIELDS } },
      clinic: { select: { name: true } },
      visitNote: { select: { status: true, signedAt: true, signedByName: true } },
    },
  });

  const visitas: VisitaDelProvider[] = rows.map((a) => ({
    appointmentId: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    patientId: a.patient.id,
    patientName: `${dec(a.patient.firstName) ?? ''} ${dec(a.patient.lastName) ?? ''}`.trim(),
    caseId: a.case?.id ?? null,
    caseCode: a.case?.caseCode ?? null,
    clinicName: a.clinic?.name ?? '—',
    estado: estadoDeLaNota(a.visitNote?.status),
    etapa: etapaDeLaVisita(a),
    coverage: serializeCoverage(resolveCoverage(a.case ?? {})),
    ageDays: antiguedadEnDias(a.scheduledFor),
    signedAt: a.visitNote?.signedAt?.toISOString() ?? null,
    signedByName: a.visitNote?.signedByName ?? null,
  }));

  /**
   * ¿Puede ESTA sesión sellar el desenlace de una cita ajena?
   *
   * Se responde acá y no en el cliente porque es la MISMA condición que aplica
   * `puedeEscribirLaCita` en el PATCH: los roles de back-office escriben la cita
   * de cualquier provider —recepción ya lo hace— y los que viven encerrados en
   * el portal, solo las suyas.
   *
   * Viaja al cliente para poder MOSTRAR el botón y explicar por qué no se puede,
   * en vez de esconderlo. Un botón ausente se lee como que la función no existe;
   * uno bloqueado con su motivo enseña el modelo de permisos. Hoy no cambia nada
   * —los supervisores van a ser ADMIN—, pero el día que alguien reciba la
   * capacidad `notesAudit` con rol de portal, la pantalla lo dice en lugar de
   * tirarle un 403 mudo al hacer clic.
   */
  const rol = await getSessionRole();
  const puedeSellar = !!rol && !PORTAL_ONLY_ROLES.has(rol);

  return NextResponse.json({
    visitas, total: visitas.length, truncado: rows.length === LIMIT, puedeSellar,
  });
}

import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { nombreProviderO } from '@/lib/provider-name';
import {
  whereNotas, antiguedadEnDias, estadoDeLaNota,
  type EstadoNota, type FiltrosNotas,
} from '@/lib/notes-audit';
import { getNotesSummary } from '@/lib/notes-summary';
import { NotesClient, type NotesRow } from './notes-client';

/**
 * Supervisión de notas · carga de datos (F1).
 *
 * Server component, como `patients-data.tsx`: la consulta vive acá y no en una
 * API porque la pantalla no la necesita en vivo — se navega por URL y cada
 * cambio de filtro es una navegación. `/api/admin/pending-notes` sigue siendo
 * para los dos widgets (Mi Día y Day Admission), que sí refrescan por pulso.
 *
 * Las seis secciones de la nota son `@db.Text` y NO se traen: son texto largo
 * por fila y la lista no muestra contenido clínico. Solo el `status` y la firma.
 */

export const PAGE_SIZE = 25;

export interface NotesQuery extends FiltrosNotas {
  page: number;
}

export async function NotesData({ filtros }: { filtros: NotesQuery }): Promise<React.ReactElement> {
  const where = whereNotas(filtros);

  const [rows, total, sinNota, providers, clinics, resumen] = await Promise.all([
    db.appointment.findMany({
      where,
      // La más vieja primero cuando se miran pendientes: el riesgo no es la nota
      // de hoy, es la de hace tres meses. Con las firmadas incluidas la lista es
      // archivo y no cola, así que ahí manda la más reciente.
      orderBy: { scheduledFor: incluyeFirmadas(filtros.estados) ? 'desc' : 'asc' },
      skip: filtros.page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        scheduledFor: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { id: true, caseCode: true } },
        provider: { select: { id: true, firstName: true, lastName: true, userId: true } },
        clinic: { select: { id: true, name: true } },
        visitNote: { select: { status: true, signedAt: true, signedByName: true } },
      },
    }),
    db.appointment.count({ where }),
    // El número que duele, y sale del MISMO filtro: cuántas de estas no tienen
    // ni una línea escrita. Sin esto "147 pendientes" no distingue entre un
    // borrador a medio hacer y una visita que nadie documentó.
    db.appointment.count({ where: { AND: [where, { visitNote: { is: null } }] } }),
    db.provider.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.clinic.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    // KPIs + deuda por provider. NO recibe estado/antigüedad/búsqueda a
    // propósito: describe la foto completa del alcance, no lo que quedó
    // filtrado abajo. Ver la nota en `lib/notes-summary.ts`.
    getNotesSummary({
      clinicId: filtros.clinicId,
      desde: filtros.desde,
      hasta: filtros.hasta,
      providerId: filtros.providerId,
    }),
  ]);

  const notas: NotesRow[] = rows.map((a) => ({
    appointmentId: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    patientId: a.patient.id,
    patientName: `${dec(a.patient.firstName) ?? ''} ${dec(a.patient.lastName) ?? ''}`.trim(),
    caseId: a.case?.id ?? null,
    caseCode: a.case?.caseCode ?? null,
    providerName: nombreProviderO(a.provider, '—'),
    providerUserId: a.provider?.userId ?? null,
    clinicName: a.clinic?.name ?? '—',
    estado: estadoDeLaNota(a.visitNote?.status),
    ageDays: antiguedadEnDias(a.scheduledFor),
    signedAt: a.visitNote?.signedAt?.toISOString() ?? null,
    signedByName: a.visitNote?.signedByName ?? null,
  }));

  return (
    <NotesClient
      rows={notas}
      total={total}
      sinNota={sinNota}
      page={filtros.page}
      pageSize={PAGE_SIZE}
      providers={providers.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }))}
      clinics={clinics}
      resumen={resumen}
    />
  );
}

function incluyeFirmadas(estados?: EstadoNota[]): boolean {
  return !!estados?.some((e) => e === 'signed' || e === 'voided');
}

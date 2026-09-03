/**
 * GET /api/admin/notes/export — el listado de supervisión, en CSV.
 *
 * Exactamente las filas que se están viendo: los filtros se parsean con el
 * MISMO `filtrosDesdeParams` que la página, así que el archivo no puede traer un
 * recorte distinto al de la pantalla que lo pidió.
 *
 * ─── Es la única acción que saca PHI del sistema ────────────────────────────
 *
 * Todo lo demás en esta pantalla se mira adentro. Un CSV se descarga, viaja por
 * mail y sobrevive a cualquier permiso que se revoque después. Por eso:
 *   · exige la capacidad, igual que la pantalla;
 *   · **se audita**, con los filtros usados y cuántas filas salieron. Sin la
 *     traza, el día que aparezca una planilla con pacientes no hay con qué
 *     responder quién la sacó ni de dónde;
 *   · NO lleva contenido clínico. Las mismas columnas de la lista y nada más.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { nombreProviderO } from '@/lib/provider-name';
import { resolveActor } from '@/lib/actor';
import { canAuditNotes } from '@/lib/notes-audit-access';
import {
  filtrosDesdeParams, whereNotas, antiguedadEnDias, estadoDeLaNota, etapaDeLaVisita,
  type EtapaVisita,
} from '@/lib/notes-audit';

/**
 * Tope duro. Sin él, un filtro amplio sobre 14.000 citas arma el archivo entero
 * en memoria y tumba la función. Con el tope el CSV avisa que quedó cortado.
 */
const MAX_FILAS = 5_000;

const ESTADO_CSV: Record<string, string> = {
  none: 'Sin nota', draft: 'Borrador', signed: 'Firmada', voided: 'Anulada',
};

/**
 * Hasta dónde llegó la visita — la misma columna que la pantalla.
 *
 * Va al CSV porque este archivo es justamente el que se usa para repartir el
 * reclamo, y sin esto las 20 que quedaron trabadas en recepción llegan al
 * médico como si fueran notas que no escribió.
 *
 * En castellano y sin i18n, igual que el resto de los encabezados de este
 * archivo: la ruta no tiene locale. Es una inconsistencia conocida — si algún
 * día el CSV se traduce, se traduce entero, no esta columna sola.
 */
const ETAPA_CSV: Record<EtapaVisita, string> = {
  sinLlegada:   'Sin registro de llegada',
  llegoSinSala: 'Llego, nunca paso a sala',
  enSala:       'En consulta, sin cerrar',
  atendida:     'Visita completa',
};

/** Una celda de CSV: comillas dobladas y entrecomillada si hace falta. */
function celda(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await canAuditNotes())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const filtros = filtrosDesdeParams((k) => sp.get(k) ?? undefined);
  const where = whereNotas(filtros);

  const rows = await db.appointment.findMany({
    where,
    orderBy: { scheduledFor: 'asc' },
    take: MAX_FILAS,
    select: {
      id: true,
      scheduledFor: true,
      status: true,
      checkedInAt: true,
      admittedAt: true,
      doctorDoneAt: true,
      patient: { select: { firstName: true, lastName: true } },
      case: { select: { caseCode: true } },
      provider: { select: { firstName: true, lastName: true } },
      clinic: { select: { name: true } },
      visitNote: { select: { status: true, signedAt: true, signedByName: true } },
    },
  });

  const fecha = (d: Date | null | undefined): string =>
    d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) : '';

  const encabezado = [
    'Fecha de la visita', 'Paciente', 'Caso', 'Provider', 'Clinica',
    'Estado', 'Hasta donde llego', 'Dias', 'Firmada el', 'Firmada por',
  ];

  const cuerpo = rows.map((a) => [
    fecha(a.scheduledFor),
    `${dec(a.patient.firstName) ?? ''} ${dec(a.patient.lastName) ?? ''}`.trim(),
    a.case?.caseCode ?? '',
    nombreProviderO(a.provider, ''),
    a.clinic?.name ?? '',
    ESTADO_CSV[estadoDeLaNota(a.visitNote?.status)] ?? '',
    ETAPA_CSV[etapaDeLaVisita(a)],
    antiguedadEnDias(a.scheduledFor),
    fecha(a.visitNote?.signedAt),
    a.visitNote?.signedByName ?? '',
  ]);

  const lineas = [encabezado, ...cuerpo].map((f) => f.map(celda).join(','));
  if (rows.length === MAX_FILAS) {
    // Decirlo DENTRO del archivo: quien lo abre en Excel no vio la pantalla que
    // lo generó, y un CSV cortado en silencio se lee como el total.
    lineas.push('', celda(`Cortado en ${MAX_FILAS} filas — afiná los filtros para exportar el resto`));
  }

  // El BOM no es decorativo: sin él Excel en Windows abre el archivo en la
  // codificación del sistema y los acentos salen rotos. La clínica trabaja en
  // Excel — el mismo motivo por el que el tracking de Edson existe.
  const csv = '﻿' + lineas.join('\r\n');

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'EXPORT_NOTES_AUDIT',
    entityType: 'visit_notes',
    entityId: null,
    metadata: {
      filas: rows.length,
      truncado: rows.length === MAX_FILAS,
      filtros: {
        estados: filtros.estados,
        providerId: filtros.providerId ?? null,
        clinicId: filtros.clinicId ?? null,
        desde: filtros.desde?.toISOString() ?? null,
        hasta: filtros.hasta?.toISOString() ?? null,
        minDias: filtros.minDias ?? 0,
        q: filtros.q ?? null,
      },
    },
  }).catch(() => undefined);

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="notas-clinicas-${hoy}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

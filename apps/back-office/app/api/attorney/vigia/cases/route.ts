/**
 * GET /api/attorney/vigia/cases?kind=stalled|unsigned|active
 *
 * Las listas que abren los botones de Vigía, para mostrarlas en un modal sin
 * sacar al abogado de la pantalla.
 *
 * Devuelve el `id` además del código —a diferencia de las herramientas del
 * agente, que solo hablan en códigos— porque acá el destinatario es NUESTRA
 * pantalla, no el modelo: el id se usa para abrir el caso y nunca sale del
 * navegador de quien ya tiene permiso de verlo.
 *
 * El alcance sale de la sesión, igual que en todo el portal.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, type Prisma } from '@precision-medical/database';
import { getSessionLawyer, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { getSessionUser } from '@/lib/session';
import { lawyerCaseFilter, canSeeVigia, ACTIVE_STATUSES } from '@/lib/attorney-portal';
import { colaDeAtencion } from '@/lib/vigia/queue';

const MAX = 50;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const [lawyer, user] = await Promise.all([getSessionLawyer(), getSessionUser()]);
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  if (!canSeeVigia(lawyer, isAdminViewer)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const kind = req.nextUrl.searchParams.get('kind') ?? 'active';
  const scope = lawyerCaseFilter(lawyer);

  if (kind === 'stalled') {
    // La MISMA cola del tablero: si acá se recalculara con otro criterio, el
    // número del botón y el de la pantalla dejarían de coincidir.
    const { total, filas } = await colaDeAtencion(lawyer, { limite: MAX });
    return NextResponse.json({
      total,
      rows: filas.map((f) => ({
        id: f.caseId,
        caseCode: f.caseCode,
        motivo: f.motivo,
        dias: f.diasSinCita ?? f.diasAbierto,
        sinFirma: f.agravantes.includes('LIEN_SIN_FIRMA'),
      })),
    });
  }

  const where: Prisma.CaseWhereInput = kind === 'unsigned'
    ? { ...scope, signatureExempt: false, lienSignatures: { none: { signerType: 'ATTORNEY' } } }
    : { ...scope, status: { in: ACTIVE_STATUSES as unknown as never[] } };

  const [total, rows] = await Promise.all([
    db.case.count({ where }),
    db.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX,
      select: {
        id: true, caseCode: true, status: true, createdAt: true,
        // Para los liens: saber si el paciente ya firmó es lo que separa
        // "falta solo tu firma" de "no arrancó nadie".
        lienSignatures: { where: { signerType: 'PATIENT' }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    rows: rows.map((c) => ({
      id: c.id,
      caseCode: c.caseCode,
      estado: c.status,
      pacienteFirmo: c.lienSignatures.length > 0,
    })),
  });
}

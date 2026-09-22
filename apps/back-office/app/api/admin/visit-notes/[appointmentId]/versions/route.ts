/**
 * GET /api/admin/visit-notes/[appointmentId]/versions
 *
 * Las copias de lo que se firmó, una por firma.
 *
 * Sin parámetros devuelve la LISTA (número, fecha, quién firmó, motivo) — que es
 * lo que se dibuja para elegir. Con `?version=N` devuelve esa versión COMPLETA,
 * con las seis secciones y la foto de sus diagnósticos.
 *
 * Están separados porque el contenido pesa: una nota real llega a 33 KB por
 * sección, y la lista se pide para mostrar tres renglones.
 *
 * ── Para qué existe ─────────────────────────────────────────────────────────
 *
 * Es la mitad que se lee del versionado (la que escribe está en `../sign`). La
 * exigencia no es solo GUARDAR las versiones: si el expediente se pide por
 * citación hay que poder PRODUCIR exactamente lo que se firmó cada vez, y para
 * eso tiene que haber por dónde sacarlo.
 *
 * ── Acceso ──────────────────────────────────────────────────────────────────
 *
 * Basta la sesión, igual que `cases/[id]/visit-notes`, que ya sirve el texto
 * completo de las notas de un caso. Poner acá un guard más estrecho que el de la
 * nota viva sería teatro: quien puede leer la nota puede leer lo que decía antes.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';

type Ctx = { params: Promise<{ appointmentId: string }> };

export interface VersionResumen {
  version: number;
  signedAt: string;
  signedByName: string | null;
  /** FIRMA_INICIAL | REFIRMA */
  motivo: string;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { appointmentId } = await ctx.params;

  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    select: { id: true },
  });
  if (!note) return NextResponse.json({ error: 'NOTE_NOT_FOUND' }, { status: 404 });

  const pedida = req.nextUrl.searchParams.get('version');

  // ── Una versión completa ───────────────────────────────────────────────────
  if (pedida !== null) {
    const n = Number(pedida);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: 'INVALID_VERSION' }, { status: 400 });
    }
    const v = await db.visitNoteVersion.findUnique({
      where: { visitNoteId_version: { visitNoteId: note.id, version: n } },
    });
    if (!v) return NextResponse.json({ error: 'VERSION_NOT_FOUND' }, { status: 404 });

    return NextResponse.json({
      version: {
        version: v.version,
        motivo: v.motivo,
        signedAt: v.signedAt.toISOString(),
        signedByName: v.signedByName,
        chiefComplaint: v.chiefComplaint,
        hpi: v.hpi,
        ros: v.ros,
        physicalExam: v.physicalExam,
        assessment: v.assessment,
        plan: v.plan,
        diagnoses: v.diagnoses,
      },
    });
  }

  // ── La lista ───────────────────────────────────────────────────────────────
  // La más reciente primero: al abrir el historial, lo que se busca casi siempre
  // es "qué decía la última vez", no la firma original.
  const filas = await db.visitNoteVersion.findMany({
    where: { visitNoteId: note.id },
    orderBy: { version: 'desc' },
    select: { version: true, signedAt: true, signedByName: true, motivo: true },
  });

  const versions: VersionResumen[] = filas.map((v) => ({
    version: v.version,
    signedAt: v.signedAt.toISOString(),
    signedByName: v.signedByName,
    motivo: v.motivo,
  }));

  return NextResponse.json({ versions });
}

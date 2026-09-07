/**
 * GET /api/admin/lawyers/similar?name=...
 *
 * Bufetes del catálogo cuyo nombre se PARECE al que se está por crear.
 *
 * ── Para qué ────────────────────────────────────────────────────────────────
 *
 * Recepción va a poder crear bufetes desde el wizard de caso nuevo, con el
 * paciente enfrente y apurada. El buscador del autocomplete usa `contains`, así
 * que "Harker & Associates" NO encuentra "Harker Law Firm" y se crea el
 * duplicado sin que nadie vea que ya existía.
 *
 * Esto AVISA, no bloquea (decisión de Erick, 2026-09-07): devuelve los parecidos
 * para que elija uno, y si insiste crea igual. Puede haber dos bufetes de
 * apellido parecido de verdad, y trabar el alta con el paciente delante es peor
 * que una ficha repetida.
 *
 * ── La normalización ────────────────────────────────────────────────────────
 *
 * Medida contra el catálogo real (109 bufetes): agrupa correctamente los 11
 * grupos de nombres casi iguales que hay hoy, incluidos
 * "Garcia Law" / "Garcia Law Firm" y "Apex Injury Law Group LLC" / "...LLP".
 *
 * ⚠️ **La ciudad va SIEMPRE en la respuesta y no es decorado.** Los "duplicados"
 * del catálogo resultaron ser SUCURSALES: "Sterling Legal Partners" existe tres
 * veces —New York, Phoenix y Miami— con teléfono y correo propios. Un aviso que
 * diga solo "ya existe Sterling Legal Partners" es un falso positivo que enseña
 * a ignorar el aviso; con la ciudad al lado, quien carga ve si el suyo está o
 * si de verdad falta la sucursal.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
/* El criterio de comparación vive en un lib: una ruta de Next no puede exportar
   nada que no sea un verbo HTTP (`next build` lo rechaza y `tsc` no lo ve). */
import { claveDeNombre } from '@/lib/nombre-de-bufete';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const nombre = (req.nextUrl.searchParams.get('name') ?? '').trim();
  const clave = claveDeNombre(nombre);
  if (nombre.length < 2 || !clave) return NextResponse.json({ similares: [] });

  /**
   * Se filtra por la PRIMERA palabra con contenido en SQL y se compara la clave
   * completa en memoria. Traer los 109 bufetes y normalizarlos en Node sería más
   * simple, pero el catálogo crece y esta ruta corre en cada tecleo del nombre.
   */
  const primera = clave.split(' ')[0]!;
  const candidatos = await db.lawyer.findMany({
    where: {
      entityType: 'FIRM',
      deletedAt: null,
      status: 'ACTIVE',
      firmName: { contains: primera, mode: 'insensitive' },
    },
    take: 25,
    orderBy: { firmName: 'asc' },
    select: { id: true, firmName: true, city: true, state: true, phone: true, paymentSpeed: true },
  });

  const similares = candidatos
    .filter((c) => c.firmName && claveDeNombre(c.firmName) === clave)
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      firmName: c.firmName,
      city: c.city,
      state: c.state,
      phone: c.phone,
      paymentSpeed: c.paymentSpeed,
      /** Nombre idéntico salvo mayúsculas: es el caso fuerte del aviso. */
      mismoNombre: c.firmName?.trim().toLowerCase() === nombre.toLowerCase(),
    }));

  return NextResponse.json({ similares });
}

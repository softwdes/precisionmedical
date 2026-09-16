/**
 * GET /api/admin/cobranzas?q=&page=&pageSize=
 *
 *   La cola de cobranzas: TODOS los pacientes con su plata, los que deben
 *   arriba y dentro de cada grupo por apellido.
 *
 *   Devuelve la página pedida y el resumen de la BÚSQUEDA ENTERA — no de las
 *   filas visibles. La consulta vive en `lib/cobranzas-query.ts`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPatientStaff } from '@/lib/patient-access';
import { paginaDeCobranzas, resumenDeCobranzas } from '@/lib/cobranzas-query';
import { selfiesDePacientes } from '@/lib/fotos-identidad';

/** Tope duro: el cliente propone el tamaño, el servidor decide. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export async function GET(req: NextRequest): Promise<NextResponse> {
  /**
   * Cobranzas es del back-office, no del portal.
   *
   * No se usa `{ admin: true }`: esa lista es la del MOSTRADOR y deja afuera a
   * CONTADOR, que es justamente el rol del encargado de cobranza. Lo que hay
   * que cerrar es el portal —un provider no tiene nada que hacer viendo la
   * deuda de la clínica entera— y eso lo dice `portalOnly`.
   */
  const acceso = await checkPatientStaff();
  if (acceso.deny) return acceso.deny;
  if (acceso.actor?.portalOnly) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = req.nextUrl;
  const q = url.searchParams.get('q')?.trim() || undefined;
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0);
  const pedido = Number(url.searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, pedido), MAX_PAGE_SIZE);

  const [lista, resumen] = await Promise.all([
    paginaDeCobranzas({ q, page, pageSize }),
    resumenDeCobranzas(q),
  ]);

  /**
   * Las caritas de la página — dos viajes, no dos por fila.
   *
   * `selfiesDePacientes` no tira nunca (si Storage falla devuelve un mapa
   * vacío), pero el `.catch` es cinturón: una cola de cobranzas se tiene que
   * dibujar aunque el almacenamiento esté caído, y el costo de que falle son
   * unas iniciales.
   *
   * ⚠️ Solo el 17,3% de los pacientes tiene foto, y la URL viene FIRMADA y
   * vence a los 15 minutos. Para el pulgar de la lista alcanza —se vuelve a
   * pedir al buscar, paginar o cobrar—, pero esta pantalla es una cola que
   * puede quedar abierta media mañana, así que la foto GRANDE se pide fresca
   * al hacer clic. Ver `[patientId]/foto/route.ts`.
   */
  const selfies = await selfiesDePacientes(lista.filas.map(f => f.patientId))
    .catch(() => new Map<string, string>());

  return NextResponse.json({
    filas: lista.filas.map(f => ({ ...f, photoUrl: selfies.get(f.patientId) ?? null })),
    total: lista.total,
    page,
    pageSize,
    resumen,
  });
}

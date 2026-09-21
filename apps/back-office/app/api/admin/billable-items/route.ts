/**
 * GET /api/admin/billable-items
 *
 * Una búsqueda sobre los DOS catálogos de cargos de una visita:
 *   · `service_codes`  (338 CPT/HCPCS) → se factura a la aseguradora.
 *   · `catalog_items`  (18 INJECTION/SERVICE) → lo paga el paciente.
 *
 * Por qué unificado y no dos endpoints con un tab cada uno (decisión de Erick
 * 2026-08-04): dos pestañas obligan a saber DE ANTEMANO en qué lista está lo que
 * buscás, y ese es justamente el conocimiento que el asistente no tiene. Si busca
 * "toradol" en la pestaña equivocada no encuentra nada y concluye que no existe.
 *
 * Query params:
 *   ?q=toradol           — busca en los dos catálogos (siempre en los dos)
 *   ?view=ALL|INSURANCE|CASH — filtro de VISTA. Nunca oculta en silencio: la
 *                          respuesta trae `hiddenByView` con lo que quedó afuera
 *                          para que el UI pueda avisar "2 resultados más en
 *                          efectivo".
 *   ?favoritesOnly=true  — solo favoritos (aplica al catálogo de seguro, que es
 *                          el único con `UserServiceFavorite`)
 *
 * Sin paginar a propósito: los cash son 18 y los de seguro se topean por grupo.
 * La paginación de a 10 del picker viejo hacía que buscar algo conocido tomara
 * tres clicks.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { db } from '@precision-medical/database';

/** Tope por grupo. Con 338 códigos de seguro, la caja vacía es un listado para
 *  navegar, no para volcar todo al cliente. */
const GROUP_LIMIT = 40;

export type BillableSource = 'INSURANCE' | 'CASH';

export interface BillableItem {
  /** `s<id>` para service_codes · `c<id>` para catalog_items — el id crudo se
   *  repite entre las dos tablas (una usa cuid, la otra autoincrement). */
  key: string;
  source: BillableSource;
  /** Id nativo: cuid de `service_codes` o el entero de `catalog_items`. */
  refId: string;
  code: string;
  name: string;
  /** El precio de MVA — el del tarifario. Es el que rige salvo aviso. */
  price: number;
  /**
   * El precio de MEDICINA GENERAL, cuando el código tiene dos.
   *
   * `null` quiere decir "cobra igual en los dos", que es lo normal (7 códigos
   * de 408 tienen dos precios). Siempre `null` en el circuito de efectivo: ahí
   * el precio no depende de si hubo un accidente.
   *
   * Se mandan LOS DOS y elige el cliente, porque el mismo catálogo se pide una
   * vez y se usa en pantallas que pueden tener casos de distinto tipo abiertos.
   */
  priceGeneral: number | null;
  /**
   * El precio 0 es a propósito: la visita queda registrada y no se cobra
   * (88888 "No Charge Visit", 99024 posoperatoria).
   *
   * Lo que lo separa de un ítem al que simplemente le falta el precio, que en
   * este catálogo pueden ser miles de dólares. Siempre `false` en efectivo: los
   * ítems de efectivo sin precio ya quedan fuera de la lista.
   */
  isNoCharge: boolean;
  category: string | null;
  unitLabel: string | null;
  isFavorite: boolean;
  /** Código de seguro del ítem cash, si lo tiene cargado. Es lo que permite
   *  detectar que un mismo servicio está en las dos listas. */
  insuranceCode: string | null;
}

export interface BillableGroup {
  /** BOTH = el mismo servicio existe en las dos listas, con dos precios. */
  kind: 'BOTH' | 'INSURANCE' | 'CASH';
  items: BillableItem[];
  /** Solo en BOTH: el par apareado. */
  pairs?: Array<{ insurance: BillableItem; cash: BillableItem }>;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  const view = (sp.get('view') ?? 'ALL').toUpperCase();
  const favoritesOnly = sp.get('favoritesOnly') === 'true';

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const [codes, cash, favorites] = await Promise.all([
      db.serviceCode.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          isInternalOnly: false,
          ...(q ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { shortDescription: { contains: q, mode: 'insensitive' } },
            ],
          } : {}),
        },
        select: { id: true, code: true, shortDescription: true, category: true, currentFee: true, feeGeneral: true, isFavorite: true, isNoCharge: true },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
      }),
      db.catalogItem.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          isOrderable: true,
          kind: { in: ['INJECTION', 'SERVICE'] },
          ...(q ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          } : {}),
        },
        select: {
          id: true, code: true, name: true, kind: true, publicPrice: true,
          unitLabel: true, cptCode: true, hcpcsCode: true, isFavorite: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      user
        ? db.userServiceFavorite.findMany({
            where: { userId: user.id },
            select: { serviceCodeId: true, catalogItemId: true },
          })
        : Promise.resolve([]),
    ]);

    /**
     * Los favoritos PERSONALES. Los de los dos catálogos salen de la misma
     * tabla (una fila apunta a uno de los dos, garantizado por un CHECK).
     */
    const favCodeIds = new Set(favorites.map((f) => f.serviceCodeId).filter(Boolean));
    const favCatalogIds = new Set(favorites.map((f) => f.catalogItemId).filter((v): v is number => v !== null));

    /**
     * ── El favorito efectivo es "de la clínica O mío" ───────────────────────
     *
     * `isFavorite` de la tabla es la lista de LA CLÍNICA, heredada del v2
     * (9 códigos). Se muestra para todos, sin que nadie arme su lista.
     *
     * Antes el grupo salía SOLO de la estrella personal, y esa nace vacía:
     * medido el 2026-09-21, **27 favoritos en toda la base y de 3 personas**.
     * La función existía y no la mantenía nadie, así que en la práctica el
     * picker abría sin favoritos para el 100% del equipo.
     *
     * La estrella personal no se toca: suma encima de la lista común.
     */
    const esFavorito = (global: boolean, personal: boolean): boolean => global || personal;

    let insuranceItems: BillableItem[] = codes.map((c) => ({
      key: `s${c.id}`,
      source: 'INSURANCE' as const,
      refId: c.id,
      code: c.code,
      name: c.shortDescription,
      price: Number(c.currentFee),
      priceGeneral: c.feeGeneral === null ? null : Number(c.feeGeneral),
      isNoCharge: c.isNoCharge,
      category: c.category,
      unitLabel: null,
      isFavorite: esFavorito(c.isFavorite, favCodeIds.has(c.id)),
      insuranceCode: c.code,
    }));

    // Los cash sin precio quedan afuera: una fila con guión no se puede cobrar y
    // en un picker es ruido (mismo criterio que la lista de precios del mostrador).
    let cashItems: BillableItem[] = cash
      .filter((i) => i.publicPrice !== null && Number(i.publicPrice) > 0)
      .map((i) => ({
        key: `c${i.id}`,
        source: 'CASH' as const,
        refId: String(i.id),
        code: i.code,
        name: i.name,
        price: Number(i.publicPrice),
        priceGeneral: null,
        isNoCharge: false,
        category: i.kind,
        unitLabel: i.unitLabel,
        isFavorite: esFavorito(i.isFavorite, favCatalogIds.has(i.id)),
        insuranceCode: i.cptCode ?? i.hcpcsCode ?? null,
      }));

    // El filtro aplica a las DOS listas. Antes solo filtraba la de seguro, así que
    // en la vista de efectivo el botón "Favoritos" no hacía nada — un control que
    // se puede activar y no cambia nada es peor que no tenerlo.
    if (favoritesOnly) {
      insuranceItems = insuranceItems.filter((i) => i.isFavorite);
      cashItems = cashItems.filter((i) => i.isFavorite);
    }

    // Favoritos primero — sort estable, conserva el orden dentro de cada grupo.
    insuranceItems.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
    cashItems.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

    // ─── Apareo: el mismo servicio en las dos listas ─────────────────────────
    //
    // Solo por código, nunca por nombre: "Toradol injection" y "Therapeutic
    // injection" se parecen y no son lo mismo — un falso apareo mostraría dos
    // precios de servicios distintos como si fueran del mismo.
    //
    // Hoy los 18 ítems cash tienen `cptCode` y `hcpcsCode` VACÍOS, así que este
    // grupo sale vacío en la práctica. Queda implementado porque en cuanto el
    // encargado del catálogo cargue los códigos, la fila con dos precios aparece
    // sola, sin tocar código.
    const byCode = new Map(insuranceItems.map((i) => [i.code.toUpperCase(), i]));
    const pairs: Array<{ insurance: BillableItem; cash: BillableItem }> = [];
    const pairedInsuranceKeys = new Set<string>();
    const pairedCashKeys = new Set<string>();

    for (const c of cashItems) {
      if (!c.insuranceCode) continue;
      const match = byCode.get(c.insuranceCode.toUpperCase());
      if (!match) continue;
      pairs.push({ insurance: match, cash: c });
      pairedInsuranceKeys.add(match.key);
      pairedCashKeys.add(c.key);
    }

    const onlyInsurance = insuranceItems.filter((i) => !pairedInsuranceKeys.has(i.key));
    const onlyCash = cashItems.filter((i) => !pairedCashKeys.has(i.key));

    // ─── Vista: filtra lo que se MUESTRA, y reporta lo que quedó afuera ──────
    const showInsurance = view !== 'CASH';
    const showCash = view !== 'INSURANCE';

    return NextResponse.json({
      ok: true,
      view,
      // El apareado se muestra en cualquier vista: es el mismo servicio, y
      // esconderlo por filtro sería esconder justamente la fila que explica que
      // se puede cobrar de las dos formas.
      pairs,
      insurance: showInsurance ? onlyInsurance.slice(0, GROUP_LIMIT) : [],
      cash: showCash ? onlyCash : [],
      counts: {
        insurance: onlyInsurance.length,
        cash: onlyCash.length,
        pairs: pairs.length,
      },
      /** Cuántas coincidencias dejó afuera el filtro de vista. El UI lo usa para
       *  el aviso al pie — un filtro nunca oculta en silencio. */
      hiddenByView: {
        insurance: showInsurance ? 0 : onlyInsurance.length,
        cash: showCash ? 0 : onlyCash.length,
      },
      truncated: {
        insurance: showInsurance && onlyInsurance.length > GROUP_LIMIT
          ? onlyInsurance.length - GROUP_LIMIT
          : 0,
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/billable-items]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

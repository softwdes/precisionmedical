/**
 * El seguro que declaró el PACIENTE en el intake → el seguro del CASO.
 *
 * ── El agujero que cierra ───────────────────────────────────────────────────
 *
 * El paso 6 del intake guarda los seguros en `Case.consentsData.insurances`, un
 * array dentro de un JSON. La portada del caso y el PDF leen otra cosa:
 * `Case.primaryInsuranceId` / `primaryPolicyNumber`. Entre las dos no había
 * NADA — medido el 2026-09-15, ese campo lo escriben solo el alta de caso del
 * front office, el diálogo de "Legal · Seguro" y el seed; ni una línea de
 * `apps/forms` lo toca.
 *
 * Resultado: el paciente cargaba su aseguradora y su número de póliza, se
 * guardaba bien, y la portada seguía diciendo "sin aseguradora primaria". De 9
 * casos con seguro declarado, 6 tenían el caso vacío — y en uno Erick tuvo que
 * llamar a la paciente para pedirle un dato que ella ya había cargado.
 *
 * ── Gana el staff (decisión de Erick, 2026-09-15) ──────────────────────────
 *
 * Si el caso YA tiene aseguradora, esto no la pisa. El staff vio la tarjeta
 * física; el paciente escribió de memoria en el teléfono. Solo se completa lo
 * que está vacío.
 *
 * Lo que NO hace, a propósito: si el nombre que escribió el paciente no está en
 * el catálogo, **no crea la aseguradora**. Un catálogo que crece con texto
 * libre termina con "Cigna", "cigna", "Cigna Open Access" y "Sigma" como cuatro
 * aseguradoras distintas, y después alguien tiene que fusionarlas a mano. En
 * ese caso se devuelve `sinCatalogo` con el nombre tal cual lo escribió el
 * paciente, y el número de póliza se completa igual — que es el dato que si no
 * hay que volver a pedirle a la persona.
 *
 * ⚠️ Hoy NADIE muestra ese `sinCatalogo` en pantalla: el caso queda sin
 * aseguradora y sin aviso, igual que antes. No se construyó esa vista porque al
 * medirlo (2026-09-15) los 4 casos pendientes enlazaron los 4 y **no hay ni uno
 * solo** en esa situación. El primero que aparezca la va a necesitar.
 *
 * ── Cuál es la principal ───────────────────────────────────────────────────
 *
 * Erick pidió que lo elija quien llena el intake. El wizard todavía no tiene
 * esa marca (confirmado mirando las claves reales de las entradas), así que por
 * ahora manda el ORDEN: la primera entrada médica es la principal. Cuando el
 * wizard agregue el flag, se lee acá y el orden pasa a ser el respaldo.
 */

import type { PrismaClient } from '@prisma/client';

/** Una entrada del array `consentsData.insurances`, como la deja el wizard. */
export interface SeguroDeclarado {
  id?: string;
  carrier?: string;
  policyId?: string;
  groupNum?: string;
  holderName?: string;
  holderDOB?: string;
  holderRelation?: string;
  /** `MEDICAL` o `AUTO`. El de auto vive en `case_auto_insurances`, no acá. */
  insType?: string;
  /**
   * Marca del wizard para "esta es la principal". Todavía no la escribe nadie:
   * mientras no exista, manda el orden del array.
   */
  isPrimary?: boolean;
}

/** Los seguros MÉDICOS declarados, en orden, con la principal primero. */
export function segurosMedicosDeclarados(consentsData: unknown): SeguroDeclarado[] {
  const raw = (consentsData as { insurances?: unknown } | null)?.insurances;
  if (!Array.isArray(raw)) return [];

  const medicos = (raw as SeguroDeclarado[]).filter(
    (s) => s && typeof s === 'object' && (s.insType ?? 'MEDICAL') === 'MEDICAL',
  );

  // La marcada gana; si no hay ninguna marcada, el orden se respeta tal cual.
  const marcada = medicos.findIndex((s) => s.isPrimary === true);
  if (marcada <= 0) return medicos;
  return [medicos[marcada], ...medicos.filter((_, i) => i !== marcada)];
}

/** Lo que se pudo completar, para que quien llame lo pueda registrar o mostrar. */
export interface ResultadoPromocion {
  /** Nada que hacer: el paciente no declaró ningún seguro médico. */
  sinDeclarados: boolean;
  /** El caso ya tenía aseguradora y no se tocó. */
  yaTenia: boolean;
  /** Se completó la principal con esta aseguradora del catálogo. */
  carrierEnlazado: { id: string; name: string } | null;
  /** Declaró una aseguradora que no está en el catálogo: queda para el staff. */
  sinCatalogo: string | null;
  /** Se completó el número de póliza (puede pasar sin enlazar la aseguradora). */
  polizaCompletada: boolean;
}

/**
 * Busca la aseguradora del catálogo por el nombre que escribió el paciente.
 *
 * Exacto sin distinguir mayúsculas ni espacios de sobra, y nada más. Se probó
 * contra los nombres reales: "Seguro" y "Cigna", que son los dos que fallaron
 * en producción, **están los dos en el catálogo** — o sea que el enlace no
 * fallaba por no encontrarlos, fallaba porque nadie lo intentaba.
 *
 * Deliberadamente NO se hace coincidencia parcial: "Cigna" también empieza
 * "Cigna Open Access", y elegir la equivocada manda la factura a otra empresa.
 * Ante la duda, no se enlaza y se muestra lo declarado.
 */
async function buscarCarrier(db: PrismaClient, nombre: string) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  return db.insuranceCarrier.findFirst({
    where:  { name: { equals: limpio, mode: 'insensitive' }, deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });
}

/**
 * Completa el seguro del caso con lo que declaró el paciente.
 *
 * Idempotente y conservadora: solo escribe campos vacíos, nunca borra y nunca
 * pisa. Se puede correr las veces que haga falta — al guardar el paso 6, al
 * cerrar el intake, o desde un backfill.
 */
export async function promoverSeguroDeclarado(
  db: PrismaClient,
  caseId: string,
): Promise<ResultadoPromocion> {
  const vacio: ResultadoPromocion = {
    sinDeclarados: true, yaTenia: false,
    carrierEnlazado: null, sinCatalogo: null, polizaCompletada: false,
  };

  const kase = await db.case.findUnique({
    where:  { id: caseId },
    select: {
      consentsData: true,
      primaryInsuranceId: true, primaryPolicyNumber: true,
      secondaryInsuranceId: true, secondaryPolicyNumber: true,
    },
  });
  if (!kase) return vacio;

  const declarados = segurosMedicosDeclarados(kase.consentsData);
  if (declarados.length === 0) return vacio;

  const principal = declarados[0];
  const segunda   = declarados[1] ?? null;

  const res: ResultadoPromocion = {
    sinDeclarados: false,
    yaTenia: kase.primaryInsuranceId !== null,
    carrierEnlazado: null, sinCatalogo: null, polizaCompletada: false,
  };

  const datos: Record<string, string> = {};

  // ── La principal ──────────────────────────────────────────────────────────
  if (!kase.primaryInsuranceId && principal.carrier) {
    const carrier = await buscarCarrier(db, principal.carrier);
    if (carrier) {
      datos.primaryInsuranceId = carrier.id;
      res.carrierEnlazado = carrier;
    } else {
      res.sinCatalogo = principal.carrier.trim();
    }
  }
  // La póliza se completa aunque la aseguradora no se haya podido enlazar: es
  // un dato suelto que sirve igual, y el staff lo tendría que volver a pedir.
  if (!kase.primaryPolicyNumber && principal.policyId?.trim()) {
    datos.primaryPolicyNumber = principal.policyId.trim();
    res.polizaCompletada = true;
  }

  // ── La secundaria ─────────────────────────────────────────────────────────
  if (segunda) {
    if (!kase.secondaryInsuranceId && segunda.carrier) {
      const carrier = await buscarCarrier(db, segunda.carrier);
      if (carrier) datos.secondaryInsuranceId = carrier.id;
    }
    if (!kase.secondaryPolicyNumber && segunda.policyId?.trim()) {
      datos.secondaryPolicyNumber = segunda.policyId.trim();
    }
  }

  if (Object.keys(datos).length > 0) {
    await db.case.update({ where: { id: caseId }, data: datos });
  }

  return res;
}

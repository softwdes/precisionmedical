/**
 * Los datos de la clínica que van en la hoja de laboratorio y NO salen de una
 * tabla del dominio: el número de cuenta de LabCorp y el sufijo de requisición.
 *
 * Viven en `settings` y no en duro en el código por un motivo práctico: un
 * número de cuenta quemado en el código es un despliegue cada vez que cambie, y
 * el día que la clínica abra otra sede con su propia cuenta habría que tocar
 * fuente para algo que es un dato de negocio.
 *
 * Valores de arranque medidos en las dos órdenes reales de LabCorp que trajo
 * Erick (2026-09-10): cuenta `43002290`, sufijo `PM`.
 */

import { db } from '@precision-medical/database';

export const CLAVE_CONFIG_LAB = 'lab.labcorp';

export interface ConfigLab {
  /** Account# de LabCorp — el mismo para las dos sedes de las hojas reales. */
  cuenta: string;
  /** El `-PM` que va pegado al número de requisición y al Alt Patient ID. */
  sufijo: string;
}

const POR_DEFECTO: ConfigLab = { cuenta: '43002290', sufijo: 'PM' };

/**
 * Lee la configuración; si no está cargada devuelve los valores medidos.
 *
 * Cae al default en vez de fallar porque una hoja con la cuenta correcta y sin
 * fila en `settings` es mejor que una excepción en el momento en que alguien
 * aprieta "Generar orden" con el paciente esperando. Si mañana el dato cambia,
 * se carga la fila y deja de usarse el default.
 */
export async function configLab(): Promise<ConfigLab> {
  const fila = await db.setting.findUnique({
    where: { key: CLAVE_CONFIG_LAB },
    select: { value: true },
  });
  const v = fila?.value as Partial<ConfigLab> | null | undefined;
  return {
    cuenta: typeof v?.cuenta === 'string' && v.cuenta.trim() ? v.cuenta.trim() : POR_DEFECTO.cuenta,
    sufijo: typeof v?.sufijo === 'string' && v.sufijo.trim() ? v.sufijo.trim() : POR_DEFECTO.sufijo,
  };
}

/**
 * Edad en años, meses y días — la hoja la imprime `42/11/17` y el código la
 * lleva en tres campos separados (`P[63]`, `P[64]`, `P[65]`).
 *
 * Se calcula con los componentes de fecha y no restando milisegundos: restar
 * milisegundos y dividir por 365 se equivoca en los bisiestos, y acá el número
 * se imprime en un documento clínico.
 *
 * ── UNA DIFERENCIA CONOCIDA CON LABCORP ────────────────────────────────────
 * Con las dos hojas reales: Kimberly (8-nov-1996 → 10-sep-2026) da `29/10/2` y
 * coincide exacto; **Rodolfo (25-sep-1983 → 10-sep-2026) nos da `42/11/16` y su
 * hoja imprime `42/11/17`**.
 *
 * El calendario dice 16: 42 años llevan al 25-sep-2025, 11 meses al 25-ago-2026,
 * y de ahí al 10-sep-2026 hay 16 días. La de ellos suma uno, y la diferencia
 * aparece SOLO en el caso que necesita préstamo de días (Kimberly no lo
 * necesita y por eso coincide).
 *
 * **No se replica esa suma.** Con UN solo ejemplo que preste días, ajustar la
 * cuenta para que coincida sería copiar lo que podría ser un error de ellos y
 * equivocarse en los demás casos. Y el dato es inerte: la hoja ya lleva la fecha
 * de nacimiento, así que la edad es derivada. Si con una tercera orden se
 * confirma el patrón, se cambia acá y se dice por qué.
 */
export function edadDetallada(nacimiento: Date, hasta: Date): { anios: number; meses: number; dias: number } {
  let anios = hasta.getFullYear() - nacimiento.getFullYear();
  let meses = hasta.getMonth() - nacimiento.getMonth();
  let dias = hasta.getDate() - nacimiento.getDate();

  if (dias < 0) {
    meses -= 1;
    /*
     * Se cuenta desde el "mismo día" del mes anterior, NO sumando los días de
     * ese mes.
     *
     * Sumar los días del mes anterior deja el resultado NEGATIVO cuando ese mes
     * es más corto que el día de nacimiento: nacido un 31 de enero, cortado el
     * 1 de marzo, daba `1/1/-2`. Lo encontró la prueba de fin de mes; a ojo
     * parecía bien porque los casos comunes no cruzan un febrero.
     *
     * Y el ancla se RECORTA al último día del mes: un 31 en febrero no existe,
     * y `new Date(2026, 1, 31)` no falla — se desborda al 3 de marzo, que es la
     * forma silenciosa de volver al mismo error.
     */
    const anioAncla = hasta.getMonth() === 0 ? hasta.getFullYear() - 1 : hasta.getFullYear();
    const mesAncla = (hasta.getMonth() + 11) % 12;
    const ultimoDiaAncla = new Date(anioAncla, mesAncla + 1, 0).getDate();
    const ancla = new Date(anioAncla, mesAncla, Math.min(nacimiento.getDate(), ultimoDiaAncla));
    dias = Math.round((hasta.getTime() - ancla.getTime()) / 86_400_000);
  }
  if (meses < 0) {
    meses += 12;
    anios -= 1;
  }
  return { anios, meses, dias };
}

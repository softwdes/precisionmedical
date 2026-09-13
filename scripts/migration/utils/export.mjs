/**
 * Encontrar un archivo del export del v2 por PREFIJO.
 *
 * Los dumps salen con el timestamp pegado al nombre
 * (`users_extern_202609120959.csv`) y cambia en cada corrida. Los scripts viejos
 * lo tenían hardcodeado, así que al llegar un export nuevo fallaban todos con
 * "no such file" y había que editar quince archivos antes de poder empezar.
 *
 * Si hay más de uno que coincide, gana el ÚLTIMO por orden alfabético — que con
 * este formato de nombre es el más reciente.
 */
import { readdirSync } from 'fs'
import { join } from 'path'

export function buscarCsv(prefijo, dir = process.env.CSV_DIR) {
  if (!dir) throw new Error('Falta CSV_DIR en scripts/migration/.env')
  const candidatos = readdirSync(dir)
    .filter(f => new RegExp(`^${prefijo}.*\\.csv$`, 'i').test(f))
    .sort()
  if (candidatos.length === 0) {
    throw new Error(`No encontré "${prefijo}*.csv" en ${dir}`)
  }
  return join(dir, candidatos.at(-1))
}

/**
 * Correos del staff de la clínica.
 *
 * En `users_extern` hay 7 cuentas que NO son de abogados: son Edson, Beatriz y
 * Devin dados de alta como "externos" para probar el portal del bufete (Edson
 * aparece cuatro veces, colgado de tres bufetes distintos). Importarlos los
 * mete en el catálogo de Externals, y con una ficha de abogado alguien puede
 * darles acceso al portal legal — el riesgo que ya está documentado en
 * `lib/lawyer-access.ts`: "apuntar `Lawyer.userId` a un empleado le daría a esa
 * ficha la identidad de otra persona".
 */
export const CORREO_INTERNO =
  /@precisionmedicalcare\.com|@precisionmedical3\.onmicrosoft\.com|@lm\.com|@clinic\.com|@testclinic/i

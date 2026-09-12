/**
 * Carga `scripts/migration/.env` sin depender de DÓNDE se parada la terminal.
 *
 * `import 'dotenv/config'` —lo que usan los scripts viejos— busca el `.env` en
 * el **directorio actual**, así que corriendo desde la raíz del monorepo no lo
 * encuentra y el error que salta es `AES_GCM_KEY_B64 must be 32 bytes`, que se
 * lee como "la clave está mal" en vez de "estás parado en otra carpeta".
 *
 * Va importado ANTES que `decrypt.mjs`: el orden de los `import` es el orden de
 * evaluación, y `decrypt.mjs` valida la clave al importarse, no al usarse.
 */
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(import.meta.dirname, '..', '.env') })

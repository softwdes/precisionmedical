-- Reacomoda el acarreo del par altura/peso en los triajes viejos.
--
-- ── Qué arregla ────────────────────────────────────────────────────────────
-- `heightFt`/`heightIn` y `weightLbs`/`weightOz` son un PAR: 5 ft 6 in, 141 lb
-- 8 oz. Un resto de 12 pulgadas o de 16 onzas no existe — "5 ft 12 in" son 6
-- pies. Esas filas vienen de antes de que el reparto se corrigiera en el
-- código (se redondeaba el resto en vez del total, y `Math.round(x % 12)`
-- devuelve 12 cuando el resto pasa de 11,5).
--
-- Son 22 filas de 108: 2 de altura y 20 de peso.
--
-- ── Por qué esto NO pierde la medida ───────────────────────────────────────
-- El par mal repartido tiene el MISMO total que el pivote, así que reacomodarlo
-- es reescribir el mismo número mejor: 2 lb 16 oz y 3 lb 0 oz son los mismos 48
-- oz. Verificado fila por fila antes de escribir esto — las 2 de altura dan
-- igual exacto, y 19 de las 20 de peso también.
--
-- La fila 20 (70 lb 77 oz · kg=33.9) difiere en **1 onza**, 28 gramos, porque
-- el kg está guardado con 2 decimales y el ida y vuelta redondea. Se dice acá
-- en vez de esconderlo: es redondeo, no otra medida.
--
-- ── Lo que deliberadamente NO toca ─────────────────────────────────────────
-- 1. Las filas donde el par está en NULL y el resto sería 0 (37 de altura, 34
--    de peso). "5 ft, sin pulgadas de más" y "5 ft 0 in" son lo mismo, y todos
--    los lectores hacen `COALESCE(x, 0)`. No es un error: es ruido.
--
-- 2. Las 8 filas de peso que difieren en 1 onza por el mismo redondeo de arriba
--    pero tienen el par VÁLIDO (ej. `150 lb 0 oz` con kg=68, que recalculado
--    daría 149 lb 15 oz). Ahí lo guardado es lo que la asistente tecleó, y
--    "corregirlo" contra el pivote redondeado empeoraría el registro.
--
-- 3. Las DOS filas imposibles: `170 ft 76 in · cm=5374.6` y `170 ft 68 in ·
--    cm=5354.3`. Ahí el pivote también está mal —alguien escribió 170 pensando
--    en centímetros, en la casilla de pies— así que no hay de dónde derivar la
--    medida buena. Adivinar "eran 170 cm" sería inventar un dato clínico. Se
--    listan al final para que alguien las corrija mirando la ficha.
--    Desde ahora la pantalla las marca en ámbar ("revisá este valor").
--
-- Idempotente: acotado por la condición que se corrige, así que correrlo dos
-- veces no cambia nada la segunda.

-- ── Altura ─────────────────────────────────────────────────────────────────
UPDATE triage_records
   SET "heightFt" = FLOOR(ROUND(("heightCm" / 2.54)::numeric) / 12)::int,
       "heightIn" = MOD(ROUND(("heightCm" / 2.54)::numeric)::int, 12)
 WHERE "heightIn" >= 12
   AND "heightCm" BETWEEN 30 AND 280;

-- ── Peso ───────────────────────────────────────────────────────────────────
UPDATE triage_records
   SET "weightLbs" = FLOOR(ROUND(("weightKg" * 35.27396195)::numeric) / 16)::int,
       "weightOz"  = MOD(ROUND(("weightKg" * 35.27396195)::numeric)::int, 16)
 WHERE "weightOz" >= 16
   AND "weightKg" BETWEEN 0.3 AND 500;

-- ── Verificación ───────────────────────────────────────────────────────────
-- `quedan_*` tiene que dar 0. `imposibles` son las 2 filas que necesitan un
-- humano: no las arregla ninguna fórmula.
SELECT
  (SELECT COUNT(*) FROM triage_records
    WHERE "heightIn" >= 12 AND "heightCm" BETWEEN 30 AND 280)   AS quedan_altura,
  (SELECT COUNT(*) FROM triage_records
    WHERE "weightOz" >= 16 AND "weightKg" BETWEEN 0.3 AND 500)  AS quedan_peso,
  (SELECT COUNT(*) FROM triage_records
    WHERE "heightCm" IS NOT NULL
      AND "heightCm" NOT BETWEEN 30 AND 280)                    AS imposibles;

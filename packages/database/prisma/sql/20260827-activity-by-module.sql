-- Tiempo de uso POR MÓDULO. 2026-08-27. Idempotente.
--
-- `user_activity` sabía cuántos minutos trabajó cada persona, pero no en qué:
-- no se podía responder "¿cuánto tiempo estuvo en Facturación contra
-- Pacientes?". Ahora el minuto se marca con el módulo en el que estaba.
--
-- La clave pasa a ser (userId, bucketStart, module) — una fila por módulo y por
-- hora. Quien toca 3 módulos en una hora deja 3 filas de 60 bits.
--
-- OJO CON EL TOTAL: no es la suma de los módulos. Si alguien cambia de pantalla
-- dentro del mismo minuto, ese minuto queda marcado en DOS módulos, y sumarlos
-- inflaría el total. El bitmap lo resuelve exacto:
--     total = bit_count(bit_or("minutesMask"))
-- porque el OR colapsa el minuto repetido en un solo bit. Es la razón por la
-- que este cambio sale casi gratis: la estructura ya era la correcta.
--
-- Las filas anteriores quedan con module = '' (no se sabía dónde estaban) y
-- siguen contando para el total.

ALTER TABLE "user_activity" ADD COLUMN IF NOT EXISTS "module" TEXT NOT NULL DEFAULT '';

-- La PK vieja era (userId, bucketStart). Se reemplaza solo si todavía lo es,
-- para que correr esto dos veces no falle.
DO $$
DECLARE cols int;
BEGIN
  SELECT count(*) INTO cols
  FROM information_schema.key_column_usage
  WHERE table_name = 'user_activity' AND constraint_name = 'user_activity_pkey';

  IF cols = 2 THEN
    ALTER TABLE "user_activity" DROP CONSTRAINT "user_activity_pkey";
    ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_pkey"
      PRIMARY KEY ("userId", "bucketStart", "module");
  END IF;
END $$;

COMMENT ON COLUMN "user_activity"."module" IS
  'Módulo del back-office donde ocurrió el minuto (patients, billing, doctor…). '''' = filas previas al 2026-08-27.';

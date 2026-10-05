-- 20261005 — Sacar el nombre del BUFETE del campo del abogado
--
-- ── Qué pasó ────────────────────────────────────────────────────────────────
--
-- Dos casos tienen, en el campo "abogado escrito a mano", el nombre de su
-- propio bufete:
--
--   MVA-3282  attorneyNameRaw = 'Claggett & Sykes'  ← su bufete es ese mismo
--   MVA-3304  attorneyNameRaw = 'Brian Hills Law'   ← ídem
--
-- No es un capricho de quien lo escribió: hasta ayer la celda no daba ninguna
-- señal. La grilla muestra `COALESCE(nombre del abogado, nombre del bufete)`,
-- así que escribir el bufete ahí dejaba la celda EXACTAMENTE IGUAL que antes
-- — ni un cambio, ni un error, ni una pista. Edson lo reportó tres veces como
-- "no guarda el abogado": guardaba, pero guardaba algo invisible.
--
-- La puerta ya se cerró en la pantalla (2026-10-04): ahora avisa y no guarda.
-- Esto limpia los dos que quedaron de antes.
--
-- ── Por qué molesta, si no se ve ────────────────────────────────────────────
--
-- Porque sí se ve, en todo lo que NO es la celda:
--  · el panel de la columna dibuja una tarjeta de ABOGADO con el nombre del
--    bufete adentro — es la captura que mandó Edson el 2026-10-05;
--  · desde hoy el contador de gente del caso lo cuenta como una persona;
--  · "Copy N emails" lo trata como alguien a quien escribirle;
--  · y el caso figura CON abogado en cualquier conteo, cuando no lo tiene.
--
-- ── Qué hace ────────────────────────────────────────────────────────────────
--
-- Vacía `attorneyNameRaw` SOLO donde es, textualmente, el nombre del bufete
-- del propio caso. Después de esto la celda se sigue viendo igual —el texto
-- ahora sale de `firmName`, que es de donde tenía que salir— y el panel pasa a
-- ofrecer "+ Add attorney", que es la verdad: ese caso no tiene abogado.
--
-- NO toca el bufete, NO toca `attorneyId`, y NO toca el texto libre que NO
-- coincide con el bufete. Esos siete quedan como están y son otra conversación:
--   MVA-3311 'NO ATTORNEY / AT FAULT'   MVA-3463 'NO ATTORNEY YET'
--     → anotaciones deliberadas de Edson, están bien donde están
--   MVA-3317 'Jacob Jensen'             MVA-3318 'Jacob Jense'
--     → puede ser una PERSONA del bufete "Jacob Jensen & Associates"; uno con
--       un typo. Hay que preguntarle a Edson antes de tocarlos.
--   MVA-3325 'Jacob Jensen'  MVA-3330 'Garner Law'  MVA-3353 'Diaz and Madson'
--     → casos SIN bufete. Dos parecen bufetes y uno una persona; tampoco se
--       adivina desde acá.
--
-- La condición es idempotente: correrlo dos veces no hace nada la segunda.

BEGIN;

UPDATE cases
   SET "attorneyNameRaw" = NULL,
       "updatedAt"       = NOW()
  FROM lawyers lf
 WHERE lf.id = cases."lawFirmId"
   AND cases."deletedAt"       IS NULL
   AND cases."attorneyId"      IS NULL
   AND cases."attorneyNameRaw" IS NOT NULL
   AND lower(trim(cases."attorneyNameRaw")) = lower(trim(lf."firmName"));

COMMIT;

-- ── Para verificar después ──────────────────────────────────────────────────
--
-- SELECT cs."caseCode", cs."attorneyNameRaw", lf."firmName"
--   FROM cases cs JOIN lawyers lf ON lf.id = cs."lawFirmId"
--  WHERE cs."deletedAt" IS NULL AND cs."attorneyId" IS NULL
--    AND cs."attorneyNameRaw" IS NOT NULL
--    AND lower(trim(cs."attorneyNameRaw")) = lower(trim(lf."firmName"));
--   → cero filas

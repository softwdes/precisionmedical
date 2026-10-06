-- 20261006 — Sacar nombres de OFICINA del campo del abogado
--
-- ⚠️ TODAVÍA NO APLICADO. Erick lo corre cuando quiera.
--
-- ── Qué pasó ────────────────────────────────────────────────────────────────
--
-- Durante meses, la columna Attorney del seguimiento guardaba lo que se
-- tecleaba en `cases.attorneyNameRaw` — el campo del ABOGADO— aunque lo que
-- Edson escribía ahí era, casi siempre, el nombre de la OFICINA. Era el único
-- campo que aceptaba texto.
--
-- Quedaron seis filas así. Las dos puertas por las que seguían entrando ya
-- están cerradas (la celda el 2026-10-04, el modal el 2026-10-06), así que
-- esta limpieza no se deshace sola — que es lo que pasó las dos veces
-- anteriores, cuando limpié antes de cerrar.
--
-- ── Qué se midió, antes de decidir nada ─────────────────────────────────────
--
-- Lo primero fue preguntarse si esos textos eran PERSONAS reales, porque
-- entonces el arreglo sería vincularlas y no borrarlas. **Ninguno lo es**:
--
--   "Jacob Jensen"    → no existe como persona. El bufete es "Jacob Jensen &
--                       Associates" y sus 6 miembros son otros (Adi Hernandez,
--                       Jack VonSossen, Jean Berroa…).
--   "London Harker"   → no existe como persona. El bufete es "London Harker
--                       Injury Law" y su único miembro es Kurt London.
--   "Diaz and Madson" → no existe ni como persona ni como bufete.
--
-- O sea: son nombres de oficina escritos cortos, no abogados.
--
-- ── Las dos reglas, y la fila que NO entra en ninguna ───────────────────────
--
-- 1 · El texto está CONTENIDO en el nombre del bufete que el caso ya tiene.
--     El dato no se pierde: ya está en `lawFirmId`.  → 4 filas
--       MVA-3317 "Jacob Jensen"  ⊂ Jacob Jensen & Associates
--       MVA-3318 "Jacob Jense"   ⊂ Jacob Jensen & Associates   (con typo)
--       MVA-3451 "London Harker" ⊂ London Harker Injury Law
--       MVA-3452 "London Harker" ⊂ London Harker Injury Law
--
-- 2 · El caso NO tiene bufete y el texto es el nombre corto de uno que SÍ
--     existe. Acá no se borra: se VINCULA, que es donde el dato tenía que
--     estar desde el principio.  → 1 fila
--       MVA-3325 "Jacob Jensen" → bufete "Jacob Jensen & Associates"
--
-- 3 · **MVA-3353 "Diaz and Madson" NO SE TOCA.** No tiene bufete y ese bufete
--     no existe en el catálogo. Crearlo desde un SQL es inventar un nombre que
--     no verifiqué; y desde ayer Edson lo arregla solo en dos segundos —
--     escribe "Diaz and Madson" en la columna y Enter da de alta la oficina.
--     Mejor que lo haga quien sabe si ese bufete existe de verdad.
--
-- ── El control que hizo falta ───────────────────────────────────────────────
--
-- La regla 1 es por contención, y medida SIN el filtro de los marcadores se
-- llevaba puesto a **MVA-3463** ("NO ATTORNEY YET" dentro del bufete "NO
-- ATTORNEY YET"), que es la anotación deliberada de Edson y no se borra nunca
-- — ver 20261005b-no-attorney-yet-NO-BORRAR.sql. De ahí el
-- `NOT ILIKE '%NO ATTORNEY%'` de las dos sentencias: no es decoración, es lo
-- único que separa una limpieza de un borrado de datos buenos.
--
-- Idempotente: correrlo dos veces no hace nada la segunda.

BEGIN;

-- 1 · El texto repite al bufete del propio caso → se va, el bufete queda.
UPDATE cases
   SET "attorneyNameRaw" = NULL,
       "updatedAt"       = NOW()
  FROM lawyers lf
 WHERE lf.id = cases."lawFirmId"
   AND cases."deletedAt"       IS NULL
   AND cases."attorneyId"      IS NULL
   AND cases."attorneyNameRaw" IS NOT NULL
   AND cases."attorneyNameRaw" NOT ILIKE '%NO ATTORNEY%'
   AND lower(trim(lf."firmName")) LIKE '%' || lower(trim(cases."attorneyNameRaw")) || '%';

-- 2 · Sin bufete, y el texto nombra a uno que existe → se VINCULA y se limpia.
--     El `= 1` del subselect es deliberado: si el nombre corto coincidiera con
--     dos bufetes, no hay forma de elegir desde acá y la fila se queda como
--     está, para que la mire una persona.
UPDATE cases
   SET "lawFirmId"       = (
         SELECT f.id FROM lawyers f
          WHERE f."entityType" = 'FIRM' AND f."deletedAt" IS NULL
            AND lower(trim(f."firmName")) LIKE lower(trim(cases."attorneyNameRaw")) || '%'
       ),
       "attorneyNameRaw" = NULL,
       "updatedAt"       = NOW()
 WHERE cases."deletedAt"       IS NULL
   AND cases."lawFirmId"       IS NULL
   AND cases."attorneyId"      IS NULL
   AND cases."attorneyNameRaw" IS NOT NULL
   AND cases."attorneyNameRaw" NOT ILIKE '%NO ATTORNEY%'
   AND (
         SELECT count(*) FROM lawyers f
          WHERE f."entityType" = 'FIRM' AND f."deletedAt" IS NULL
            AND lower(trim(f."firmName")) LIKE lower(trim(cases."attorneyNameRaw")) || '%'
       ) = 1;

COMMIT;

-- ── Para verificar después ──────────────────────────────────────────────────
--
-- SELECT cs."caseCode", cs."attorneyNameRaw", lf."firmName"
--   FROM cases cs LEFT JOIN lawyers lf ON lf.id = cs."lawFirmId"
--  WHERE cs."deletedAt" IS NULL AND cs."attorneyId" IS NULL
--    AND cs."attorneyNameRaw" IS NOT NULL
--  ORDER BY 1;
--
--   Tienen que quedar EXACTAMENTE tres filas, y las tres a propósito:
--     MVA-3311  'NO ATTORNEY / AT FAULT'  · NO ATTORNEY YET   ← marcador
--     MVA-3353  'Diaz and Madson'         · (sin bufete)      ← lo arregla Edson
--     MVA-3463  'NO ATTORNEY YET'         · NO ATTORNEY YET   ← marcador
--
--   Y MVA-3325 tiene que haber quedado con bufete "Jacob Jensen & Associates"
--   y `attorneyNameRaw` en NULL.

-- 20261005c — Dar de baja dos ABOGADOS que son el nombre de su propio bufete
--
-- ── Qué pasó ────────────────────────────────────────────────────────────────
--
-- El 2026-10-05, a las 17:58 y 17:59, nacieron dos personas en el catálogo de
-- externos:
--
--   "Claggett" + "& Sykes"    dentro del bufete "Claggett & Sykes"
--   "Brian"    + "Hills Law"  dentro del bufete "Brian Hills Law"
--
-- No son personas: es el nombre del bufete partido en nombre y apellido. Salieron
-- del botón de alta rápida de la celda del abogado, que ofrecía textualmente
-- `Add "Brian Hills Law" to Brian Hills Law`. Ese botón se cerró el mismo día
-- (ahora se esconde cuando lo tecleado es un bufete), pero alcanzó a usarse en
-- la ventana que quedó abierta.
--
-- MVA-3282 y MVA-3304 quedaron apuntándolas por `attorneyId`, así que la columna
-- mostraba el bufete como si fuera el abogado — que es exactamente lo que se
-- había limpiado el día anterior por la otra puerta (`attorneyNameRaw`).
--
-- ── Por qué por ID y no por una condición ───────────────────────────────────
--
-- La condición obvia —"una persona cuyo nombre completo es igual al de su
-- bufete"— arrastraría a **Bobby Udall**, que es legítimo: un abogado solo cuyo
-- bufete lleva su nombre, cargado el 2026-09-12. Desde los datos no hay forma de
-- distinguirlo, así que esto va por los DOS ids concretos, con el nombre
-- esperado en el `WHERE` como seguro: si el id apuntara a otra cosa, no pasa
-- nada.
--
-- ── Alcance, medido antes de tocar ──────────────────────────────────────────
--
--   registros a dar de baja ............. 2   (sin correo, sin teléfono)
--   casos que los usan como abogado ..... 2   (MVA-3282, MVA-3304)
--   como paralegal o asistente legal .... 0
--   en case_managers .................... 0
--   personas legítimas con el mismo
--     patrón, que NO se tocan ........... 1   (Bobby Udall)
--
-- ── Qué hace ────────────────────────────────────────────────────────────────
--
--  1. Les saca el `attorneyId` a los dos casos. Quedan con su bufete y SIN
--     abogado, que es la verdad: nadie cargó una persona.
--  2. Da de baja LÓGICA a los dos registros — mismo criterio que el resto
--     (documentos 13-sep, citas 23-sep): la fila se marca, no se va, así el
--     audit log del alta sigue resolviendo contra algo.
--
-- NO toca el bufete de ninguno de los dos casos. NO toca a Bobby Udall. NO toca
-- `attorneyNameRaw`, que en los dos ya está en NULL desde el 20261005.
--
-- ⚠️ Y NO CONFUNDIR CON "NO ATTORNEY YET": ese bufete es un marcador que Edson
-- usa a propósito y no se borra nunca — ver 20261005b-no-attorney-yet-NO-BORRAR.sql.

BEGIN;

-- 1 · Los casos se quedan sin abogado, con su bufete intacto.
UPDATE cases
   SET "attorneyId" = NULL,
       "updatedAt"  = NOW()
 WHERE "attorneyId" IN (
         SELECT id FROM lawyers
          WHERE id IN ('cmuvjzrds0003nzzic8ssjah2', 'cmuvk0m6d0003g2ybv7ygexi3')
            AND trim(concat("firstName", ' ', "lastName")) IN ('Claggett & Sykes', 'Brian Hills Law')
       );

-- 2 · Las dos personas salen del catálogo sin desaparecer de la base.
UPDATE lawyers
   SET "deletedAt" = NOW(),
       "updatedAt" = NOW()
 WHERE id IN ('cmuvjzrds0003nzzic8ssjah2', 'cmuvk0m6d0003g2ybv7ygexi3')
   AND "deletedAt" IS NULL
   AND "entityType" <> 'FIRM'
   AND trim(concat("firstName", ' ', "lastName")) IN ('Claggett & Sykes', 'Brian Hills Law');

COMMIT;

-- ── Para verificar después ──────────────────────────────────────────────────
--
-- SELECT "caseCode", "attorneyId", "attorneyNameRaw" FROM cases
--  WHERE "caseCode" IN ('MVA-3282','MVA-3304');
--   → attorneyId y attorneyNameRaw en NULL, el bufete intacto
--
-- SELECT trim(concat("firstName",' ',"lastName")) AS p, "deletedAt" FROM lawyers
--  WHERE id IN ('cmuvjzrds0003nzzic8ssjah2','cmuvk0m6d0003g2ybv7ygexi3');
--   → las dos con fecha
--
-- SELECT "deletedAt" FROM lawyers WHERE id = 'cmtysy1768wmtuwce3s';
--   → Bobby Udall, NULL. Si tiene fecha, algo se pasó de alcance.

-- ════════════════════════════════════════════════════════════════════════════
-- Colores de sede que no choquen con el significado del calendario
--
-- Desde hoy el calendario pinta un punto con el color de la sede en cada cita,
-- cuando se miran todas juntas. Los colores ya estaban elegidos en Settings,
-- pero tres de ellos MIENTEN sobre esa grilla:
--
--   West Valley    #ff0000  rojo puro     → en el calendario el rojo es CANCELADA
--   Spanish Fork   #ffff00  amarillo puro → el ámbar es SIN CONFIRMAR
--   Murray Surgery #0000ff  azul puro     → ilegible sobre fondo oscuro, y el
--                                           indigo del sistema es "acción"
--
-- Se eligieron con una rueda de color, sin saber que competían con un
-- significado que ya existía. Un punto rojo en una cita de West Valley se lee
-- como una cita cancelada, que es exactamente lo que el punto NO debe decir.
--
-- ── El criterio de los nuevos ──────────────────────────────────────────────
-- Tienen que cumplir tres cosas a la vez, y por eso no es "elegir seis lindos":
--
--   1. Distinguirse ENTRE SÍ en un punto de 6 píxeles.
--   2. NO parecerse a los colores con significado del calendario — rose
--      (cancelada), ámbar (sin confirmar), emerald (atendida), brand/indigo
--      (acción), cyan (telemedicina).
--   3. Verse en tema claro Y oscuro: la clínica usa los dos.
--
-- Por eso salen de la franja que el calendario NO usa —violetas, teales,
-- magentas, marrones— y con luminosidad media, que es la que sobrevive a los
-- dos fondos.
--
-- Provo se deja como está: su azul grisáceo ya cumple y es la sede con más
-- citas, así que cambiarlo es el que más gente tendría que reaprender.
--
-- ⚠️ ESTO ES UNA PROPUESTA, no una verdad. El color de cada sede es de la
-- clínica y se cambia en Settings cuando quieran; esto sólo saca los tres que
-- se contradicen con la grilla.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/22-colores-de-sede.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE clinics SET color = '#a855f7' WHERE name = 'West Valley';      -- violeta
UPDATE clinics SET color = '#14b8a6' WHERE name = 'Spanish Fork';     -- teal
UPDATE clinics SET color = '#ec4899' WHERE name = 'Murray - Surgery'; -- magenta
UPDATE clinics SET color = '#f97316' WHERE name = 'Murray';           -- naranja (era #873e3e, marrón apagado: se perdía en el punto)

-- Sin tocar, porque ya cumplen:
--   Provo           #6d94be  azul grisáceo
--   Pleasant Grove  #008a00  verde

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
-- SELECT name, color FROM clinics ORDER BY name;

-- ════════════════════════════════════════════════════════════════════════════
-- Red anti-duplicados para la corrida real   ·   escrito 2026-09-11
--
-- POR QUÉ: la corrida anterior se ejecutó dos veces sobre `appointments` sin
-- ninguna llave natural. Resultado medido: 5.946 grupos duplicados y 6.426
-- filas sobrantes — el 43 % de la tabla. Todas las demás entidades estaban
-- protegidas por su id-map; las citas quedaron fuera de esa red.
--
-- CÓMO: un índice único TEMPORAL, que se crea antes de importar y se borra al
-- terminar. No toca el schema de Prisma (nada de deriva, nada que un `db push`
-- futuro pueda dropear) y convierte el segundo INSERT en un error ruidoso.
--
-- El índice es PARCIAL — excluye las canceladas — porque cancelar una cita y
-- volver a agendar al mismo paciente en el mismo horario con el mismo provider
-- es un flujo REAL de recepción, y un índice total lo bloquearía.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/01-indice-anti-duplicados.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS appointments_llave_natural_tmp
    ON appointments (
      "patientId",
      "scheduledFor",
      COALESCE("providerId", ''),
      COALESCE("caseId", '')
    )
 WHERE status <> 'CANCELLED';

-- Con el índice puesto, el script de citas debe insertar con:
--   INSERT INTO appointments (...) VALUES (...)
--   ON CONFLICT DO NOTHING
-- y contar cuántas filas NO entraron: ese número es el de duplicados del
-- origen, y hay que mirarlo antes de seguir con la entidad siguiente.

-- ─── Chequeo después de cada corrida (tiene que dar 0 / 0) ─────────────────
-- SELECT COUNT(*) AS grupos, COALESCE(SUM(n - 1), 0) AS sobrantes FROM (
--   SELECT COUNT(*) AS n FROM appointments
--   GROUP BY "patientId", "scheduledFor", COALESCE("providerId",''), COALESCE("caseId",'')
--   HAVING COUNT(*) > 1
-- ) t;

-- ─── Al terminar TODA la migración ─────────────────────────────────────────
-- DROP INDEX IF EXISTS appointments_llave_natural_tmp;
--
-- (Si se decide dejarlo permanente, tiene que entrar al `schema.prisma` como
--  @@unique, o el próximo `db push` lo borra sin avisar.)

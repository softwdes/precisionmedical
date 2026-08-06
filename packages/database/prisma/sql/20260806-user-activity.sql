-- Fase 2 métricas por empleado — tiempo de uso activo (2026-08-06).
-- Idempotente. Equivale al modelo UserActivityBucket de schema.prisma.
-- Se aplica por el pooler :6543 (el DIRECT_URL :5432 no responde).

CREATE TABLE IF NOT EXISTS "user_activity" (
  "userId"        TEXT NOT NULL,
  "bucketStart"   TIMESTAMP(3) NOT NULL,
  "activeMinutes" INTEGER NOT NULL DEFAULT 0,
  "lastPingAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_activity_pkey" PRIMARY KEY ("userId", "bucketStart")
);

CREATE INDEX IF NOT EXISTS "user_activity_bucketStart_idx"
  ON "user_activity"("bucketStart");

DO $$ BEGIN
  ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

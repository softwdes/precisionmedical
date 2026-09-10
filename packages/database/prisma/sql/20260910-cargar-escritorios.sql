-- =============================================================================
-- Cargar QUIÉN atiende cada escritorio — 2026-09-10
-- =============================================================================
-- SÍNTOMA (Erick, 2026-09-10): todos los pedidos de "Ask the clinic" llegan a
-- Beatriz y a Devin, sin importar el tema elegido.
--
-- CAUSA: no es el ruteo, es que `message_desk_members` está VACÍA. El código
-- resuelve el destinatario en tres saltos (ver `escritorios-server.ts`):
--
--     escritorio pedido  →  INTAKE (respaldo)  →  VIGIA_REQUEST_RECIPIENTS
--
-- Con la tabla vacía, los tres escritorios caen al segundo salto (INTAKE, que
-- también está vacío) y de ahí al tercero: la variable de entorno, que tiene
-- `devin@…,beatriz@…`. De ahí que TODO llegue a esos dos.
--
-- El reparto que corresponde, según Erick:
--   CLINICAL  → Beatriz   · lo médico, preguntas a los providers, plan de tratamiento
--   INTAKE    → Edson     · admisión antes de la primera visita, PIP, datos del
--                           case manager y del abogado
--   BILLING   → Brunella  · ledger, firma del lien, saldo de liquidación, copia
--                           de notas del provider y facturas HCFA
--   REFERRALS → Reagin, Carolina, Pamela, Beatriz  · los referidos del bufete
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTERNATIVA SIN SQL, y es la recomendada: Configuración → "Pedidos de
-- bufetes". Esa pantalla tiene un selector con el staff, avisa cuando un
-- escritorio quedó sin nadie, y —importante para Brunella— le crea la fila de
-- Phoenix si nunca inició sesión. Este archivo existe para hacerlo de una vez
-- y para que quede constancia del reparto.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Aplicar en el SQL Editor de Supabase (proyecto Phoenix). Idempotente: el
-- índice único (desk, userId) más el ON CONFLICT permiten correrlo dos veces.
-- =============================================================================

-- ── PASO 1 · MIRAR ANTES DE ESCRIBIR ────────────────────────────────────────
-- Corré solo esto primero. Copiá de acá los emails exactos de Edson, Brunella,
-- Reagin, Carolina y Pamela: abajo hay que escribirlos, y un email que no
-- exista en Phoenix simplemente no inserta nada (falla en silencio).
--
--   SELECT email, "firstName", "lastName", role, status
--     FROM users
--    WHERE "deletedAt" IS NULL
--      AND status = 'ACTIVE'
--      AND role IN ('SUPER_ADMIN','ADMIN','CONTADOR','EMPLOYEE','FRONT_DESK','DOCTOR')
--    ORDER BY "firstName";
--
-- Y para ver el estado actual (deberían ser 0 filas, que es el bug):
--
--   SELECT desk, count(*) FROM message_desk_members GROUP BY desk;

-- ── PASO 2 · COMPLETAR LOS EMAILS ───────────────────────────────────────────
-- Beatriz ya está confirmada. Los otros cuatro hay que escribirlos con el
-- valor exacto del PASO 1.
WITH reparto(desk, email) AS (
  VALUES
    ('CLINICAL'::message_desk,  'beatriz@precisionmedicalcare.com'),
    ('INTAKE'::message_desk,    'EDSON@precisionmedicalcare.com'),      -- ← COMPLETAR
    ('BILLING'::message_desk,   'BRUNELLA@precisionmedicalcare.com'),   -- ← COMPLETAR
    ('REFERRALS'::message_desk, 'REAGIN@precisionmedicalcare.com'),     -- ← COMPLETAR
    ('REFERRALS'::message_desk, 'CAROLINA@precisionmedicalcare.com'),   -- ← COMPLETAR
    ('REFERRALS'::message_desk, 'PAMELA@precisionmedicalcare.com'),     -- ← COMPLETAR
    ('REFERRALS'::message_desk, 'beatriz@precisionmedicalcare.com')
)
INSERT INTO message_desk_members (desk, "userId", "addedByName")
SELECT r.desk, u.id, 'Carga inicial 2026-09-10'
  FROM reparto r
  JOIN users u
    ON lower(u.email) = lower(r.email)
   AND u."deletedAt" IS NULL
   AND u.status = 'ACTIVE'
   -- Un LAWYER jamás puede atender un escritorio: mandaría el pedido de un
   -- bufete a otro bufete. Es la misma guarda que aplica el código.
   AND u.role IN ('SUPER_ADMIN','ADMIN','CONTADOR','EMPLOYEE','FRONT_DESK','DOCTOR')
ON CONFLICT (desk, "userId") DO NOTHING;

-- ── PASO 3 · VERIFICAR ──────────────────────────────────────────────────────
-- Tienen que salir 4 escritorios y 7 filas. Si a alguno le falta gente, el
-- email del PASO 2 no coincidió: revisalo contra el PASO 1.
--
--   SELECT m.desk, u.email, u."firstName", u."lastName"
--     FROM message_desk_members m
--     JOIN users u ON u.id = m."userId"
--    ORDER BY m.desk, u."firstName";

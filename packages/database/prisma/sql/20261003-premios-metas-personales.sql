-- Premios: metas por persona (Erick, 2026-10-03).
-- Cada participante puede tener sus propias metas en vez de las de su rol.
-- JSON con clave = qué mide la meta (`claveDeMeta`: 'M:APPTS_BOOKED', 'USAGE'...),
-- no el id: las metas se recrean cada vez que se guarda el mes.
--   número → reemplaza la meta del rol;  null → esa meta no le aplica.
ALTER TABLE reward_participants ADD COLUMN IF NOT EXISTS "targets" jsonb;

-- ────────────────────────────────────────────────────────────────────────────
-- Visita de SOLO EXTRACCION de laboratorio
--
-- Erick, 2026-10-08: "LM les manda recordatorio igual que para una cita que
-- lleguen 15 min antes; seria bueno que se les mande un mensaje diferente que
-- diga que es para sacarse sangre y que lleguen a la hora exacta".
--
-- La marca cambia DOS cosas en el aviso al paciente:
--   · la plantilla  — `cita_alta_labs` / `cita_cambio_labs`, editables desde
--                     la pantalla de plantillas, en los dos idiomas;
--   · la hora       — `horaLlegada` pasa a ser la hora de la cita, sin los
--                     15 minutos de adelanto del registro.
--
-- Medido antes de construirlo: 462 citas mencionan laboratorio en el motivo,
-- 152 en los ultimos 90 dias. De esas, ~296 son "LAB REVIEW" (el paciente SI
-- ve al provider y SI tiene que llegar antes) y ~24 son "LABS ONLY" / "BLOOD
-- DRAW ONLY", que son las que esta marca describe.
--
-- `DEFAULT false` y `NOT NULL`: ninguna cita existente cambia de comportamiento.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS "soloLaboratorio" boolean NOT NULL DEFAULT false;

-- Control: tiene que devolver una fila, con 0 en true.
SELECT
  count(*)                                    AS citas,
  count(*) FILTER (WHERE "soloLaboratorio")   AS marcadas_laboratorio
FROM appointments;

-- cuotas: payment records
CREATE TABLE IF NOT EXISTS cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  monto numeric(10,2) NOT NULL,
  fecha_pago date,
  fecha_vencimiento date NOT NULL,
  periodo char(7) NOT NULL,
  metodo_pago text CHECK (metodo_pago IN ('efectivo','yape_plin','transferencia','tarjeta_debito','tarjeta_credito','mercado_pago')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','vencido')),
  notas text,
  created_at timestamptz DEFAULT now()
);

-- whatsapp message log
CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tipo_mensaje text NOT NULL,
  contenido text NOT NULL,
  fecha_envio timestamptz DEFAULT now(),
  estado text NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado','pendiente','fallido')),
  created_at timestamptz DEFAULT now()
);

-- message templates
CREATE TABLE IF NOT EXISTS plantillas_mensaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nombre text NOT NULL,
  contenido text NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(trainer_id, tipo)
);

-- reminders config
CREATE TABLE IF NOT EXISTS config_recordatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE UNIQUE,
  dias_antes_vencimiento int DEFAULT 5,
  recordatorio_dia_vencimiento boolean DEFAULT true,
  recordatorio_post_24h boolean DEFAULT true,
  recordatorio_post_48h boolean DEFAULT false,
  recordatorio_post_72h boolean DEFAULT false,
  dias_habiles int[] DEFAULT ARRAY[1,2,3,4,5],
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_mensaje ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_recordatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuotas_select" ON cuotas FOR SELECT USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "cuotas_insert" ON cuotas FOR INSERT WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "cuotas_update" ON cuotas FOR UPDATE USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "cuotas_delete" ON cuotas FOR DELETE USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

CREATE POLICY "wa_select" ON whatsapp_mensajes FOR SELECT USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "wa_insert" ON whatsapp_mensajes FOR INSERT WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

CREATE POLICY "plantillas_select" ON plantillas_mensaje FOR SELECT USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "plantillas_insert" ON plantillas_mensaje FOR INSERT WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "plantillas_update" ON plantillas_mensaje FOR UPDATE USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

CREATE POLICY "config_rec_select" ON config_recordatorios FOR SELECT USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "config_rec_insert" ON config_recordatorios FOR INSERT WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "config_rec_update" ON config_recordatorios FOR UPDATE USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

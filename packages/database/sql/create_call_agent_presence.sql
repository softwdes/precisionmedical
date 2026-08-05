-- Presencia de agentes para llamadas entrantes (fase 3 del plan de Twilio).
--
-- Twilio no expone qué clientes tiene registrados, así que el ring group del
-- webhook de entrantes necesita que llevemos la presencia nosotros. El
-- navegador manda un heartbeat mientras la app está abierta y el webhook arma
-- un <Client> por cada fila fresca.
--
-- Se aplica por SQL y no con `prisma db push` porque el session pooler de
-- Supabase (:5432, el que usa DIRECT_URL para DDL) no responde; el transaction
-- pooler (:6543) sí, y para un CREATE TABLE alcanza.
--
-- Aditivo y reversible: DROP TABLE call_agent_presence;

CREATE TABLE IF NOT EXISTS call_agent_presence (
  -- userId de Supabase — el mismo que va a call_logs."agentUserId"
  "userId"     text NOT NULL,
  -- identidad de Twilio (`user-<userId>`), denormalizada
  "identity"   text NOT NULL,
  -- nombre para el agentName del CallLog cuando esta persona conteste
  "agentName"  text,
  "lastSeenAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT call_agent_presence_pkey PRIMARY KEY ("userId")
);

-- El webhook filtra por frescura en cada llamada entrante.
CREATE INDEX IF NOT EXISTS call_agent_presence_lastSeenAt_idx
  ON call_agent_presence ("lastSeenAt");

-- El objeto del fármaco tal como lo devuelve ScriptSure, guardado entero.
--
-- Al repetir una receta, su mensaje NCPDP hacia la farmacia exige metadatos que
-- no tienen columna propia (MED_NAME_TYPE_CD, MED_REF_DEA_CD,
-- MED_REF_GEN_DRUG_NAME_CD, MED_REF_FED_LEGEND_IND, la indicación estructurada).
-- Reconstruirlos campo por campo produjo una cadena de rechazos, uno por vez;
-- reenviar el original que ellos mismos nos dieron no.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS "drugPayload" JSONB;

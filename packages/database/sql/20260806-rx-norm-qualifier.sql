-- Tipo de código RxNorm de la receta (SCD, SBD, GPK…).
--
-- El mensaje NCPDP que ScriptSure arma para la farmacia valida este campo contra
-- un conjunto cerrado, así que al repetir una receta sin él el envío se rechaza
-- con "The value '' is not an element of the set {'BPK','DI','GPK','MEDRT','NH',
-- 'RT','SBD','SCD','UN','UP'}". Su historial siempre lo devuelve (rxnormQualifier);
-- solo faltaba guardarlo.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS "rxNormQualifier" TEXT;

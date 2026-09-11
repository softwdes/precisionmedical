-- Borra el único valor que hay hoy en `providers.npi`, porque es relleno.
--
-- `9906372145` no es un NPI: no pasa el dígito verificador (Luhn sobre el
-- número prefijado con 80840, el estándar de CMS) y además empieza en 9,
-- cuando los NPI reales empiezan en 1 o 2. Medido y verificado el 2026-09-10
-- con `lib/npi.ts`, que valida bien los dos NPI reales que conocemos:
-- 1922361872 (el del PDF de LabCorp) y 1245505858.
--
-- Por qué importa borrarlo y no dejarlo: ese número se IMPRIME en la orden de
-- laboratorio como identificador del prescriptor. Un NPI inventado en una hoja
-- que va a LabCorp es peor que un campo vacío — el vacío se nota y se corrige,
-- el inventado pasa el ojo y lo rechaza el laboratorio, o peor, lo procesa
-- contra un prescriptor que no existe.
--
-- Decisión de Erick, 2026-09-10: "el 2 sí borralo".
--
-- Acotado por el VALOR y no por el id del provider: si alguien ya lo corrigió
-- a mano entre que se escribió esto y que se corre, esta sentencia no toca
-- nada. Idempotente.
UPDATE providers
   SET "npi" = NULL
 WHERE "npi" = '9906372145';

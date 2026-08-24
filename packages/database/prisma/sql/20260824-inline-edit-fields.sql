-- Vista de tracking de Edson — campos para la edicion en celda.
--
-- 1) cases.attorneyNameRaw
--    `attorneyId` es una FK al catalogo de abogados. Cuando Edson escribe un
--    nombre que no esta cargado no tenia donde caer, y las dos alternativas
--    eran peores: crear el abogado al vuelo llena el catalogo de duplicados
--    ("Sergio Garcia" / "sergio garcia" / "S. Garcia"), y obligar a elegir de
--    la lista lo traba justo cuando el bufete es nuevo.
--    Mismo patron que `case_auto_insurances.carrierNameRaw`, que ya existia.
--
-- 2) case_tracking.chiroReferral
--    El quiropractico de la grilla sale de `cases.consentsData->'chiropractor'`,
--    o sea de la RESPUESTA DEL PACIENTE en su formulario de admision.
--    Normalmente viene vacio y Edson lo completa; a veces el paciente dice otro
--    y Edson corrige. En los dos casos su valor se guarda ACA y la respuesta
--    original queda intacta: el formulario es un documento firmado por el
--    paciente, y la clinica puede corregir lo que USA sin alterar lo que el
--    paciente DECLARO. La grilla resuelve con COALESCE(este, el del JSON).

ALTER TABLE "cases"         ADD COLUMN IF NOT EXISTS "attorneyNameRaw" TEXT;
ALTER TABLE "case_tracking" ADD COLUMN IF NOT EXISTS "chiroReferral"   TEXT;

-- SOLO LECTURA. El informe de la fusión de casos MVA duplicados del 2026-09-17.
-- No modifica nada: se puede correr las veces que haga falta.
-- (El archivo que la aplicó es 20260917-fusionar-casos-mva-duplicados.sql y NO
--  hay que volver a correrlo: ya está aplicado y sus guardas lo frenan.)
SELECT p.sobrevive, p.absorbido,
       a."deletedAt" IS NOT NULL                                                 AS archivado,
       (SELECT COUNT(*)::int FROM appointments      x WHERE x."caseId" = s."id") AS citas,
       (SELECT COUNT(*)::int FROM patient_documents x WHERE x."caseId" = s."id") AS docs,
       (SELECT COUNT(*)::int FROM lien_signatures   x WHERE x."caseId" = s."id") AS liens,
       (SELECT COUNT(*)::int FROM appointments      x WHERE x."caseId" = a."id")
     + (SELECT COUNT(*)::int FROM patient_documents x WHERE x."caseId" = a."id") AS colgados
FROM (VALUES
  ('MVA-1404','MVA-2736'), ('MVA-2224','MVA-2223'), ('MVA-419','MVA-2967'),
  ('MVA-1406','MVA-1739'), ('MVA-2332','MVA-2331'), ('MVA-2429','MVA-3196'),
  ('MVA-3017','MVA-3329'), ('MVA-2685','MVA-2684'), ('MVA-1949','MVA-1976'),
  ('MVA-2878','MVA-3071'), ('MVA-1830','MVA-3311'), ('MVA-2340','MVA-3088')
) AS p(sobrevive, absorbido)
JOIN cases s ON s."caseCode" = p.sobrevive
JOIN cases a ON a."caseCode" = p.absorbido
ORDER BY p.sobrevive;

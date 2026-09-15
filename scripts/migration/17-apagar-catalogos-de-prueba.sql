-- ════════════════════════════════════════════════════════════════════════════
-- Limpieza de los selectores de la cita · especialidades y providers
--
-- Los tres dropdowns de "Nueva cita" (Clínica / Especialidad / Provider) salen
-- de la base, no del código. Este script limpia DOS de los tres. El tercero
-- (clínicas) va aparte en 18-borrar-clinicas-de-prueba.sql porque ahí sí se
-- borra, y lo que se borra no comparte archivo con lo que se apaga.
--
-- ⚠️ NADA SE BORRA ACÁ: todo se DESACTIVA, igual que en 04-limpiar-catalogos.
-- Una cita vieja tiene que poder seguir mostrando el nombre de su doctor aunque
-- el doctor ya no esté en el selector — y el diálogo de la cita ya sabe volver
-- a agregar a mano al provider inactivo que tiene una cita (ver el comentario
-- en appointment-dialog.tsx). Apagar lo saca del menú y no rompe el historial.
--
-- Todo es reversible desde la propia app: /admin/specialties tiene el check de
-- "Activa" y /admin/providers el dropdown de Estado.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/17-apagar-catalogos-de-prueba.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Especialidades que dejó QA ──────────────────────────────────────────
-- ⚠️ NO son restos del seed viejo de 93, aunque el `sortOrder` 94/95/96 lo haga
-- parecer: ese número es sólo el contador siguiendo desde aquel seed. Las tres
-- las creó QA el 2026-09-14, cada una en el MISMO MINUTO que una clínica falsa:
--
--   17:58  Liberty Park Health Center  +  Adolescent Psychiatry
--   18:54  Aspen Ridge Medical         +  Neonatal-Perinatal Medicine
--   21:13  Granite Peak Wellness       +  Sleep Medicine
--
-- Cada corrida crea el paquete entero —clínica, especialidad, paciente, cita y
-- orden de laboratorio—, así que esta lista NO está cerrada: la próxima corrida
-- va a dejar una cuarta con otro nombre. Antes de correr esto, mirar si hay
-- alguna más nueva:
--
--   SELECT name, "createdAt" FROM specialty_catalog
--    WHERE "isActive" AND "createdAt" > '2026-09-14' ORDER BY "createdAt";
--
-- Las 6 reales (Auto Accidents, Pain Management, Family Practice, Urgent Care,
-- Surgery, Membership) no se tocan. Las tres de QA tienen 0 casos y 0 doctores.
--
-- El `AND NOT EXISTS` es un cinturón: si entre la medición y la corrida alguien
-- le asigna un caso a una de estas, la fila se queda viva y no se rompe la
-- pantalla de ese caso.
UPDATE specialty_catalog s
   SET "isActive" = false
 WHERE s."isActive" = true
   AND s.name IN ('Adolescent Psychiatry', 'Neonatal-Perinatal Medicine', 'Sleep Medicine')
   AND NOT EXISTS (SELECT 1 FROM cases c WHERE c."specialtyId" = s.id);

-- ─── 2. Providers de prueba ─────────────────────────────────────────────────
-- Los seis que llevan "(PRUEBA)" en el nombre: son cuentas del equipo de
-- desarrollo, no doctores. Cinco tienen 0 citas; Wilfredo Villarroel tiene 4,
-- pero las cuatro son del 2026-09-14 contra pacientes llamados "prueba81" y
-- "prueba82", o sea también de prueba.
--
-- Se listan por EMAIL y no por nombre: el "(PRUEBA)" del nombre es una etiqueta
-- que alguien puede sacar, el email es la identidad.
--
-- Ojo con erick@precisionmedicalcare.com: acá se apaga la ficha de PROVIDER
-- "Erick Salinas (PRUEBA)", que es un doctor inventado. No toca el usuario ni
-- el login de Erick, que viven en `users` y no en `providers`.
--
-- Ya hay precedente: seis providers de prueba más (Juan Prueba Paco, Willy
-- Prueba Villa, etc.) están INACTIVE desde antes.
UPDATE providers
   SET status = 'INACTIVE'
 WHERE status = 'ACTIVE'
   AND email IN (
     'cristian@precisionmedicalcare.com',   -- Cristian Beltran (PRUEBA)    · 0 citas
     'mauro.castillo.ing.sis@gmail.com',    -- Mauro Castillo (PRUEBA)      · 0 citas
     'madss.soft@mail.com',                 -- Miguel Robles (PRUEBA)       · 0 citas
     'erick@precisionmedicalcare.com',      -- Erick Salinas (PRUEBA)       · 0 citas
     'mattahuasi@gmail.com',                -- Logan Tahuasi (PRUEBA)       · 0 citas
     'wovivillarroel@gmail.com'             -- Wilfredo Villarroel (PRUEBA) · 4 citas, todas de prueba
   );

-- ─── 3. Providers reales con poco uso ── REVERTIDO POR COMPLETO ─────────────
--
-- ⚠️ ACÁ HABÍA UN TERCER UPDATE Y SE SACÓ A PROPÓSITO. No lo vuelvas a poner.
--
-- Apagaba a Devin Clanton, Scott Rigdon y Mark Stouffer con el criterio de
-- "providers reales con muy poco uso". **Los tres se revirtieron el mismo día**,
-- el 2026-09-14, uno por uno a medida que la clínica los fue reclamando.
--
-- El criterio estaba mal, y vale dejarlo escrito para no repetirlo: el número de
-- citas no dice si un provider atiende. Scott tenía 25 y su última hacía seis
-- meses — eso no es poco uso, es una agenda tranquila. Mark tenía 4 y sus dos
-- casos siguen ACTIVE. Quién atiende lo sabe la clínica, no la tabla.
--
-- Si alguna vez hay que sacar a un provider del selector, que sea porque alguien
-- lo dijo, con nombre y apellido — no porque una consulta lo contó bajo.
--
-- Lo único que SÍ quedó bien de esta tanda es que apagaba en vez de borrar: los
-- tres volvieron con un UPDATE y sus citas nunca se tocaron. Ver
-- 21-restablecer-scott-rigdon.sql y 19-devin-pruebas.sql.

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Esperado después de correr: 6 especialidades activas y 6 providers activos
-- (Cassie Broadhead, Barry Clanton, Nathaniel Gay, Justin Loder, David Miller,
-- Andrew Nielsen).
--
-- SELECT name FROM specialty_catalog WHERE "isActive" AND "deletedAt" IS NULL ORDER BY "sortOrder";
-- SELECT "firstName", "lastName" FROM providers WHERE status='ACTIVE' AND "deletedAt" IS NULL ORDER BY "lastName";

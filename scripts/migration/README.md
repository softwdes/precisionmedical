# Migración v2 → v3 · cómo se corre

**Leer primero:** `docs/plan-limpieza-y-cableado-v3.md` (qué se borra, qué se
queda, el cableado de los 3 portales y los 13 arreglos que los scripts deben
traer) y `docs/plan-migracion-v2-v3.md` (los errores de la corrida anterior).

Esta carpeta **no está en el workspace pnpm**: tiene su propio `package.json`.
Ya está instalado (`pg`, `dotenv`, `exceljs`, `@aws-sdk/client-s3`,
`@supabase/supabase-js`) y el `.env` creado y gitignorado. Todo se corre **desde
esta carpeta**.

```bash
cd scripts/migration
node test-decrypt.mjs                      # la clave AES tiene que dar texto legible
```

## 1 · Mirar lo que llegó (antes de tocar la base)

```bash
node 00-inventario-de-excel.mjs <carpeta>              # inventario: hojas, columnas reales, qué falta
node 00-inventario-de-excel.mjs <carpeta> --convertir  # + escribe un CSV UTF-8 por hoja
```

Lee `.xlsx` y `.csv`. Marca por columna si viene cifrada (`e:`), si es uuid,
fecha, email o teléfono, cuánto viene vacío, **qué script consume cada hoja** y
cuáles del v2 no llegaron. Si `CSV_DIR` ya apunta a la carpeta, el argumento
sobra.

## 2 · Vaciar la base de prueba

```bash
cd ../../packages/database
node scripts/apply-sql.cjs ../../scripts/migration/00-limpieza-pre-corrida.sql
node scripts/apply-sql.cjs ../../scripts/migration/01-indice-anti-duplicados.sql
```

Respaldo antes (Supabase → Database → Backups) y confirmar que el
`DATABASE_URL` es el de **Phoenix** (`kiqlhw…`), no el de Admin.

## 3 · Importar

Cada script acepta `--dry` cuando lo dice su encabezado. Después de cada
entidad, correr el conteo de duplicados del §10 del plan viejo.

| orden | script | trae |
|---|---|---|
| 1 | `03b-companies.mjs` | bufetes (`companies`) — **correr antes que 03** |
| 2 | `03-attorneys.mjs` | abogados (`users_extern`) |
| 3 | `09-link-members-to-firms.mjs` | miembro → bufete |
| 4 | `04-patients.mjs` | pacientes |
| 5 | `05-cases.mjs` | casos |
| 6 | `06-appointments.mjs` | citas |
| 7 | `07-case-externs.mjs` · `07b` · `08-case-assignments.mjs` | firmas y vínculo legal |
| 8 | `08-insurances.mjs` | aseguradoras |
| 9 | `09-visit-notes.mjs` · `10` · `11-appt-services.mjs` | notas, diagnósticos, servicios |
| 10 | `12-billing.mjs` | cargos y pagos |
| 11 | `13-patient-documents.mjs` | fichas de documentos |
| 12 | `13b-documentos-archivos.mjs` | **los archivos** (4 GB) — necesita las llaves AWS |
| 13 | `14-case-consents.mjs` · `15-authorized-dependents.mjs` | consentimientos, dependientes |

`01-clinics` y `02-providers` **se saltean**: las 6 clínicas reales y los
providers no se borran.

Si algún script se vuelve a correr, antes: `node rebuild-all-maps.mjs`.

## 4 · Verificar en el navegador

Calendario · tab Citas de un caso · detalle de paciente · **Archivos del
paciente** (ahí tienen que verse las fotos de identidad del v2) · portal médico
de un doctor real · portal legal de un bufete real.

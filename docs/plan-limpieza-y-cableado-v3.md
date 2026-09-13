# Limpieza + cableado antes de la corrida real v2 → v3

> Escrito 2026-09-11 con la base **medida en vivo**, no de memoria.
> Complementa `docs/plan-migracion-v2-v3.md` (que sigue siendo el documento de
> los errores a no repetir). Esto es lo que hay que dejar listo **esta noche**
> para que mañana, cuando lleguen los Excel, solo haya que importar.

---

## 0. Lo que hay que saber antes de abrir la laptop

1. **Ningún script de migración corre hoy.** El revert del Twilio (`80884567`)
   borró `scripts/migration/utils/` — `csv.mjs`, `db.mjs`, `decrypt.mjs` — y
   **14 de los 19 scripts que quedaban en el repo los importan**. Ya los
   restauré desde `605154f7` (sin tocar el índice de git: quedaron como
   *untracked*). Faltaba también todo el bloque 01-06.
2. ~~**`pg` no está instalado**~~ → **hecho el 11-sep**: `npm install` corrido en
   `scripts/migration` (tiene su propio `package.json`, fuera del workspace
   pnpm) y `scripts/migration/.env` creado con `DATABASE_URL` (Phoenix :6543),
   `DIRECT_URL`, `AES_GCM_KEY_B64` y `CSV_DIR`. El `.env` está gitignorado.
   **Falta solo apuntar `CSV_DIR` a donde dejes los CSV.**
3. ~~**Los Excel hay que pasarlos a CSV a mano**~~ → **resuelto el 11-sep**:
   `scripts/migration/00-inventario-de-excel.mjs` lee `.xlsx` y `.csv` de una
   carpeta, imprime el inventario (hojas, filas, columnas reales, muestra de
   valores, qué está cifrado, qué viene vacío, **qué script consume cada hoja y
   cuál del v2 no llegó**) y con `--convertir` deja un CSV UTF-8 por hoja con el
   nombre que cada script espera. Es lo PRIMERO que se corre cuando llega la
   carpeta.
4. **El id lo genera el script, siempre.** En esta base `id` es NOT NULL **sin
   default** en todas las tablas (el schema se aplicó con `db push`, así que los
   `@default(cuid())` no existen en Postgres). Un INSERT que omita `id` muere.

---

## 1. Qué se borra y qué se queda

`scripts/migration/00-limpieza-pre-corrida.sql` — un `TRUNCATE` único de 47
tablas + el `DELETE` de las clínicas demo. La lista está **cerrada**: verifiqué
que ninguna tabla de fuera apunta hacia adentro, y va **sin `CASCADE`** a
propósito, para que si falta una tabla el script falle en vez de vaciar en
silencio algo que nadie listó.

### Se borra (todo dato de la prueba)

| grupo | filas hoy |
|---|---|
| `patients` · `cases` · `appointments` | 6.374 · 3.230 · 15.090 |
| `patient_documents` · `case_consents` | 14.381 · 10.904 |
| `appointment_billing` · `billing_payments` | 6.617 · 432 |
| `visit_notes` + diagnósticos, servicios, férulas, labs, recetas, triaje | ~1.900 |
| mensajería (hilos, entradas, adjuntos, plantillas de QA) | ~1.000 |
| `lawyers` (374) · `insurance_carriers` (351) + ajustadores (88) | 813 |
| `clinics` demo — quedan las 6 reales | 91 |
| llamadas, cajas, bloqueos de agenda, presencia, agente | ~50 |

### Se queda (nada de esto vuelve en los Excel)

| qué | filas | por qué |
|---|---|---|
| `users` (28) · `employees` (8) · `providers` (21) | — | **las cuentas**. Se tocan y nadie entra |
| `clinics` reales | **6** | Murray, Murray - Surgery, West Valley, Provo, Pleasant Grove, Spanish Fork (ids `cmrbhn…`, practice ScriptSure 6907) |
| `service_codes` | 402 | catálogo de servicios/CPT con su tarifa |
| `catalog_items` + `catalog_price_history` | 283 + 72 | precios LabCorp, inyectables, férulas |
| `diagnoses` | 98.252 | ICD-10 |
| `lab_catalog` · `specialty_catalog` · `drugs` | 96 · 90 · 34 | |
| `templates` + `template_sections` + `snippets` | 8 + 54 + 278 | **contenido clínico escrito a mano por el equipo** |
| `settings` · `message_desk_members` | 1 · 3 | configuración (los escritorios se cargaron el 10-sep) |
| `releases` + `release_entries` | 212 + 413 | notas de versión, no tienen nada que ver con pacientes |
| `push_subscriptions` | 9 | los teléfonos del equipo, ya suscritos |

**Decidido por Erick el 11-sep** (ya aplicado en el SQL): `audit_logs` (13.580) y
`user_activity` (2.030) **se borran** — la bitácora HIPAA arranca limpia el día
de la migración; `lawyers` se borra **entero**, incluidas las 15 fichas reales, y
el catálogo se rearma desde los Excel; los **12 providers de prueba se
conservan**, porque son las cuentas con las que QA entra al portal médico.

---

## 2. Cableado de los tres portales cuando la base queda vacía

| portal | cómo resuelve quién sos | qué pasa tras el vaciado |
|---|---|---|
| **Back-office** | sesión del proyecto **Admin** (`ztyahz…`) + rol | ✅ intacto: las cuentas no se tocan |
| **Portal médico** (`/doctor`) | fila de `providers` con el **mismo email** de la sesión (`lib/get-session-provider.ts`) | ✅ intacto **porque `providers` no se borra**. Si alguna vez se vacía esa tabla, los 9 doctores quedan sin portal aunque su cuenta exista |
| **Portal legal** (`/attorney`) | fila de `lawyers` con el mismo email (`lib/get-session-lawyer.ts`) | ⚠️ **se corta**: al borrar `lawyers`, la única cuenta de abogado (`cris2017ggn@…`, que nunca activó) deja de resolver. Vuelve sola cuando el Excel recree la ficha con ese email |

El puente es **el email** en los dos portales — no `userId`. Eso es justamente lo
que hace seguro borrar y reimportar: si el Excel trae el mismo correo, el acceso
vuelve sin tocar Auth.

### Revisado módulo por módulo

- **No hay un solo id hardcodeado** de clínica, provider o bufete en el código.
- **No hay `findFirstOrThrow` / `findUniqueOrThrow`** en back-office: ninguna
  pantalla revienta con la tabla vacía, muestran su estado vacío.
- **Códigos de paciente y caso** (`packages/database/src/codes.ts`): salen de
  `MAX(split_part(codigo,'-',2))` con lock de Postgres. Con la tabla vacía
  arrancan en `P-1` / `MVA-1`. **Si los Excel traen los códigos del v2 hay que
  escribirlos tal cual** y el generador sigue desde el máximo sin chocar. El
  regex de serie ignora los códigos raros, así que los 19 `caseCode` cifrados no
  envenenaban el contador — pero hay que corregir igual la columna de origen.
- **Sede ≠ clínica** (`lib/clinic-sede.ts`): una clínica cuenta como sede solo si
  tiene **dirección Y foto**. De las 6 reales, **`Murray - Surgery` no tiene
  ninguna de las dos**, y en el v2 tiene 62 citas: hoy queda fuera del calendario
  de sedes y del carrusel del portal legal. **Es un arreglo de datos** — cargarle
  dirección y foto en Settings — y este es el momento. (Las fotos de clínica
  viven en el bucket público del proyecto **Admin**, no en Phoenix: la limpieza
  no las toca.)
- **Escritorios de mensajería**: los 3 miembros cargados el 10-sep sobreviven; el
  escritorio de Facturación sigue esperando la cuenta de Brunella.

---

## 3. Los arreglos que los scripts tienen que traer (medido hoy)

| # | qué | estado en la base de prueba |
|---|---|---|
| 1 | **Idempotencia de citas** — índice único natural o `externalId` del v2 | 5.946 grupos duplicados, **6.426 filas sobrantes (43%)** |
| 2 | **Estado de la cita** — el del v2 nunca se mapeó | **11.994 de 15.090 quedaron `PENDING`**, 11.992 de ellas en el pasado |
| 3 | **Descifrar al importar** (`employer` y todo lo que venga con `e:`) | **2.669 pacientes con `employer` cifrado** |
| 4 | **`caseCode`: corregir el corrimiento de columnas** | **19 casos** con el nombre del bufete cifrado dentro del código, y sin `lawFirmId` |
| 5 | **Teléfonos**: quitar el `+1`, `N/A`→null, no inventar `0000000000` | **4.075 pacientes sin teléfono (64%)** |
| 6 | **Vitales** — el join del script 09 no trajo nada | 0 notas con presión, altura o dolor; 13 con peso |
| 7 | **Tutores** (`guardianPatientId`) | 18 de 6.374 |
| 8 | **Documentos: los BYTES** — hasta ahora solo se migró la ficha | 10.452 filas con `s3Key` del MinIO del v2 y el bucket `case-documents` **vacío**: toda descarga es 404. **✅ script escrito: `13b-documentos-archivos.mjs`** (ver abajo) |
| 9 | **Firmas de consentimiento** | 1.132 en `signatureLegacy`, cifradas, y **ningún archivo del repo las lee** |
| 10 | **Convención de miembro de bufete** | Externals crea `INDEPENDENT` (146) y el portal crea `FIRM_MEMBER` (73): elegir UNA en el importador |
| 11 | **`clinicId` es NOT NULL en citas** | mapear las clínicas del v2 a las **6 reales** o la cita se salta (ya pasó en la corrida anterior) |
| 12 | **Zona horaria** | ✅ esta vez quedó bien: las citas caen entre 15:00 y 22:00 UTC = 9-16 h Mountain |
| 13 | **Falta el script que CREA los bufetes** | ver abajo |

### 13 en detalle — el agujero del lado legal

No existe ningún script que inserte los bufetes desde `companies.csv`. Los 15
que hay hoy los sembró a mano `packages/database/prisma/seed-law-firms.mjs` con
una lista de referencia, y los dos scripts que vinculan —`07b-link-case-firms` y
`09-link-members-to-firms`— **solo buscan por nombre** (`firmName ILIKE`) contra
lo que ya exista, y loguean `⚠️ No encontrado en v3` cuando no hay match.

Con `lawyers` vacío después de la limpieza, **eso deja 0 bufetes y por lo tanto
0 casos con `lawFirmId`**.

**✅ Escrito el 11-sep: `scripts/migration/03b-companies.mjs`.** Crea un
`lawyers` con `entityType='FIRM'` por fila de `companies*.csv` y emite
`id-maps/companies.json`. Detalles que importan:

- **Busca el CSV por prefijo** en `CSV_DIR` (`companies*.csv`): el timestamp del
  export cambia en cada corrida y hardcodearlo es el error más tonto de la mañana.
- **Mapea las columnas por alias** y **lista las que no importa**, para ver en el
  momento si el Excel trae algo nuevo que valga la pena mapear.
- **Deduplica por (nombre + ciudad)**, no por nombre: los repetidos son
  sucursales con su propio teléfono y colapsarlos pierde el número al que hay que
  llamar. Al re-correr actualiza con `COALESCE`, así el CSV llena huecos pero no
  borra lo que alguien cargó a mano (notas, % de honorarios).
- **Toma el id del `RETURNING`**, no de la variable local — es el error que
  obligó a escribir `rebuild-all-maps.mjs` en la corrida anterior.
- **Los bufetes dados de baja entran como `INACTIVE`**, no se saltean: un caso
  viejo puede apuntar a uno, y sin ficha ese caso se queda sin bufete.
- **Avisa de los nombres repetidos** en `companies-duplicados.json`, porque
  `07b`/`09` siguen vinculando por nombre y ahí sí se confunden.
- Teléfonos: `+1` fuera, `N/A`→null por lista explícita, y lo que no es NANP
  (internacionales) se conserva tal cual y se lista.
- `node 03b-companies.mjs --dry` muestra el plan sin escribir. **Probado el
  11-sep contra la base real en modo dry**; el camino de escritura usa los
  mismos casts de enum que `02-providers.mjs`, que ya corrió bien.

Queda pendiente decidir si `07b`/`09` pasan a leer `id-maps/companies.json` en
vez de hacer `ILIKE` por nombre — con sucursales, el `ILIKE` elige una cualquiera.

### 8 en detalle — los archivos (AWS llega mañana)

**✅ Escrito el 11-sep: `scripts/migration/13b-documentos-archivos.mjs`.** Corre
DESPUÉS del 13 (lee los `s3Key` de la base) y copia cada archivo del bucket del
v2 al bucket `case-documents` de Phoenix **con la misma clave**, así las fichas
ya migradas quedan apuntando bien sin tocar un solo registro.

- Volumen medido hoy: **4,03 GB · 10.442 archivos** (7.440 PDF · 2.728 JPG ·
  263 GIF, promedio 404 KB).
- Sirve para S3 y para **MinIO** (`V2_S3_ENDPOINT` activa `forcePathStyle`; sin
  eso la primera petición se va a un host que no existe).
- **Se puede cortar y relanzar**: lleva `documentos-progreso.json` y trata el
  "ya existe" del destino como éxito. Los fallos van a `documentos-fallidos.json`
  y relanzar reintenta solo esos.
- Sanea el `mimeType`: hay filas con `image/jpeg43082` — el mime y el tamaño
  pegados, **el mismo corrimiento de columnas que los 19 `caseCode`**. Un
  content-type inválido hace que Supabase rechace la subida.
- `--dry` y `--limite=20` para probar con la cuenta real antes de largar los 4 GB.

### Las 2.697 fotos personales — RESUELTO (11-sep)

Un 26 % de los archivos son `patients/<id>/personal/{patient_photo, dl_front,
id_card_front, id_card_back}.jpg`: **882 pacientes**, indexadas por PERSONA en el
v2 y por CASO en el v3 (`intake-photos/{caseId}/…` + `case.consentsData.photos`).

**Lo que NO se hace, y por qué:**

- **No van a `intake-photos`.** Ese bucket es `public: true` y las URLs que
  guarda son permanentes y sin sesión (está documentado como deuda abierta en
  `lib/intake-photos.ts`). Hoy contiene **36 objetos**; meterle 2.697 licencias
  de conducir y tarjetas de seguro multiplica por 75 una exposición de PHI que ya
  preocupaba.
- **No se les pone `caseId`.** Sería el atajo para que aparezcan sin tocar
  código, pero el portal del bufete sirve **todos** los documentos de un caso
  (`api/attorney/cases/[id]/documents`, sin filtro de tipo): la licencia y la
  tarjeta del seguro del paciente quedarían a la vista del abogado. Y además
  es inventar un dato: **327 pacientes tienen más de un caso** y una licencia no
  es de uno de ellos.

**Lo que se hizo:** los archivos quedan en `case-documents` (privado), las filas
cuelgan del PACIENTE (`patientId` puesto, `caseId` en NULL) y las pantallas
aprendieron a leerlas:

1. `GET /api/admin/patients/[id]/documents` ahora devuelve la UNIÓN —los papeles
   de sus casos **y** los suyos sin caso— y, además, `fotosPaciente`: los cuatro
   recuadros resueltos desde el DMS con **URL firmada de 15 min**, el mismo
   patrón que `lab-results`. *(Antes, con el filtro solo por caso, esas 2.697
   filas no aparecían en NINGUNA pantalla del sistema.)*
2. Nueva `GET /api/admin/patients/[id]/documents/[docId]/download` — la de casos
   exige `caseId` y estos documentos no tienen. Sirve los dos tipos, con el
   guard de la ficha (`checkPatientAccess`).
3. `archivos-dialog.tsx`: los recuadros caen a la foto de la persona cuando el
   caso no tiene la suya (la del caso siempre gana), la foto del v2 no ofrece
   "Eliminar" (el endpoint solo borra de `consentsData`) y si la imagen no carga
   se muestra el recuadro vacío en vez de un ícono roto.

`tsc` en 0. **Verificado a nivel datos** (para un paciente con fotos, la consulta
vieja devolvía 0 filas y la nueva devuelve sus 4 fotos); **falta verlo en
pantalla**, que recién se puede cuando 13b suba los archivos.

⚠️ Un supuesto para confirmar con la primera foto en pantalla: `id_card_*` se
mapea a la **tarjeta de seguro** por descarte (el v2 ya tiene `dl_*` para la
licencia, y `id_card` viene en pares frente/dorso: 566 y 548). Si resultara ser
otro documento, se cambian dos líneas del route y nada más.

---

## 3 bis. Lo que dijo el export REAL (60 CSV, 220 MB, leídos el 12-sep)

`node 00-inventario-de-excel.mjs "D:/Proyectos/PM/Migracion/datos hoy"`.
Los porcentajes son sobre el archivo entero, no sobre una muestra.

| entidad | corrida de julio | **export de hoy** |
|---|---|---|
| pacientes (`users_patient`) | 5.890 | **6.182** |
| casos | 2.772 | **3.356** (3.241 ACTIVE · 115 DELETED) |
| citas | 14.288 *(inflado)* | **9.784** |
| notas | 319 | **354** |
| documentos | 14.372 | **16.977** (4.651 carpetas + **12.326 archivos**) |
| consentimientos | 10.904 | **16.730** (1.500 con firma) |
| cargos / pagos | 5.679 / 311 | **6.995 / 593** |
| aseguradoras | 943 | **1.221** |
| bufetes (`companies`) | 15 sembrados a mano | **20**, todos `law_firm`, **sin nombres repetidos** |
| abogados (`users_extern`) | 89 | **95** |
| servicios | 313 | **335** |
| **peso de los archivos** | 4,03 GB | **5,05 GB** · 3.188 fotos de identidad |

### Lo que el export corrige de lo que creíamos

- **Las citas del v2 son 9.932, no 14.288.** Confirma que el 43 % duplicado lo
  produjo la corrida doble, no el origen. En el archivo de hoy hay **254 grupos
  repetidos / 407 filas** (4,1 %), y 130 de esas son basura sin fecha ni caso.
- **Los vitales no "se perdieron": casi no existen.** 354 filas y cada columna
  viene 94-97 % vacía — hay ~20 presiones y ~18 pesos en toda la base. El join
  además es por `notes.id_vital`, no por la cita.
- **El estado de la cita SÍ está en el origen** y hay que mapearlo:
  8.270 PENDING · 805 DELETE · 319 CONFIRMED · 241 CANCELED · 148 vacío ·
  84 NO_SHOW · 50 RESCHEDULED · 8 CANCEL_SAME_DAY · 7 COMPLETED.
  Ojo: `CANCELED` (una L) → `CANCELLED`; `CANCEL_SAME_DAY` → `CANCELLED` +
  `cancelledSameDay = true`; `RESCHEDULED` no existe en v3; los 805 `DELETE` no
  se importan como citas vivas.
- **Los tutores están en el origen**: `users_patient.guardianId` (~124 filas) y
  108 usuarios `type=guardian`. Hoy en v3 hay 18.

### 🔴 Antes que nada: el parser de CSV estaba roto

`utils/csv.mjs` leía **una línea = una fila**, y las notas del v2 son HTML con
saltos de línea adentro del campo entrecomillado. Cada nota larga se partía en
varias filas falsas **con las columnas corridas** — el texto caía en
`appointmentId`— y de ahí salían dos diagnósticos que eran mentira: "el 76 % de
las notas no tiene cita" y "148 citas sin caso". Arreglado el 12-sep
(estado de comillas entre chunks, RFC 4180); `parseCSV()` mantiene la firma, así
que los 19 scripts quedaron arreglados sin tocarlos.

| | parser viejo | **real** |
|---|---|---|
| notas | 1.864 | **354** (= las 354 filas de `vitals`, una toma por nota) |
| citas | 9.932 | **9.784** |
| usuarios | 6.448 | 6.446 |

### Borrados y repetidos — `00c-borrados-y-repetidos.mjs` (12-sep)

**Borrados que el filtro obvio NO agarra:**

| | |
|---|---|
| usuarios DELETED/INACTIVE | 398 (363 son pacientes) |
| casos DELETED | 115 |
| **casos ACTIVOS de paciente borrado** | **188** ← se cuelan si solo se mira `cases.status` |
| citas con status DELETE | 805 |
| **citas ACTIVAS de caso muerto** | **436** ← ídem |
| consentimientos de caso muerto | 1.485 |
| documentos de caso/paciente muerto | 107 |
| seguros DELETED | 56 |

**Personas repetidas** (nombre descifrado + apellido + fecha de nacimiento):
**155 grupos, 168 fichas de más**. Y lo que decide el trabajo:

- **61 grupos** tienen los datos en UNA sola ficha → las otras son cáscaras, se descartan.
- **30 grupos** están todas vacías → se queda cualquiera.
- **64 grupos** tienen los datos **REPARTIDOS** (ej. `martinez, hermelinda`: una
  ficha con peso 39 y otra con 5) → descartar una **pierde historia clínica**.
  Hay que fusionarlas, en el v2 o en el importador.

**Repetidos por tabla, sobre lo que sí entraría:** citas 110 grupos / 121 filas ·
seguros 9 grupos / 11 filas · consentimientos, cargos, notas y documentos: **0**.

**Huérfanos:** 19 casos cuyo paciente no está en el export (no se pueden
importar) y nada más — citas sin caso, cargos sin cita, notas sin cita y
documentos sin paciente dieron **0** con el parser arreglado.

**Queda entrando:** 5.819 pacientes · 3.053 casos · 8.422 citas.

### Tres cosas nuevas que hay que resolver ANTES de importar

1. **No existe `caseCode` ni código de paciente en el v2.** `cases` tiene 13
   columnas y ninguna es un código; lo que hay es `reference`, **cifrado, con
   nombres de bufete adentro** — de ahí salieron los 19 `caseCode` corruptos de
   la corrida anterior: se escribió `reference` donde iba el código. Los códigos
   los genera v3; la recomendación es derivarlos del id del v2
   (`P-<id>`, `MVA-<id>` / `GM-<id>`) para conservar la referencia cruzada.
2. **El mapa de doctores hay que armarlo a mano: los correos NO coinciden.** El
   v2 usa `mstouffer@gmail.com`, `scottrigdon@hotmail.com`,
   `andrew@precisionmedical3.onmicrosoft.com`; v3 usa
   `mstouffer@precisionmedicalcare.com`, `srigdon@…`, `anielsen@…`. El puente por
   email —que es el que usa todo el resto del sistema— **no engancha ni uno**.
   Sin ese mapa las 9.932 citas entran sin provider y el calendario por doctor,
   las métricas y el portal médico quedan vacíos. Son 15 filas
   (`users_clinic.id` → provider v3), y el reparto de citas es:
   Justin 2.958 · Barry 2.493 · Nathaniel 2.398 · Andrew 734 · **Pam 696** ·
   David 420 · Scott 25 · Mark 8 · el resto, pruebas.
   ⚠️ **`pam@precisionmedicalcare.com` tiene 696 citas y NO tiene ficha de
   Provider en v3** — hay que crearla o esas citas quedan sin doctor. Y ~40
   citas apuntan a usuarios que ya no están en `users_clinic`.
3. **668 usuarios comparten email con otro** (161 grupos, hasta 6 personas con
   el mismo correo) y 470 no tienen ninguno: son familias, no duplicados. El
   importador **no puede deduplicar pacientes por email**.

### Lo que llegó y hoy nadie importa

`snomed` (129.172) + `snomed_icd_map` (407.784) — `diagnoses.snomedCode` y la
tabla `diagnosis_mappings` existen y están **vacías** · `medical_history` (361
filas × 67 columnas) · `templates` (**386**, contra las 8 que hay en v3) ·
`labs` (77) · `specialties` (10) · `document_permissions` (13.779) ·
los audit logs del v2 (`case_audit_log` 9.330, `cost_audit_log` 6.938,
`patient_audit_log` 1.681, `note_audit_log` 836, `appointment_logs` 1.413,
`note_histories` 1.130) · `service_payment_allocation` (170) ·
`task_comments` / `task_documents`. **Cada uno es una decisión de Erick**, no un
olvido: importar o dejar.

---

## 4. Qué tiene que traer cada Excel (NOT NULL real de la base)

| entidad | obligatorio en v3 | ojo |
|---|---|---|
| **patients** | `patientCode`, `firstName`, `lastName`, `status` | `status`: NEW·ACTIVE·COMPLETED·DISCHARGED·INACTIVE |
| **cases** | `caseCode`, `patientId`, `caseType`, `status`, `source`, `coverageType` | `caseType`: MVA·GENERAL·WORKERS_COMP·NURSING_HOME |
| **appointments** | `patientId`, **`clinicId`**, `scheduledFor`, `durationMinutes`, `type`, `status` | `type`: AUTO_ACCIDENT·FAMILY_PRACTICE·URGENT_CARE·FOLLOW_UP·CONSULTATION |
| **lawyers** | `entityType`, `status` | el **email** es lo que después da acceso al portal |
| **visit_notes** | `appointmentId`, `status` | DRAFT·SIGNED·VOIDED |
| **case_consents** | `caseId`, `code`, `accepted` | 6 códigos; el resto se mapea |
| **appointment_billing** | `totalCost`, `discount`, `insuranceCovered`, `amountPaid`, `balanceDue` | |

Del lado del bufete hacen falta las tres piezas juntas: **companies** (el
bufete), **users_extern + users** (las personas, con su email) y **case_externs**
(qué bufete y qué abogado lleva cada caso, más las firmas).

---

## 4 bis. ✅ EJECUTADO el 2026-09-12

| paso | resultado |
|---|---|
| `.gitignore` ← `Migracion/`, `respaldo-*/`, `*.ndjson` | 220 MB de PHI estaban **sin ignorar** en el árbol de trabajo |
| `00d-respaldo.mjs` | **91 tablas · 177.985 filas · 113 MB** → `Migracion/respaldo-2026-09-12/` |
| `02b-mapas-por-nombre.mjs --escribir` | `id-maps/providers.json` (**10**) · `id-maps/clinics.json` (**6**) |
| `00-limpieza-pre-corrida.sql` | todo lo transaccional en **0**; catálogos, cuentas y las **6 clínicas** intactos |
| `01-indice-anti-duplicados.sql` | `appointments_llave_natural_tmp` activo (dropear al terminar) |

Verificado por conteo: `patients` `cases` `appointments` `patient_documents`
`case_consents` `appointment_billing` `billing_payments` `visit_notes` `lawyers`
`insurance_carriers` `message_threads` `audit_logs` `user_activity` → **0**.
`clinics` 6 · `providers` 21 · `users` 28 · `service_codes` 402 ·
`catalog_items` 283 · `diagnoses` 98.252 · `templates` 8 + 54 secciones + 278
snippets · `settings` 1 · escritorios 3 · `push_subscriptions` 9.

## 5. Orden de la mañana

1. ~~`npm install`~~ y ~~crear el `.env`~~ — hechos el 11-sep. Solo ajustar
   `CSV_DIR` en `scripts/migration/.env` a la carpeta de los CSV.
2. `cd scripts/migration && node test-decrypt.mjs` — tiene que devolver texto
   legible antes de seguir (si no, la clave no es la del export).
3. Dejar los Excel en una carpeta y correr
   `node 00-inventario-de-excel.mjs <carpeta>` — **leerlo entero antes de seguir**:
   ahí se ve qué llegó, con qué columnas de verdad, qué está cifrado y qué falta.
   Después `--convertir` para generar los CSV.
4. **Respaldo** de Phoenix (Supabase → Database → Backups).
5. Correr `00-limpieza-pre-corrida.sql` con `apply-sql.cjs` y verificar que los
   conteos den 0 (y `clinics` = 6).
6. Crear el índice único de citas (la red anti-duplicado) **antes** de importar.
7. Corrida — antes de cada script, correrlo con `--dry` si lo soporta:
   **03b bufetes** (`node 03b-companies.mjs --dry` primero) → 03 abogados → 04 pacientes →
   05 casos → 06 citas → 07 firmas → 07b/08 vínculos legales → 08 seguros →
   09 notas → 11 servicios → 12 facturación → 13 documentos (fichas) →
   14 consentimientos → 15 dependientes.
   Y con las llaves de AWS: **13b documentos (los archivos, 4 GB)** — se puede
   dejar corriendo en paralelo al resto de la verificación.
   (01 clínicas y 02 providers se saltean: ya están y no se borran.)
8. Después de CADA entidad, el conteo de duplicados del §10 del plan viejo.
9. Verificación en navegador: calendario, tab Citas de un caso, detalle de
   paciente, portal médico de un doctor real, portal legal de un bufete real.

---

## 6. Decisiones

### Tomadas (Erick, 2026-09-11)

- `audit_logs` y `user_activity`: **se borran**.
- `lawyers`: **se borra todo** y se rearma desde los Excel → obliga a escribir
  `03b-companies.mjs` (§3.13).
- Los 12 providers de prueba: **se conservan** (los usa QA para el portal médico).

### Abiertas

1. Los Excel de documentos: ¿vienen también **los archivos** (S3/MinIO), o
   seguimos con fichas sin bytes? Sin bucket, región y llaves AWS del v2 esa
   parte no arranca, y son 10.452 PDFs.
2. `Murray - Surgery`: cargarle dirección y foto para que cuente como sede.
   *(Las fotos personales del v2 ya no son decisión abierta: ver §3.8.)*
3. ¿Los Excel traen los `patientCode` / `caseCode` del v2? Si sí, se escriben tal
   cual y el generador sigue desde el máximo; si no, la numeración arranca de 1 y
   se pierde la referencia cruzada con el sistema viejo.

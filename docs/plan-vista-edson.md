# Plan — Vista de Tracking de Edson (reemplaza `/edson`)

> Estado: PLAN APROBADO EN DECISIONES, SIN IMPLEMENTAR
> Fecha: 2026-08-18
> Reemplaza: `/edson` (bandeja actual) y elimina `/intake` del sidebar.

## 1. Qué es

Réplica funcional del Excel **"New MVA Tracking - 1st Appointment ONLY!"** que Edson
mantiene a mano. Una fila = **un caso MVA**, mostrando **solo su PRIMERA cita**
(Edson no necesita ver las visitas siguientes).

Alcance de filas: **todos los casos MVA que tienen cita**, incluidas las **pasadas**
(NO SHOW, canceladas, completadas). Es un registro histórico + cola de trabajo, no
solo una cola de lo que viene.

## 2. Columnas y origen del dato

| # | Columna | Origen | Editable por Edson |
|---|---------|--------|--------------------|
| A | Clínica + fecha + día | `Appointment.clinic.name` + `scheduledFor` | no |
| B | Patient | `Patient.firstName/lastName` | no |
| C | Appoint. Time | `Appointment.scheduledFor` | no |
| D | DoB | `Patient.dateOfBirth` | no |
| E | Phone Number | `Patient.phone` — **requiere `dec()`** | no |
| F | Provider | `Appointment.provider` | no |
| G | Date of Loss | `CaseAutoInsurance.lossDate` (fallback `Case.accidentDate`) | sí |
| H | Attorney | `Case.attorney` / `Case.lawFirm` | sí |
| I | Chiropractor | `Case.consentsData.chiropractor` (texto) | sí (autocomplete) |
| J | Insurance Name | `CaseAutoInsurance.carrier` | sí |
| K | Claims Number | `CaseAutoInsurance.claimNum` | sí |
| L | PIP Available? | `CaseAutoInsurance.pipAvailable` (Y / N / null) | sí (chip 1 clic) |
| M | Adjuster Name | `InsuranceAdjuster` vía `CaseAutoInsurance.adjusterId` | sí (selector) |
| N | Adjuster Phone | `InsuranceAdjuster.phone` (heredado) | vía catálogo |
| O | Observations | `CaseTrackingNote[]` — timeline | sí |
| P | Completado | `CaseTracking.completedAt` | sí (check) |
| Q | Archivar | `CaseTracking.archivedAt` | sí |

Color de fila = `Appointment.status`. **PENDIENTE**: Erick va a agregar nuevos
estados de cita en otra sesión y definirá el mapa de colores completo. No hardcodear
colores hasta entonces — dejar el mapa en una constante única y aislada.

## 3. Cambios de modelo

### 3.1 `CaseAutoInsurance` (nueva tabla, 1:1 con Case)

Hoy estos datos viven dentro del blob `Case.consentsData.insurances[]`, escritos por
el modal "New insurance" de la ficha del paciente
(`apps/back-office/app/(admin)/patients/patients-client.tsx`, `saveInsurances()` →
`PATCH /api/admin/cases/[id]` con `{ consents: { insurances } }`).

Se promueve a tabla porque el JSON impide: (a) filtrar/ordenar/paginar por
claim# o adjuster, y (b) evitar que recepción y Edson se pisen — el guardado actual
manda el array completo, así que el último en guardar borra lo del otro.

Campos (respetan los nombres actuales del JSON para que la migración sea directa):
`carrier`, `policyId`, `lossDate`, `pipAvailable` (enum Y/N/null), `claimNum`,
`adjusterName`, `adjusterPhone`, `adjusterFax`, `adjusterPhone2`, `adjusterEmail`,
`comments`, `fullLien`, `lienComments`.

> `comments` es del SEGURO y lo llena recepción. NO confundir con las observaciones
> de Edson (§3.4), que son su bitácora personal.

**Migración** (EJECUTADA 2026-08-18, `prisma/migrate-auto-insurance.mjs`, idempotente):
32 filas creadas de 120 casos con `consentsData`; 26 carriers linkeados al catálogo,
6 en `carrierNameRaw`. `pipAvailable` normalizado a YES/NO/UNKNOWN — llegó con
`"N/A"` (27), `"SI"` (2), `"343"`, `"2333"`, `"kl"`.

**Hallazgo**: toda esa data es de PRUEBA (adjusters "pablo", "jkjkjkkj", "none";
quiropracticos "cc", "?", "bvbvbv"). Por eso **NO se sembró el catálogo de
adjusters** desde el JSON — habría ensuciado el catálogo desde el día uno. Los
nombres quedan en `adjusterNameRaw` / `adjusterPhoneRaw`.

**Lo real que sí existe**: 2846 casos (1096 MVA, 1004 con cita), 826 con
`primaryInsuranceId`, 473 con `accidentDate`, 21 con `primaryPolicyNumber`.
Claim #, adjuster y PIP no existen en ninguna parte — Edson los captura desde cero.
Por eso la tabla NO duplica aseguradora ni fecha de accidente: la grilla cae a
`Case.primaryInsurance` / `Case.accidentDate` cuando los campos están vacíos.

El JSON NO se borró: queda de respaldo hasta que el modal de recepción apunte a la
tabla (paso 3).

### 3.2 `InsuranceAdjuster` (nueva tabla · catálogo en Settings)

Decisión de Erick: los adjusters dejan de escribirse a mano y pasan a ser un
**catálogo configurable**, como un tab más en `/settings` junto a Clínicas,
Especialidades, Doctores, Bufetes, Aseguradoras, Servicios CPT y Diagnósticos
(`apps/back-office/app/(admin)/settings/settings-client.tsx`, array `TABS`).

Un adjuster pertenece a una aseguradora:

`insuranceCarrierId` (FK a `InsuranceCarrier`) · `name` · `phone` · `phone2` ·
`fax` · `email` · `extension` · `status` (ACTIVE/INACTIVE) · `notes`

En `CaseAutoInsurance` el adjuster pasa a ser `adjusterId` (FK). En la grilla de
Edson y en el modal es un **selector con búsqueda filtrado por la aseguradora del
caso**; el teléfono se hereda del catálogo en vez de retipearse. En el Excel actual
la misma persona aparece repetida con la extensión escrita distinto cada vez — eso
es lo que el catálogo elimina.

Migración: al pasar el JSON a tabla, agrupar los `adjusterName` existentes por
carrier y sembrar el catálogo; los que no matcheen quedan como texto libre en un
campo `adjusterNameRaw` para depurar después, sin perder dato.

### 3.3 `CaseTracking` (nueva tabla, 1:1 con Case)

El cuaderno de Edson. Separado de `Case` porque no es verdad clínica y se audita aparte.

`completedAt` / `completedById` · `archivedAt` / `archivedById`

### 3.4 `CaseTrackingNote` (nueva tabla, N:1 con Case)

Observaciones de Edson como **entradas con fecha y autor** (decisión de Erick), no
una celda que se sobrescribe. Es lo único genuinamente nuevo del Excel.

`caseId` · `body` · `authorUserId` · `authorName` (denormalizado, mismo criterio que
`coverageVerifiedByName`) · `createdAt`

En la grilla la columna muestra la última entrada; el panel lateral muestra el timeline.

## 4. UX de la grilla

15 columnas no caben. Diseño híbrido:

- **Columnas congeladas** a la izquierda: paciente + fecha/hora. Sin esto, a la
  columna 12 ya no sabes de quién es la fila.
- **Edición inline de UN clic** (no doble clic — es invisible y no existe en móvil)
  para los 3 campos rápidos: PIP (chip que cicla Y/N/—), Completado (check),
  Observations (celda que se expande a textarea y agrega una entrada nueva).
- **Modal** (NO panel lateral / Sheet) para lo pesado: abogado, seguro, claim#,
  adjuster, quiropráctico. Decisión de Erick: todo el sistema es modal y un Sheet
  rompería el patrón. Como el modal tapa la fila, su encabezado repite paciente,
  caso, clínica y hora — que es lo que Edson necesita a la vista al teléfono.
- **Densidad**: teléfono y DoB en dos líneas bajo el nombre (como la lista de
  pacientes). Quita 2 columnas sin perder dato.
- **Agrupar por día** con separador, como el Excel. No lista plana.

## 5. Tabs

- **Tab 1 — Tracking**: filas activas.
- **Tab 2 — Archivados**: `archivedAt != null`. Solo lectura, con buscador y restaurar.

`completado` y `archivado` son actos distintos: completado = "ya conseguí toda la
info" (pinta verde, no saca la fila); archivar = "ya no me ocupa" (va al tab 2).
Si un solo check hiciera ambos, Edson perdería de vista los casos completados cuya
cita todavía no ocurre.

Archivado en lote sugerido: cuando está completado Y la primera cita ya pasó.

## 6. Quitar `/intake` del sidebar

Dos cuidados:

1. `moduleKey: 'intake'` es uno de los 9 checkboxes de `users.clinicModules`.
   Migrar a los usuarios que tengan SOLO ese módulo marcado, o quedan sin ninguno
   y el middleware no tiene a dónde redirigirlos.
2. NO borrar las rutas/APIs `/intake/*` en el mismo paso: `verify-pip` sella
   `pipVerifiedAt`, que se sigue usando.

## 7. Orden de implementación

1. `InsuranceAdjuster` + tab "Adjusters" en `/settings` (CRUD, igual que los otros catálogos).
2. Modelos + migración del JSON → `CaseAutoInsurance` (backfill, normalización de PIP,
   siembra del catálogo de adjusters).
3. Repuntar el modal de seguro de recepción a la tabla nueva. **HECHO 2026-08-18**:
   `GET/PUT/DELETE /api/admin/cases/[id]/auto-insurance`; `SegurosDialog` pide el
   AUTO al abrir y guarda ahí (los MEDICAL siguen en el JSON); `medical-history-dialog`
   también; el pre-llenado AUTO al crear caso se eliminó (duplicaba las columnas del
   caso); `hasAutoInsurance` agregado a las 3 fuentes que arman las filas para que la
   barra de completitud no marque "falta seguro" de más.
4. `CaseTracking` + `CaseTrackingNote`. **HECHO 2026-08-18**: tablas creadas +
   `GET/PATCH /api/admin/cases/[id]/tracking` (completado y archivado por separado)
   y `POST/PATCH/DELETE /api/admin/cases/[id]/tracking/notes`. Las notas validan
   que pertenezcan al caso de la URL. Falta la UI (pasos 6-7).
5. API de la grilla (filtros, orden, paginación server-side). **HECHO 2026-08-18**:
   `GET /api/admin/edson/tracking`. SQL crudo, no Prisma: "la primera cita del caso"
   es un `JOIN LATERAL ... LIMIT 1` y el COALESCE con los datos del caso tiene que
   pasar en la base para poder filtrar/ordenar por el valor efectivo. Devuelve filas
   + stats del conjunto filtrado completo (no de la página) + paginación.
   Filtros: q, clinicId, providerId, apptStatus, pip, carrierId, flag
   (noPip/noAdjuster/noClaim/noAttorney/completed/pending), archived.
   Se agregó el índice `appointments(caseId, scheduledFor)` para el LATERAL:
   7098 → 2333 buffers, 11.6 → 6.3 ms. Verificado: 1004 filas.
6. Grilla + edición inline + modal de edición. **HECHO 2026-08-18**: `/edson`
   reescrito (page + client). Agrupada por día, columnas sticky, chip de PIP y
   check de completado con actualización optimista, celda de observaciones que
   agrega entrada (Enter guarda, Shift+Enter salta línea), modal con seguro +
   adjuster filtrado por aseguradora + timeline de notas. i18n es/en (81 claves en
   `phoenix.edsonTracking`). Se agregó `PATCH` parcial a auto-insurance —el `PUT`
   es reemplazo completo y el chip de PIP habría borrado claim y adjuster— y
   `GET /api/admin/adjusters/by-carrier`. Verificado en navegador: GET /edson 200.
7. Tab archivados. **HECHO 2026-08-18**: en archivados la fila es de SOLO LECTURA
   (PIP, completado y observaciones dejan de ser editables), aparece la columna
   "Archivado" con la fecha y la unica accion es Restaurar.
8. Quitar `/intake` del sidebar + migrar `clinicModules`. **HECHO 2026-08-18**:
   fuera del sidebar y del checkbox del Admin de usuarios. En el middleware
   `/intake` NO se borró: pasa a gobernarse con el módulo `edson`
   (`/^\/(edson|intake)/`) — sacarlo de la lista lo habría dejado SIN gobierno,
   visible para cualquiera con un módulo cualquiera.
   Un solo usuario tenía `intake: true` (beatriz@precisionmedicalcare.com) y
   conserva otros 4 módulos, así que no queda huérfano. Las rutas `/intake/*`
   siguen vivas porque `verify-pip` sella `pipVerifiedAt`.
   PENDIENTE de decisión de Erick: si Beatriz debe recibir el módulo `edson`
   como equivalente del `intake` que se retiró.
9. Mapa de colores por estado de cita. **BLOQUEADO** — espera que Erick agregue
   los estados nuevos a `Appointment.status` y defina el mapa. Vive en la
   constante `APPT_STATUS_COLOR` de `edson-client.tsx`, con valores
   provisionales, para que el cambio sea de una línea.


## Decisiones confirmadas por Erick (2026-08-18)

- **Colores de fila**: amarillo para no-show y rosa para cancelada, los del Excel
  de Edson, literales. Token por tema en `globals.css` — Edson usa el tema
  CLARO, viene de su hoja de cálculo.
- **El color mira la cita MÁS RECIENTE**, no la primera. Las columnas siguen
  siendo las de la primera. Consecuencia aceptada: un caso que canceló su
  primera cita y ya tiene otra agendada (ej. `MVA-3178`) deja de verse cancelado
  — el caso está vivo y eso es lo correcto.
- **Precedencia**: si la cita no ocurrió, ese fondo gana sobre el verde de
  "listo para Brunella". El check verde sigue visible en su columna.
- **Colisión del ámbar aceptada**: en la franja lateral significa "sin
  confirmar" y en el fondo el amarillo significa no-show. Son dos canales
  distintos y en uso real no chocan. NO reasignar `PENDING`.
- **Divergencia con el calendario aceptada**: allá un no-show es gris, acá
  amarillo. Es el precio de darle sus colores a Edson.


## Encargados del caso (case managers) — 2026-08-18

Pedido de Edson: poder anotar nombre, email y teléfono de los encargados del
caso, **más de uno**.

**No se resolvió como nota de texto.** Es data estructurada y repetida, y la
persona pertenece al bufete: como nota, Edson retipearía el mismo email en cada
caso de ese bufete — el problema que ya resolvió el catálogo de adjusters.

**Modelo**: la PERSONA vive en el bufete (`Lawyer` con `parentFirmId` y
`memberRole`, que ya incluía `CASE_MANAGER`; había 68 miembros cargados en 17
bufetes). Lo que es del caso es la ASIGNACIÓN → tabla `case_managers`, N por
caso.

**Rotan** (Erick: "un case manager puede irse del bufete y después nombran a
otro"). Por eso quitar a alguien **cierra** la asignación con `removedAt` en vez
de borrarla: si se borrara, Edson perdería a quién le escribió el mes pasado.
El unique es `(caseId, lawyerId)` y reasignar a alguien que ya estuvo revive su
fila.

**UI**: la columna Attorney abre un popover con clic —NO hover: con hover el
panel se cierra al ir hacia él y copiar un email se vuelve una pelea, y en iPad
no existe— con los encargados y sus emails copiables. En el modal, una sección
para asignar de los que ya están en el bufete o crear uno nuevo al vuelo, que
queda como miembro del bufete y aparece en sus demás casos.

# Plan — Settings del portal médico + Snippets por sección de la nota

> Estado: F1 + F2 + F3 IMPLEMENTADAS y verificadas en navegador (2026-09-05).
> Sin commitear: lo hace la sesión de git.
>
> Cambio sobre el plan original, pedido por Erick al ver la F2: la lista de
> snippets NO es un panel que se despliega desde el título, sino la columna
> "Available Snippets" a la IZQUIERDA del editor de cada sección, siempre
> visible, con un solo interruptor arriba para ocultar las seis — "igual a
> Medusa, los doctores están acostumbrados". Ver §7.
>
> Verificado: pegado desde Medusa con casillas y blancos; chips de campos del
> paciente en el catálogo; inserción en el cursor en una nota real; autoguardado
> con las 96 casillas del snippet "Abdomen"; impresión con ☑/☐ y subrayado
> (`safeHtml` convierte los `<input>` en vez de borrarlos).
> Fecha: 2026-09-05
> Referencia: Medusa (MedPrime EMR 3.2.9, medusabill.com) → "My Settings" con
> Templates + un "snippet set" por título de la nota (p. ej. `shortCode=HISPI`).
> Pedido de Erick: *"un solo menú llamado Settings y ahí meter Labs y
> Templates, y a su vez crear más templates llamados snippets: cada
> título de la nota abre sus templates por sección, el provider pone el cursor
> y al dar clic el snippet se agrega al final de la sección"*. Clinical notes
> **se queda afuera** como menú propio, "así van directo a ello" (2026-09-05).

---

## 1. Qué es

Dos cosas que llegan juntas porque comparten la pantalla:

1. **Un menú `Settings` en el portal médico** que reemplaza a dos menús de
   hoy (`Templates`, `Labs`) con un índice a la izquierda, al estilo de Medusa
   y del `/settings` del back-office. `Clinical notes` NO entra: es la cola de
   supervisión del médico administrador y se llega directo desde el menú.
2. **Snippets**: bloques de texto con formato, **atados a una sección de la
   nota**, que el provider agrega a la sección con un clic y edita ahí mismo.
   Son la pieza que hace que un HPI salga en 30 segundos en Medusa.

Los templates (nota completa) ya son los de Medusa: las siete filas coinciden
(BC - Annual Physical, BC-MVA, BC-URI, NG-MVA F/U, NG-MVA NEW, NG-Nursing
Home F/U y New). No se tocan.

## 2. Cómo se comporta el snippet (lo que Erick confirmó)

- **Es solo contenido con formato.** Título + HTML. Puede traer negritas,
  listas, casillas (☐) y espacios en blanco para completar.
- **Se agrega, nunca reemplaza.** Cae en la posición del cursor dentro de la
  sección, o al final si no hay cursor. Se pueden apilar varios en la misma
  sección.
- **El provider lo edita en la nota como cualquier texto**: borra lo que no
  aplica, completa los blancos, marca casillas.
- **Lo guardado es lo que se imprime.** No hay conversión al firmar ni lógica
  especial en el PDF: el HTML de la sección va tal cual a `/doctor-print`.
- **Campos de combinación** (Medusa: `[Patient Name] [Age] [DOB] [Sex] [Phone]
  [Insurance Details]`): se resuelven con los datos del paciente **al insertar**
  el snippet en la nota, no al guardarlo en el catálogo.
- **Globales con favoritos personales**, misma regla que las plantillas
  (Erick 2026-07-28): cualquier provider crea y edita, **solo el admin
  elimina**, la estrella es de cada uno.

## 3. El menú Settings

Índice a la izquierda, contenido a la derecha. En este orden:

| Ítem | Qué es | Ruta | Gobernado por |
|---|---|---|---|
| **Templates** | Las plantillas de nota completa (pantalla actual, tal cual) | `/doctor/settings/templates` | toggle `doctor:templates` |
| Motivo de consulta | snippets de `QUEJA_PRINCIPAL` | `/doctor/settings/snippets/QUEJA_PRINCIPAL` | `doctor:templates` |
| Historia de la enfermedad actual | snippets de `HPI` | `…/snippets/HPI` | `doctor:templates` |
| Revisión por sistemas | snippets de `ROS` | `…/snippets/ROS` | `doctor:templates` |
| Examen físico | snippets de `EXAMEN_FISICO` | `…/snippets/EXAMEN_FISICO` | `doctor:templates` |
| Evaluaciones | snippets de `EVALUACIONES` | `…/snippets/EVALUACIONES` | `doctor:templates` |
| Plan | snippets de `PLAN` | `…/snippets/PLAN` | `doctor:templates` |
| **Laboratorios** | catálogo de precios (pantalla actual de `/doctor/catalog`) | `/doctor/settings/labs` | toggle `doctor:catalog` |

Los seis títulos de snippets se agrupan visualmente bajo un rótulo
"Snippets por sección" debajo de Templates, como el menú izquierdo de Medusa.

### 3.1 Toggles por usuario — sin migrar nada

Hoy `users.clinicModules` ya guarda `doctor:templates` y `doctor:catalog` en
`false` para personas reales. **No se inventa una llave `doctor:settings`**: el
menú Settings se ve si la persona ve **al menos uno** de sus ítems, y cada ítem
sigue gobernado por la llave que ya tenía. Así:

- lo guardado hoy sigue valiendo sin tocar la base;
- el middleware sigue mapeando ruta → llave por prefijo
  (`/doctor/settings/templates` y `/doctor/settings/snippets/*` → `templates`,
  `/doctor/settings/labs` → `catalog`);
- `/doctor/settings` exacto redirige al primer ítem visible;
- el diálogo de usuario solo cambia las **etiquetas** ("Settings › Plantillas
  y snippets", "Settings › Laboratorios"), no las llaves.

`Notas clínicas` no cambia en nada: sigue en `/doctor/notes`, como menú
propio del sidebar, gobernado por `canAuditNotes()` (la capacidad exige un
`true` explícito), y la página se sigue cerrando sola además del middleware.

### 3.2 Redirecciones

Las rutas viejas quedan como redirección permanente para no romper marcadores
ni enlaces de otras sesiones/planes:

- `/doctor/templates` → `/doctor/settings/templates`
- `/doctor/catalog` → `/doctor/settings/labs`

Enlaces internos que hay que actualizar (medido con grep, 2026-09-05):
`components/layout/sidebar.tsx` (líneas 100–101),
`components/visit/charge-picker-dialog.tsx:479` (link a `/doctor/catalog`),
`lib/doctor-menu-modules.ts` (51–52).

## 4. Modelo de datos

Tabla nueva. Los snippets son independientes de las plantillas: las columnas
JSON sin usar de `TemplateSection` (`variants`, `proceduralBlocks`,
`lockedBlocks`, `priceReferences`) cuelgan de una plantilla y quedan quietas.

```prisma
model Snippet {
  id          String             @id @default(cuid())
  sectionKey  TemplateSectionKey            // reusa el enum de las plantillas
  title       String                        // "Abdomen", "BC - MVA HPI"
  description String?
  content     String             @db.Text   // HTML con formato, casillas, blancos y campos de combinación
  scope       TemplateScope      @default(SHARED)
  createdById String
  createdBy   User               @relation("SnippetCreatedBy", fields: [createdById], references: [id])
  favorites   SnippetFavorite[]
  usageCount  Int                @default(0)
  isActive    Boolean            @default(true)
  sortOrder   Int                @default(0)
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  deletedAt   DateTime?

  @@index([sectionKey])
  @@index([createdById])
  @@map("snippets")
}

model SnippetFavorite {
  id         String    @id @default(cuid())
  snippetId  String
  snippet    Snippet   @relation(fields: [snippetId], references: [id], onDelete: Cascade)
  userId     String
  user       User      @relation("SnippetFavorites", fields: [userId], references: [id])
  usageCount Int       @default(0)
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())

  @@unique([snippetId, userId])
  @@index([userId])
  @@map("snippet_favorites")
}
```

- `DIAGNOSTICOS` NO admite snippets: esa sección guarda JSON, no HTML, y ya
  tiene su picker propio.
- **El SQL sale de `prisma migrate diff` y se aplica solo lo nuestro.**
  `db push` arrastra ~47 sentencias ajenas con `DROP CONSTRAINT` en 3 tablas
  (memoria `trap-db-push-arrastra-deriva`). El `@default(cuid())` no existe en
  la DB (`trap-cuid-default-no-existe-en-la-db`): todo insert va por Prisma
  Client, que genera el id en la app.

### 4.1 Los tokens dentro del HTML

Para que el editor, la nota y el PDF hablen el mismo idioma:

| Cosa | HTML guardado | En el editor | En el PDF |
|---|---|---|---|
| Casilla | `<input type="checkbox" data-check>` (+ `checked`) | clic la marca/desmarca y dispara `onChange` | ☑ / ☐ vía CSS de impresión |
| Blanco | `<span data-blank>&nbsp;&nbsp;&nbsp;</span>` | tramo editable resaltado | subrayado |
| Campo de combinación | `<span data-merge="patient.name">[Nombre del paciente]</span>` | chip no editable **solo en el catálogo** | nunca llega: se resuelve al insertar |

Campos de combinación disponibles (los de Medusa, con los datos que ya trae
`buildPatientContext` en la consulta): `patient.name`, `patient.age`,
`patient.dob`, `patient.sex`, `patient.phone`, `patient.insurance`. La fecha de
nacimiento se formatea **sin zona** (`trap-fecha-de-nacimiento-sin-zona`).

El sanitizador del `RichTextEditor` tiene que aceptar exactamente esos tres
nodos con esos atributos y nada más.

## 5. API

`/api/admin/snippets` — mismo esqueleto que `/api/admin/templates`:

- `GET ?section=HPI` → lista (con `_count.favorites`, favorito del que pide).
- `POST` → crea. Autor = `users.id` de Phoenix resuelto por email (puente
  `phoenixUserId`, mismo que templates). Audit `CREATE_SNIPPET`.
- `PATCH` → edita (body.id). Audit `UPDATE_SNIPPET` con before/after.
- `DELETE ?id=` → soft delete, **solo `SUPER_ADMIN`/`ADMIN`** vía
  `fetchDbRole` (copiar el patrón del DELETE de templates, no el del GET).
- `/api/admin/snippets/[id]/favorite` `POST`/`DELETE` → igual que el de
  templates.
- `/api/admin/snippets/[id]/use` `POST` → `usageCount++` global y del favorito.
  Fire-and-forget desde el editor; sin audit (es telemetría, como el
  autoguardado).

Nada de esto toca la API de la nota (`visit-notes/[appointmentId]`): la nota
sigue recibiendo HTML por sección.

## 6. La pantalla de snippets (Settings)

Por sección elegida en el índice:

- Cabecera con el nombre de la sección y `Nuevo snippet`.
- Buscador + filtro `Favoritos`, tabla `DataTable` compacta (`!py-1`): título,
  descripción, favorito (estrella), actualizado, acciones ver/editar/eliminar
  (eliminar solo con `canDelete`). Mismo componente base que la lista de
  plantillas — se extrae lo común, no se copia.
- **Diálogo de snippet**: título, descripción, `RichTextEditor` con dos
  botones nuevos (casilla, blanco) y un panel lateral "Campos del paciente"
  que inserta el chip de combinación en el cursor. Igual al de Medusa pero
  con nuestro editor.

### 6.1 Pegar desde Medusa ES la migración

Medusa no exporta. Los snippets los van a **recrear a mano los chicos**,
copiando del editor de Medusa y pegando en el nuestro (Erick, 2026-09-05).
Eso convierte el pegado en un requisito de primera, no en un detalle:

- El `onPaste` del `RichTextEditor` tiene que conservar negritas, listas,
  saltos de párrafo y **las casillas** (`<input type="checkbox">` de TinyMCE
  llegan en el HTML del portapapeles) y tirar todo lo demás: estilos inline,
  fuentes, `class`, `id`, `span` vacíos. Hoy el sanitizador pega texto plano
  o HTML sin filtrar — verificar y ajustar en F1 (formato) y F3 (casillas).
- Los `[Patient Name]`, `[Age]`, etc. de Medusa llegan como texto literal
  entre corchetes. El editor los reconoce al pegar y los convierte al chip
  `data-merge` equivalente, para que no haya que reinsertarlos uno por uno.
- El campo Título acepta el mismo nombre que en Medusa ("Abdomen",
  "BC - MVA HPI"); no hay validación de unicidad para no estorbar la copia.

Los siete templates ya están; lo que falta migrar son los snippet sets de
Medusa para HPI, ROS Other, PE Other, Assessment y Treatment Plan. Physician
Observations, Free Text, Nurse Note, Referral, Letter, Addendum y el resto no
tienen sección destino en v3 (ver §11).

## 7. En la nota (consulta y Day Admission)

- Cada sección tiene su lista "Snippets disponibles" (`SnippetPanel`) **dentro
  del recuadro del editor**, a la izquierda del texto y compartiendo el marco
  (el `sidePanel` del `RichTextEditor`; en angosto va arriba del texto). Es la
  disposición exacta de Medusa (Erick, 2026-09-06: "adentro, no al lado").
  Buscador arriba, los títulos como enlaces, favoritos primero y después los
  más usados. **Se abre por sección** con el enlace "Snippets" que va junto a
  "Templates" en el título; arranca cerrada y las secciones que cada provider
  deja abiertas se recuerdan en su navegador (`localStorage`,
  `pm.nota.snippets.secciones`). No hay botón general. Si la sección no tiene
  snippets, la lista lo dice y ofrece crear uno (link a Configuración, solo en
  el portal). "Templates" trae la sección de una plantilla; "Snippets", un
  snippet.
- La lista se carga por API al montarse cada sección (`GET
  /api/admin/snippets?section=`) con caché de un minuto. Hoy trae el contenido
  completo de cada snippet; si el catálogo crece a cientos por sección, el
  paso siguiente es una lista liviana y traer el contenido al hacer clic.
- **Inserción en el cursor**: el `RichTextEditor` expone un handle
  `insertHtmlAtCursor(html)`; si el foco no está en esa sección, agrega al
  final. Antes de insertar se resuelven los `data-merge` con el paciente de la
  cita. Marca la sección como tocada (`tocadas`) y dispara el autoguardado
  igual que teclear.
- Las casillas se marcan con clic dentro de la nota; el cambio cuenta como
  edición (dirty + autosave). No hay auto-inyección de nada: siempre lo decide
  una persona (regla de `citarEnHpi`).
- Nota firmada: solo lectura, como hoy; las casillas se ven pero no se tocan.

## 8. Archivos

Nuevos:
- `packages/database/prisma/schema.prisma` (+2 modelos, +2 relaciones en `User`) y la migración SQL propia.
- `apps/back-office/app/api/admin/snippets/route.ts`, `[id]/favorite/route.ts`, `[id]/use/route.ts`.
- `apps/back-office/app/doctor/settings/layout.tsx` (índice izquierdo), `page.tsx` (redirige al primer ítem visible).
- `apps/back-office/app/doctor/settings/templates/page.tsx` (mueve `doctor/templates`).
- `apps/back-office/app/doctor/settings/snippets/[section]/page.tsx` + `snippets-client.tsx` + `snippet-dialog.tsx`.
- `apps/back-office/app/doctor/settings/labs/page.tsx` (mueve `doctor/catalog`).
- `apps/back-office/components/visit/snippet-panel.tsx`.
- `apps/back-office/lib/snippet-merge.ts` (resolver `data-merge` con el paciente).
- `apps/back-office/lib/snippet-sections.ts` (las 6 secciones con snippet, compartido por índice, API y nota).

Modificados:
- `lib/doctor-menu-modules.ts` (rutas nuevas bajo las llaves viejas), `middleware.ts` (redirect de `/doctor/settings` exacto + 2 redirecciones permanentes), `components/layout/sidebar.tsx` (un ítem Settings, visible si algún hijo lo es; `Notas clínicas` queda como está).
- `components/ui-phoenix/rich-text-editor.tsx` (handle imperativo, casilla, blanco, sanitizador).
- `components/visit/visit-note-editor.tsx` (título clicable + panel + inserción).
- `components/visit/charge-picker-dialog.tsx:479` (link a labs).
- El diálogo de usuario que etiqueta los menús del portal (`753d3b27`): solo textos.
- `doctor-print/visit-note` (CSS para casillas y blancos).
- i18n: claves nuevas en `es`/`en` bajo `phoenix.doctor` y `phoenix.nav`, commiteando solo las claves propias (`procedimiento-i18n-compartido`).

## 9. Fases

| Fase | Qué entrega | Se puede ver en navegador |
|---|---|---|
| **F1** | Modelo + migración, API completa, menú Settings con la mudanza de Templates y Labs, redirecciones, CRUD de snippets con texto con formato (sin casillas ni campos aún) | Sí: Settings entero y snippets creados y listados |
| **F2** | Panel de snippets en la nota, inserción en el cursor, campos de combinación resueltos, contador de uso | Sí: una nota con HPI armado por snippets e impresa |
| **F3** | Casillas y blancos en el editor (catálogo y nota), sanitizador, CSS de impresión | Sí: el snippet "Abdomen" de Medusa reproducido |

Cada fase se verifica en navegador antes de darse por cerrada
(`regla-cerrado-no-es-verificado`). Esta sesión no hace `git add` ni push:
lo hace la sesión designada (`regla-una-sola-sesion-toca-git`).

## 10. Decisiones tomadas (revisables)

1. Snippets **globales con favoritos personales**; solo admin elimina (Erick, 2026-09-05).
2. **Agregar, no reemplazar**, en la posición del cursor (Erick, 2026-09-05).
3. **Sin conversión al firmar**: lo guardado es lo impreso (Erick, 2026-09-05).
4. **Labs entra a Settings; Clinical notes se queda afuera** como menú propio, "así van directo a ello" (Erick, 2026-09-05).
5. Los toggles `doctor:templates`/`doctor:catalog` **se reutilizan** para los ítems de Settings; no hay llave nueva ni migración de `clinicModules`.
6. Snippets solo para las **seis secciones HTML**; `DIAGNOSTICOS` queda afuera.
7. Tabla propia; las columnas JSON de `TemplateSection` no se usan.

## 11. Lo que NO entra

- Las categorías de Medusa que no son secciones de nuestra nota: Letter,
  Referral, Nurse Note, Addendum, Fax, Coder, OrderSet, Discharge Summary,
  In-Office Procedure. Entrarán cuando exista el documento que las use.
- Snippets personales (scope `PERSONAL`): la columna queda, la UI no lo ofrece.
- Migrar los snippets de Medusa por script: **Medusa no exporta**. La carga la
  hacen los chicos a mano, pegando (§6.1). Nosotros entregamos la estructura
  que lo soporte.

## 13. Snippets de mensajería (2026-09-06)

Medusa tiene "Send Message Snippets" en el mismo My Settings: al redactar o
responder un mensaje, la lista aparece a la IZQUIERDA del editor y el clic
agrega en el cursor. Erick pidió lo mismo y confirmó que va centralizado.

Qué se hizo:

- **Dos categorías** en `snippets` (valores nuevos del enum
  `TemplateSectionKey`; SQL en `20260906-snippets-mensaje.sql`), pedidas por
  Erick el mismo día: **`MENSAJE_PROVIDER`** (los temas propios de los
  providers) y **`MENSAJE_CLINICA`** (recepción, cobranza). No son secciones de
  la nota: `lib/snippet-sections.ts` separa `SNIPPET_NOTE_SECTIONS` (6) de
  `SNIPPET_MESSAGE_SECTIONS` (2); `SNIPPET_SECTIONS` es la unión que valida la
  API. `messageContextFor(pathname)` dice si se escribe desde el portal o el
  back-office y `ownMessageSection()` en cuál se guarda lo propio.
- **Quién ve qué al escribir lo decide la API**
  (`GET /api/admin/snippets?messageContext=portal|backoffice`): ADMIN y
  SUPER_ADMIN ven los dos grupos, con su encabezado; el resto, el de su
  contexto. El cliente solo dice dónde está — el rol no viaja al navegador.
- **Dónde se administran:** los de providers en Configuración del portal
  (grupo Mensajería, dos ítems); los de clínica en un tab nuevo **Snippets de
  mensajes** de `/settings` del back-office, con la misma pantalla
  (`SnippetsClient` con `section="MENSAJE_CLINICA"`). Cualquiera crea y edita;
  borra solo admin.
- **Compose e hilo** (`compose-message-dialog.tsx`, `thread-view-dialog.tsx`):
  la lista vive dentro del recuadro del editor, a la izquierda del texto, al
  redactar Y al responder (Reply, Reply All, Forward); arranca cerrada, el
  botón "Plantillas" la abre y la elección se recuerda en el navegador. El clic inserta en el cursor con `insertHtmlAtCursor`, resuelve
  `[Patient Name]` con el paciente del mensaje (los demás campos quedan entre
  corchetes: el mensaje no trae DOB ni seguro) y suma el uso. "Guardar como
  plantilla" guarda en el grupo propio. Lo compartido vive en
  `message-snippet-list.tsx`.
- **`InsertList`** (ui-phoenix): la lista es un primitivo con grupos
  opcionales; `SnippetPanel` (nota) y `MessageSnippetList` (mensajería) son
  dos usos con fuentes distintas.
- La tabla `message_templates` y su API `/api/messages/templates` se retiraron
  del código: las 2 filas que había (pruebas del QA, hechas por staff) se
  migraron a `snippets` como `MENSAJE_CLINICA`. La tabla queda en la base sin
  lectores; se dropea en una limpieza posterior.

## 12. Preguntas abiertas

1. Nombre visible del menú en español: "Configuración" (como el back-office) o
   "Ajustes". El plan asume "Configuración" / "Settings".

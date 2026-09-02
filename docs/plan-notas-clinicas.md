# Plan — Notas clínicas (supervisión de providers)

> Estado: F1 + F2 + F3 IMPLEMENTADAS — sin verificar en navegador
> Fecha: 2026-09-01
> Pedido de Erick: *"una nueva opción de menú que solo la verán los admin de los
> doctores, donde podrán ver todas las notas que hicieron todos los providers y
> las notas que están pendientes o no cerradas o no las hicieron, con los filtros
> necesarios"*.

---

## 1. Qué es

Una pantalla de **supervisión de notas clínicas** para quien administra a los
providers. Responde, en este orden, las tres preguntas que se hace:

1. **¿Quién está atrasado?** — deuda por provider.
2. **¿Qué falta exactamente?** — la lista de visitas sin nota o con la nota abierta.
3. **¿Qué se escribió?** — el archivo de notas cerradas, con filtros.

No es un reporte: es una **cola accionable**. Desde la fila se lee la nota y se
le manda el recordatorio al provider.

## 2. La regla estructural — se listan VISITAS, no notas

**La unidad de la lista es la cita, no la fila de `visit_notes`.**

La nota se crea al PRIMER guardado. Un provider que atendió y no escribió nada
**no deja fila**, así que una pantalla que consulte `visit_notes` es
estructuralmente ciega justo al peor caso.

Medido en agosto de 2026: **38 de 53 pendientes eran de ese tipo**.

`GET /api/admin/pending-notes` ya lo resuelve bien (consulta `appointments` y
mira la nota por izquierda). Esa lógica se extrae a un helper compartido — ver §6.

## 3. Estados que muestra

| Estado | Cómo se detecta | Qué significa |
|---|---|---|
| **Sin nota** | La cita califica y `visitNote is null` | Nadie escribió nada. El peor caso |
| **Borrador** | `visitNote.status = 'DRAFT'` | Empezada y sin cerrar. Puede llevar meses |
| **Firmada** | `visitNote.status = 'SIGNED'` | Cerrada. Hoy no existe ningún listado de estas |
| **Anulada** | `visitNote.status = 'VOIDED'` | Fuera del default; se ve si se la pide |

**Una cita "califica"** con el mismo criterio que ya usa la cola de pendientes, y
no se puede cambiar solo de un lado:

- `status NOT IN ('CANCELLED', 'NO_SHOW')` — una cita cancelada o a la que el
  paciente no vino no debe nota.
- Y fue atendida: `checkedInAt IS NOT NULL` **o** `status IN ('IN_PROGRESS','COMPLETED')`.
  Las citas futuras no cuentan.

## 4. La vista, en tres capas

### 4.1 · KPIs (cuatro)

| KPI | Origen |
|---|---|
| Pendientes totales | `count` de citas que califican con nota nula o DRAFT |
| Sin ninguna nota | el subconjunto `visitNote is null` — el número que duele |
| La más vieja | días de la pendiente más antigua |
| Firmadas fuera de 24 h | `signedAt - scheduledFor > 24h` sobre las firmadas del rango |

El cuarto ya lo calcula `getProviderMetrics` como `notesSignedWithin24hPct`.

### 4.2 · Resumen por provider

Una fila por provider activo: **sin nota · borradores · firmadas · % dentro de
24 h · la más vieja**. Ordenada por deuda descendente.

Va primero porque la primera pregunta del admin es *quién*, no *cuál*. Clic en
una fila → baja a la lista filtrada por ese provider.

Los tres números del medio ya existen en `lib/provider-metrics.ts`
(`notesSigned`, `notesDraft`, `notesSignedWithin24hPct`).

### 4.3 · Lista de visitas

| Columna | Origen |
|---|---|
| Fecha de la visita | `Appointment.scheduledFor` (Denver) |
| Paciente | `Patient.firstName/lastName` — **requiere `dec()`** |
| Caso | `Case.caseCode` |
| Provider | `Appointment.provider` |
| Clínica | `Appointment.clinic.name` |
| Estado | derivado (§3) |
| Antigüedad | días completos desde `scheduledFor` contra el inicio de HOY |
| Firmada | `VisitNote.signedAt` + `signedByName` (solo si SIGNED) |
| Acciones | ver la nota · recordar al provider |

**La lista NO muestra contenido clínico.** Solo metadatos. El texto queda detrás
de la vista de impresión, que es un acto deliberado y no un scroll accidental.

Orden por defecto: **la más vieja primero** en pendientes; **la más nueva
primero** cuando el filtro incluye firmadas (ahí es archivo, no cola).

## 5. Filtros

| Filtro | Notas |
|---|---|
| **Provider** | El principal. Multi-selección |
| **Estado** | Sin nota · Borrador · Firmada · Anulada. Default: los dos primeros |
| **Rango de fechas** | Sobre `scheduledFor` |
| **Antigüedad** | >7 · >30 · >90 días. **Es distinto del rango de fechas**: es el filtro de riesgo |
| **Clínica** | |
| **Búsqueda** | Paciente o código de caso |

Todos viajan en la **URL** (`?provider=&estado=&desde=&hasta=&antiguedad=&clinica=&q=&page=`),
como en Pacientes: recargar reproduce la vista y el link se puede pasar por chat.

## 6. Archivos

### Nuevos

| Archivo | Qué |
|---|---|
| `apps/back-office/lib/notes-audit-module.ts` | La llave de la capacidad. **Sin imports** — la comparten el middleware (Edge) y los server components (Node), igual que `doctor-view-module.ts` |
| `apps/back-office/lib/notes-audit.ts` | El **where compartido**: qué cita califica y cómo se deriva el estado. Lo consumen la pantalla nueva Y `/api/admin/pending-notes` |
| `apps/back-office/app/(admin)/notes/page.tsx` | Server component: lee searchParams, arma los filtros |
| `apps/back-office/app/(admin)/notes/notes-data.tsx` | La query + paginación + los conteos. Espejo de `patients-data.tsx` |
| `apps/back-office/app/(admin)/notes/notes-client.tsx` | Barra de filtros + tabla + resumen por provider |
| `apps/back-office/app/(admin)/notes/loading.tsx` | Regla #1 |

### Modificados

| Archivo | Cambio |
|---|---|
| `app/(admin)/layout.tsx` | Resolver `canAuditNotes` junto a `canViewAsDoctor` (~línea 65) y pasarlo al shell |
| `components/layout/admin-shell.tsx` | Nueva prop, como `canViewAsDoctor` |
| `components/layout/sidebar.tsx` | Ítem nuevo con el patrón de `DOCTOR_PORTAL_ITEM` — **sin `moduleKey`**, ver §7 |
| `middleware.ts` | Cerrar `/notes` y `/api/admin/notes*` con la capacidad. El menú solo esconde, no cierra |
| `app/api/admin/pending-notes/route.ts` | Pasar a usar el where de `lib/notes-audit.ts`. **Sin esto hay dos definiciones de "pendiente" y se separan** |
| `app/doctor-print/visit-note/[appointmentId]/page.tsx` | Aceptar también la capacidad nueva — ver §7 |
| `packages/i18n/messages/{es,en}.json` | Claves nuevas |

**No hace falta API nueva en F1.** La pantalla es un server component que
consulta directo, como Pacientes. `/api/admin/pending-notes` sigue existiendo
para los dos widgets que ya lo usan (Mi Día y Day Admission).

## 7. Acceso

**Capacidad OPT-IN, no un módulo del menú.**

Los módulos se ven *salvo* que su llave esté en `false`, y un mapa nulo ("Visión
completa") los concede todos. Esta pantalla expone al paciente de **todos** los
providers: no puede caer de esa regla. Se copia el patrón del Portal Médico —
solo cuenta un `true` explícito en `users.clinicModules`, más SUPER_ADMIN/ADMIN
por rol.

**Ojo con la lectura de la nota.** Hoy la vista de impresión autoriza con
`canViewAsDoctor` (`doctor-print/visit-note/page.tsx:96`). Si la capacidad nueva
va sola, el admin ve la lista y **no puede abrir ni una** — el mismo callejón que
venimos destapando toda la semana. La ruta de impresión tiene que aceptar
**cualquiera de las dos**. Es una línea, y va en F1 o la pantalla nace rota.

Lo que la vista de impresión ya resuelve y no hay que rehacer: acepta borradores
(no exige SIGNED) y devuelve 404 cuando no hay nota, que es correcto — la visita
sin nota no tiene nada que mostrar.

## 8. Fases

| | Alcance | Por qué en ese orden |
|---|---|---|
| **F1** | Capacidad + menú + lista con filtros y paginación real + el fix de la impresión | Es lo único que hoy no se puede hacer de ninguna forma |
| **F2** | Los 4 KPIs + resumen por provider con drill-down | Lo convierte en supervisión y no en un listado |
| **F3** | Exportar CSV + recordatorio a varios providers de una | Cierra el ciclo de perseguir |

## 9. Volumen y rendimiento

- En agosto había **332 borradores contra 7 firmadas**. La API actual corta en
  **200 sin paginar**: la pantalla nueva necesita paginación de server desde el
  día uno o miente.
- Las secciones de la nota son `@db.Text`. **Nunca traerlas en el `select` de la
  lista** — son seis campos de texto largo por fila.
- `visit_notes` tiene `@@index([status])`; `appointments` tiene índices por
  `providerId` y `scheduledFor`. El filtro por antigüedad se traduce a un rango
  sobre `scheduledFor`, no a un cálculo por fila.

## 10. Decisiones tomadas (revisables)

1. **No se fusiona con Métricas.** En `apps/web` ya hay una pestaña "Doctores"
   con `notesSigned`/`notesDraft`. Eso es el **reporte**; esto es la **cola
   accionable**, y vive en back-office porque acá están la nota, la impresión y
   la mensajería.
2. **El admin lee, no entra.** Abre la nota por la vista de impresión. Entrar a
   la consulta de otro provider sigue detrás de "ver como doctor", que ya existe.
3. **Nombre del menú: "Notas clínicas"** (`Clinical notes`). Corto, sustantivo,
   consistente con el resto del sidebar.

## 11. Lo que NO entra

- Editar o firmar la nota de otro provider desde acá. La firma es del médico y el
  servidor la rechaza — no se toca esa regla.
- Mostrar el contenido clínico en la lista.
- Borrar o anular notas.
- Cualquier cambio al criterio de "cita que debe nota" sin actualizar
  `lib/notes-audit.ts`, que a partir de F1 es el único lugar donde vive.

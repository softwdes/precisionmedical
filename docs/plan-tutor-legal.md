# Plan · Tutor legal como Paciente vinculado

> **Documento de traspaso.** Escrito 2026-08-03. Todo lo necesario para
> implementar está acá — no hace falta re-analizar.
>
> ⚠️ **Conviene hacerlo ANTES de re-migrar** (ver `plan-migracion-v2-v3.md`):
> si la migración puebla tutores con una regla y la UI los crea con otra, quedan
> dos criterios conviviendo en la misma tabla. Extrayendo el helper primero, la
> migración puede usar **la misma** regla.

---

## 1. El problema

Un paciente **menor de edad** necesita un tutor / apoderado. Hoy:

- **Al crear** un caso, el flujo pide los datos del tutor y lo **vincula bien**:
  guarda `guardianPatientId` apuntando a la ficha del tutor (que crea si no existe).
- **Al editar** un paciente, el formulario mira los campos de **texto legado**
  (`guardianName`, `guardianPhone`, `guardianRelation`) — que nadie llena.

**Consecuencia:** creás un menor con su apoderado, abrís Editar, y la sección del
tutor aparece **vacía**. El dato existe, el formulario mira el lugar equivocado.

Y desde Editar **no hay forma de asignar un tutor** — la sección es de solo lectura.

---

## 2. Modelo (ya existe, NO tocar el schema)

`packages/database/prisma/schema.prisma`, model `Patient` (~línea 762):

```prisma
guardianPatientId String?
guardianPatient   Patient? @relation("PatientGuardian", fields: [guardianPatientId], references: [id])

// Los 3 de abajo son LEGADO — el comentario del schema dice
// "quedan por compatibilidad con la data"
guardianName      String?
guardianPhone     String?
guardianRelation  String?
```

La decisión de arquitectura **ya está tomada**: el tutor es un `Patient` vinculado.

---

## 3. Reglas de negocio confirmadas por Erick

### 3.1 El tutor NO bloquea guardar
Solo se le exige para **FIRMAR los consentimientos**, que es otro momento del
flujo: el formulario se le envía al apoderado y él firma (tablet o enlace).

✅ Ya aplicado (commit `ff16226`) — se quitó el bloqueo de
`patient-edit-dialog.tsx`.

### 3.2 El correo del tutor es el canal de contacto
> *"Tenga o no correo propio el menor, el correo que vale y al que llega TODA la
> información es el del TUTOR."*

Aplica en las dos puntas: al crear paciente/caso **y** en editar.

**Consecuencia buena:** esto **disuelve el problema del `@unique`** de
`Patient.email` sin tocar el schema. El conflicto era que metían el correo del
tutor *dentro* del campo del menor (porque no tenía). Con esta regla ya no hace
falta: el menor puede quedar sin correo o con el propio, el tutor tiene el suyo,
y no hay colisión. El campo del menor deja de **usarse para enviar**, no deja de
existir.

**NO crear una columna `guardianEmail`.** Sería un tercer lugar donde vive el
mismo dato (ficha del tutor, texto en la ficha del menor, y el vínculo). El correo
vive en la ficha del tutor: si cambia, se actualiza en un solo lugar y lo heredan
todos sus hijos.

---

## 4. Ya hecho (no repetir)

| Commit | Qué |
|---|---|
| `ff16226` | El tutor ya no bloquea guardar |
| `dfaa963` | `guardianPatientId` + `guardianPatient` se traen en las 2 consultas de pacientes (server component **y** API de búsqueda — mantenerlas simétricas) |
| `868077f` | Editar **lee** el tutor vinculado y muestra su ficha: avatar, nombre, `patientCode`, correo, teléfono + leyenda "el formulario y las notificaciones se envían a este correo" |
| `e9d4233` | El correo del menor queda **editable y vacío**, con la referencia al del tutor debajo nombrando el correo concreto |

**Dato para dimensionar:** solo **5 pacientes de ~5.900** tienen
`guardianPatientId`. El flujo casi no se usó. Al probar, buscar uno de esos 5 o
crear un menor con tutor desde el alta. (Ericklars Salinas **no** tiene tutor —
verificado, `guardianPatientId: null`; su DOB 2024 parece de prueba.)

---

## 5. Lo que falta — 4 piezas

### Pieza 1 · Extraer el helper ⚠️ ALTO RIESGO
La regla de crear/vincular tutor **ya está escrita y probada** en
`apps/back-office/app/api/admin/cases/route.ts:285-320`:

```js
let guardianPatientId = null;
if (parsed.guardian) {
  const g = parsed.guardian;
  if (g.patientId) {
    guardianPatientId = g.patientId;                    // ya existe → vincular
  } else if (g.firstName.trim() && g.lastName.trim()) {
    const yaExiste = g.email
      ? await tx.patient.findFirst({ where: { email: g.email }, select: { id: true } })
      : null;                                            // dedupe por email
    if (yaExiste) {
      guardianPatientId = yaExiste.id;
    } else {
      const nuevoApoderado = await tx.patient.create({   // crear SIN caso
        data: { patientCode: await nextPatientCode(tx), firstName, lastName,
                email, phone, dateOfBirth, status: 'NEW' },
      });
      guardianPatientId = nuevoApoderado.id;
    }
  }
}
```

Puntos clave del diseño actual (**preservarlos**):
- Todo va **dentro de la misma transacción** que el menor → no puede quedar un
  apoderado huérfano si algo falla después.
- El dedupe por email existe porque *"el buscador del UI puede haberse salteado"*.

**Payload que acepta hoy** (`route.ts:61-69`):
```js
guardian: z.object({
  patientId, firstName, lastName, email, phone, dateOfBirth,
  relation: z.enum(['MOTHER','FATHER','LEGAL_GUARDIAN','OTHER']).default('MOTHER'),
}).nullable().optional()
```

**A hacer:** sacarlo a un helper compartido (ej.
`packages/database/src/guardian.ts` o `apps/back-office/lib/guardian.ts`) que
reciba el `tx` y el payload, y devuelva el `guardianPatientId`.

⚠️ **Por qué es alto riesgo:** esa ruta crea pacientes y casos en producción, en
transacción. Refactorizar sin romperla es la parte delicada. **Verificar el alta
de caso desde llamada después de tocarla.**

🐛 **Corregir de paso:** el dedupe por email debe **EXCLUIR al propio menor** que
se está creando/editando. Si el menor quedó con el correo del tutor, esa búsqueda
encuentra al menor y lo vincula **como su propio tutor**, en silencio.

### Pieza 2 · `PATCH /api/admin/patients/[id]` acepta el tutor
Hoy no recibe nada de tutor. Agregar el mismo sub-objeto `guardian` del §5.1 al
Zod schema y llamar al helper. Envolver en transacción.
**Audit log obligatorio** (Regla #3) — es una mutación de `Patient`.

### Pieza 3 · UI en `patient-edit-dialog.tsx`
Sección "Legal guardian" (~línea 546-560):

- **Autocomplete de pacientes** — ya existe `/api/admin/patients/autocomplete`.
  Al seleccionar, guardar `guardianPatientId` y mostrar la ficha (el render ya
  está hecho, ver commit `868077f`, variable `linkedGuardian`).
- **Si no hay coincidencias**: botón **EXPLÍCITO** *"Crear a X como paciente
  nuevo"*. **Nunca creación silenciosa** al perder el foco — así se multiplican
  los duplicados.
- Botón **[Cambiar]** para desvincular / reemplazar.
- Ancla ya existente para scroll: `id="guardian-field"` (la usa el alert de
  validación).

### Pieza 4 · El envío resuelve el correo del tutor ⛔ BLOQUEADA
Hoy `send-portal-link` toma el correo del **paciente**. Para menores con tutor
vinculado debe resolver a `guardianPatient.email`. **Sin esto, el formulario se
sigue yendo al correo del menor aunque la UI diga otra cosa.**

Revisar:
- `apps/back-office/app/api/admin/cases/[id]/send-portal-link/route.ts`
- `apps/back-office/app/api/sms/send-portal-link/route.ts`

⛔ **DECISIÓN PENDIENTE DE ERICK:** menor **sin** tutor vinculado al que hay que
enviarle el formulario → ¿se manda al correo del menor, o se **bloquea** el envío
avisando que falta el tutor?
**Recomendación: bloquear** — es un menor, legalmente el que firma es el tutor.

---

## 6. Orden sugerido

1. **Pieza 2** (`PATCH`) — contenida, deja el backend listo
2. **Pieza 1** (helper) — el refactor riesgoso, con la ruta de casos verificada después
3. **Pieza 3** (UI) — se enchufa a lo anterior
4. **Pieza 4** (envío) — cuando Erick decida el caso borde

Alternativa: 1 y 2 juntas si se prefiere hacer el refactor de una.

---

## 7. Trampas conocidas (no repetir)

- **Teléfonos con formato** — están guardados como `(801) 555-1121`. Si se
  dedupea o busca por teléfono, **normalizar a dígitos en ambos lados**.
- **Portales y diálogos anidados** — un `ConfirmDialog` dentro de otro diálogo se
  renderiza fuera del DOM del padre y dispara su `onInteractOutside`. Ya causó un
  bucle de "cerrar sin guardar" en este mismo archivo (commit `14a872d`): las dos
  vías de cierre están guardadas mientras haya un diálogo anidado abierto. **No
  revertir eso.**
- **`FormField.Input`** soporta `disabled`, `hint` y `error`, pero **no reenvía
  `ref`** — si hace falta enfocar, usar un ancla por `id` y `scrollIntoView`.
- **i18n del paquete workspace** — al agregar claves en
  `packages/i18n/messages/*.json` hay que **reiniciar el dev server**; Next
  cachea los mensajes.
- **Hay DOS `patient-edit-dialog.tsx`** — el de
  `app/(admin)/patients/` (el completo, el que se toca acá) y otro en
  `app/(admin)/patients/[id]/` (implementación separada y más simple, usada desde
  el detalle). Mismo patrón de duplicación ya visto con `calcAge` y los
  generadores de código. Decidir si el segundo también necesita el cambio.

---

## 8. Reglas del proyecto

- `apps/back-office/CLAUDE.md` es **vinculante**: primitivos de `ui-phoenix`,
  i18n obligatorio (`phoenix.*`), mobile-first, tokens de color por intención.
- **Audit log** (`writeAuditLog`) en toda mutación de `Patient` — Regla #3.
- **No pushear sin aprobación explícita de Erick.**

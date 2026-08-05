# Plan · Tutor legal como Paciente vinculado

> ## ✅ IMPLEMENTADO 2026-08-03 — las 4 piezas están hechas (sin commitear)
>
> Lo que queda es **probarlo en el navegador logueado** (checklist al final,
> §9). El resto del documento se conserva como registro de por qué se hizo así.
>
> | Pieza | Estado | Dónde quedó |
> |---|---|---|
> | 1 · helper | ✅ | `packages/database/src/guardian.ts` · `resolveGuardian()` |
> | 2 · PATCH acepta tutor | ✅ | `api/admin/patients/[id]/route.ts` · sub-objeto `guardian` |
> | 3 · UI con autocomplete | ✅ | `app/(admin)/patients/patient-edit-dialog.tsx` |
> | 4 · el envío resuelve el tutor | ✅ | ya estaba resuelto en `98b5987`; se agregó el bloqueo |
>
> **Decisión de Erick (2026-08-03), pieza 4:** menor **sin** tutor vinculado →
> se **BLOQUEA** el envío (400 `GUARDIAN_REQUIRED`). La vía cuando falta el
> tutor es la tablet en clínica: `generate-portal-token` no está restringido.
>
> **Decisión sobre el segundo `patient-edit-dialog.tsx` (§7):** se **eliminó**.
> `patients/[id]/` ahora importa el de `patients/`. La copia simple ya había
> divergido — seguía bloqueando el guardado por falta de tutor (lo que `ff16226`
> quitó) y no veía el vínculo real.
>
> **Documento de traspaso original.** Escrito 2026-08-03. Todo lo necesario para
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

## 8. Hallazgos de la implementación (2026-08-03)

Cosas que el plan no preveía y aparecieron al hacerlo:

1. **La pieza 4 ya estaba hecha** en el camino que se usa.
   `api/admin/cases/[id]/send-portal-link/route.ts` resolvía al tutor desde el
   commit `98b5987` (`isMinor` + `guardianPatient`). Y
   `api/sms/send-portal-link` es un stub de Phase 0 **sin ningún caller** —
   código muerto, no se tocó.

2. **Corregir el dedupe abre una vía de fallo nueva.** Excluir al menor del
   dedupe por correo evita el self-link silencioso, pero entonces el `create`
   del tutor choca contra el `@unique` de `Patient.email` y eso sale como un
   500 sin explicación. Los dos routes lo cortan antes con un 400
   `GUARDIAN_EMAIL_IS_PATIENT_EMAIL`. **Verificado contra la base real.**

3. **Los canales de envío del wizard mentían.** `canEmail`/`canSms` en el paso 4
   de `new-case-dialog` se calculaban con el correo y teléfono **del menor**,
   no del apoderado, que es quien recibe. Fallaba en las dos direcciones:
   apagaba el email cuando el menor no tenía correo aunque el apoderado sí
   (envío legítimo bloqueado), y lo dejaba encendido cuando el menor tenía
   correo y el apoderado no (400 `NO_EMAIL` que nadie leía).

4. **El `Autocomplete` era local de `new-case-dialog.tsx`.** Se movió a
   `components/ui-phoenix/autocomplete.tsx` en lugar de copiarlo (Regla #0). Al
   hacerlo apareció un bug vivo: `extraParams` es un literal inline, o sea un
   objeto nuevo en cada render, y estaba en las dependencias del `useEffect` de
   búsqueda — el componente pedía al endpoint **cada 200 ms** mientras estuviera
   montado. Ahora las deps comparan el objeto serializado.

5. **La vista de detalle (modal "ver") tenía el mismo defecto que el
   formulario:** miraba solo `guardianName`. Un menor con apoderado bien
   vinculado no mostraba nada. Corregido en `patients-client.tsx`.

6. **El label del alert de validación estaba mal.** `guardianMissing` seguía
   calculándose sobre el campo legado, así que cualquier error en un menor (un
   ZIP mal, por ejemplo) mostraba el botón "Ir al responsable legal". Ahora es
   un flag explícito del error concreto.

7. **El helper NO lo puede usar la migración todavía.** Los scripts de
   `scripts/migration/` son `.mjs` y no pueden importar TS. Para reusar la misma
   regla hay que correrlos con `tsx` o exponer un subpath compilado.

---

## 9. Checklist de prueba pendiente (navegador logueado)

No se pudo correr acá: el back-office está detrás del login de Supabase. Lo que
sí se verificó sin navegador: `tsc --noEmit` limpio en toda la app, y
`resolveGuardian` probado contra la base real con 15 aserciones dentro de
transacciones revertidas (nada persistió).

- [ ] **⚠️ Alto riesgo — alta de caso desde llamada** (B.2), menor con apoderado
      **nuevo**: se crea la ficha del apoderado con código `P-xxxx`, el menor
      queda con `guardianPatientId`, y el caso se crea igual que antes.
- [ ] Alta de caso, menor con apoderado **existente** elegido del buscador.
- [ ] Alta de caso de un **adulto** (que el refactor no rompió el camino común).
- [ ] Paso 4 del wizard con un menor: los toggles de Email/SMS deben mostrar el
      correo y teléfono **del apoderado** con la marca "al apoderado".
- [ ] Editar uno de los 5 pacientes que ya tienen `guardianPatientId`: la ficha
      del tutor aparece, y guardar sin tocar nada **no** lo desvincula.
- [ ] Editar un menor sin tutor → buscar, elegir uno existente, guardar.
- [ ] Editar un menor sin tutor → buscar algo que no existe → "Crear a X como
      paciente nuevo" → completar → guardar → verificar que se creó UNA sola
      ficha (no una por cada blur).
- [ ] Botón [Cambiar] sobre un tutor vinculado → guardar → queda desvinculado.
- [ ] Enviar formulario a un menor **sin** tutor → 400 con el mensaje que dice
      qué hacer. Con tutor → sale al correo del tutor.
- [ ] El diálogo de edición desde `/patients/[id]` (el que ahora es el
      compartido) abre y guarda bien.

---

## 10. Reglas del proyecto

- `apps/back-office/CLAUDE.md` es **vinculante**: primitivos de `ui-phoenix`,
  i18n obligatorio (`phoenix.*`), mobile-first, tokens de color por intención.
- **Audit log** (`writeAuditLog`) en toda mutación de `Patient` — Regla #3.
- **No pushear sin aprobación explícita de Erick.**

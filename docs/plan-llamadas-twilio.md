# Plan · Recepción de llamadas e historial (Twilio)

> **Documento de traspaso.** Escrito 2026-08-03 al cerrar la sesión anterior por
> falta de contexto. Todo lo necesario para implementar está acá — no hace falta
> re-analizar nada.
>
> **Mockup aprobado por Erick:**
> https://claude.ai/code/artifact/1bf7566f-392b-4e7f-97f2-ec45afeb6194
>
> Módulos afectados: **Clinic** (`apps/back-office`) y **Admin** (`apps/web`).

---

## 1. Qué se quiere

Hoy solo hacemos llamadas **salientes**. Falta:

1. **Recibir llamadas** — el paciente llama al número de Twilio (el mismo que ya
   usamos para salir) y el sistema muestra la llamada para que alguien atienda.
2. **Reconocer al llamante** — si el número está en la base, mostrar de quién es
   y su contexto clínico.
3. **Historial en Clinic** — botón junto a "Create Patient / Create Case", con
   3 pestañas: recibidas y perdidas · mis llamadas · que yo contesté.
4. **Historial global en Admin** — todos los usuarios, perdidas y contestadas,
   como vista de supervisión.

**Fuera de alcance (decisión de Erick):** grabación de llamadas y buzón de voz.
Motivo: una grabación de llamada clínica es PHI → requiere BAA con Twilio (hoy
pendiente), control de acceso, auditoría de escucha y política de retención. Se
trata como fase posterior con su propia decisión.

---

## 2. Estado actual del código

### Ya funciona
- **Llamadas salientes reales** desde 3 puntos, todos con el mismo hook
  `apps/back-office/lib/use-twilio-device.ts`:
  - `app/(admin)/patients/patients-client.tsx` (lista de pacientes)
  - `components/calendar/appointment-detail-panel.tsx` (detalle de cita)
  - `components/cases/new-case-dialog.tsx` (nuevo caso desde llamada)
- `POST /api/twilio/voice` — TwiML de salida. Crea el `CallLog` (`direction:
  OUTBOUND`), normaliza a E.164 con `toE164()`, y hace `<Dial>`.
- `POST /api/twilio/call-status` — webhook que actualiza `outcome` y
  `durationSeconds`. **Funciona para entrantes también, sin cambios.**
- `POST /api/twilio/link-call` — vincula un CallLog a paciente/caso por
  `twilioCallSid`.
- `POST /api/twilio/token` — **ya emite identidad por usuario** (ver §3).

### El modelo `CallLog` ya soporta todo — NO hay que tocar el schema

`packages/database/prisma/schema.prisma`:

```prisma
model CallLog {
  id              String  @id @default(cuid())
  twilioCallSid   String? @unique
  direction       CallDirection      // INBOUND / OUTBOUND
  fromNumber      String
  toNumber        String
  outcome         CallOutcome @default(IN_PROGRESS)
  durationSeconds Int?
  patientId       String?            // reconocimiento del llamante
  caseId          String?
  agentUserId     String?            // "userId del agente que hizo/TOMÓ la llamada"
  agentName       String?            // denormalizado para reportes
  recordingUrl    String?            // previsión, hoy siempre vacío
  createdAt       DateTime @default(now())

  @@index([patientId]) @@index([caseId]) @@index([agentUserId])
  @@index([direction]) @@index([outcome]) @@index([createdAt])
}
```

Los índices son exactamente los que necesitan las 4 vistas. Quien diseñó esto ya
había pensado en entrantes.

---

## 3. Fase 1 — HECHA (commit `dc49c43`)

**Identidad de Twilio por usuario.** Era la constante `'back-office-agent'` para
todos, lo que bloqueaba todo lo de entrantes (Twilio no podía enrutar a nadie en
particular ni se podía saber quién contestó).

En `app/api/twilio/token/route.ts`:
- identidad = `user-<supabaseUserId>`
- se exporta **`identityForUser(userId)`** → usarla en el webhook de entrantes
  para armar el ring group, sin duplicar la convención
- el endpoint ahora exige sesión (401 sin ella; antes emitía token sin autenticar)
- la respuesta incluye `identity` además de `token`
- `incomingAllow: true` ya estaba en el `VoiceGrant` — el permiso para recibir
  existía, faltaba a quién dirigir

---

## 4. Fase 2 — Vistas de historial (EMPEZAR POR ACÁ)

**Se puede hacer YA**, con los datos que las salientes ya guardan. No depende de
configurar Twilio ni de las decisiones abiertas. Da valor inmediato.

### 4.1 API

`GET /api/admin/call-logs` en `apps/back-office`:

| Query param | Efecto |
|---|---|
| `scope=mine` | `agentUserId = usuario logueado` |
| `scope=inbound` | `direction = INBOUND` (visible a todos) |
| `scope=answered-by-me` | `agentUserId = yo` + `direction = INBOUND` |
| `scope=all` | sin filtro de usuario (solo Admin) |
| `outcome=` | filtrar por resultado |
| `from=` / `to=` | rango de fechas |
| `page=` / `size=` | paginación, **default 10** (estándar §6) |

Debe incluir en la respuesta el `patient` (`id, patientCode, firstName,
lastName, phone`) y el `case` (`caseCode`) cuando existan — es lo que resuelve el
gap que señaló Erick: *el historial actual no muestra a quién se llamó*.

Para el nombre del usuario que atendió: `agentName` está denormalizado; si viene
vacío, resolver por `agentUserId`.

### 4.2 UI Clinic

- **Botón "Historial de llamadas"** junto a "Create Patient / Create Case" en
  `app/(admin)/patients/patients-client.tsx`, con **contador rojo de perdidas sin
  devolver**.
- Vista con **3 pestañas** = la MISMA tabla con distinto `scope`. No son 3 vistas
  que mantener.
- Columnas: Quién llamó · Tipo · Resultado · Atendió · Duración · Cuándo · acción.
- **1ra columna**: nombre + `patientCode` + número si hay `patientId`; si no,
  el número crudo en **ámbar** con "No registrado" (señala visualmente cuáles
  conviene dar de alta).
- Botón **"↩ Devolver"** en las perdidas → reusa el flujo de llamada a paciente
  que ya funciona (confirmación → llamando → resultado). Ver
  `patients-client.tsx`, estados `callTarget` / `activeCallInfo` / `callOwnerRef`.

### 4.3 UI Admin (`apps/web`)

Misma tabla pero **manda la columna Usuario** — es supervisión: quién atendió qué
y quién dejó perder llamadas. Filtros arriba (usuario / tipo / resultado / fecha)
y totales a la derecha (perdidas · contestadas · total).

---

## 5. Fase 3 — Llamadas entrantes

1. **Webhook del NÚMERO** (distinto del TwiML App que usan las salientes).
   Config externa: en la consola de Twilio, campo **"A call comes in"** del
   número → `https://<dominio>/api/twilio/incoming`.
2. Ese endpoint busca `fromNumber` contra `Patient.phone` y `Patient.phone2`.
   ⚠️ **Los teléfonos están guardados como `(801) 555-1121`** → hay que
   **normalizar a dígitos en AMBOS lados** o nunca matchea. (Ya existe `toE164()`
   en `api/twilio/voice/route.ts` como referencia.)
3. Crea `CallLog` con `direction: INBOUND` y `patientId` si reconoció.
4. Devuelve TwiML con un **`<Client>` por cada usuario conectado** (ring group).
   Usar `identityForUser()` del token route. Gana el primero que contesta
   (decisión de Erick).
5. **El `Device` del navegador debe registrarse al cargar la página** y escuchar
   el evento `incoming`. Hoy `useTwilioDevice` solo crea el device al llamar
   (`getOrCreateDevice()` dentro de `connect()`).
   ⚠️ **Cambio de comportamiento importante**: el registro y el permiso de
   micrófono pasan a ser permanentes mientras la app esté abierta.
6. Quien acepta → escribir su `agentUserId`. Si nadie → `outcome: MISSED`.

### UI de llamada entrante (ver mockup)
- Reconocida: verde, avatar con iniciales, nombre, `patientCode`, número, y
  **contexto clínico**: caso activo, próxima cita, estado de admisión.
  *(Esto último fue propuesta mía, Erick puede recortarlo.)*
- No reconocida: ámbar, número en mono, "Número no registrado", y ofrecer
  crear/vincular paciente al terminar.
- Botones Contestar / Rechazar.

---

## 6. Fase 4 — Admin global

Ya descrita en §4.3. Se hace después porque depende de que las entrantes
generen datos reales para que la vista tenga sentido.

---

## 7. ⛔ Decisiones abiertas (necesitan respuesta de Erick)

1. **Nadie conectado** (noche / fin de semana / navegador cerrado): hoy el
   paciente timbra al vacío y no puede dejar mensaje. ¿Reenviar a un celular
   real de recepción? ¿Mensaje grabado con el horario de atención?
   Sin definir, queda una mala experiencia para el paciente.
2. **Devolver llamada a un número NO registrado**: el flujo actual vincula el
   CallLog a un `patientId`. Hay que permitir llamar sin vínculo, o crear el
   paciente en el momento.
3. **Config externa pendiente**: setear el webhook "A call comes in" en la
   consola de Twilio (mismo tipo de paso que la Voice URL de salientes, que ya
   está configurada y funcionando).

---

## 8. Trampas técnicas ya conocidas (no repetir)

- **Normalización de teléfonos** — ver §5.2. Es el error más probable.
- **`Permissions-Policy`** — `next.config.mjs` tuvo que pasar a
  `microphone=(self)`. Si se toca esa cabecera, las llamadas se rompen con
  `PermissionDeniedError 31401` aunque el navegador tenga permiso.
- **Portales y diálogos anidados** — un `ConfirmDialog` dentro de otro diálogo se
  renderiza en un portal, FUERA del DOM del padre. Eso disparó un bucle de
  "cerrar sin guardar" en `patient-edit-dialog`. Guardar `onInteractOutside` y
  `onOpenChange` mientras haya un diálogo anidado abierto.
- **`fixed` dentro de un `DialogContent`** — el `transform` del padre lo encierra.
  Ver memoria `css-fixed-inside-dialog-trap`.
- **Ringback** — generamos un tono propio con Web Audio. Debe cortarse en
  `accept`, o se superpone al ringback real de la operadora (doble ring).
- **i18n del paquete workspace** — al agregar claves en
  `packages/i18n/messages/*.json` hay que **reiniciar el dev server**; Next
  cachea los mensajes y no los re-observa.
- **Credenciales Twilio en Vercel** tienen scope *Production and Preview*, NO
  Development → `vercel env pull` a secas no las trae. En local el token da 500.
  Usar `vercel env pull .env.vercel-temp --environment=production` y copiar solo
  las de Twilio (NO pisar `.env.local` entero: arrastra el `DATABASE_URL` de
  prod y hay dos proyectos Supabase distintos).

---

## 9. Gap conocido, aparte de este plan

**CallLog huérfano en `new-case-dialog`.** Ese flujo llama ANTES de que el
paciente exista, y el vínculo se escribe recién al crear el caso
(`api/admin/cases/route.ts:485`). Si la llamada no convierte (número equivocado,
no contesta, no le interesa), el CallLog queda sin `patientId` ni `caseId` para
siempre → invisible en las métricas. El `outcome` y la duración SÍ se guardan
siempre (webhook `call-status`).

Sugerencia: que marque el CallLog al momento de marcar (aunque sea solo teléfono
+ agente) y complete el `caseId` después.

---

## 10. Reglas del proyecto a respetar

- `apps/back-office/CLAUDE.md` es **vinculante**: primitivos de `ui-phoenix`,
  tokens de color por intención, i18n obligatorio (`phoenix.*`), mobile-first,
  sticky columns en tablas de 5+ columnas.
- Estándar de listas (memoria `feedback-table-list-design-standard`): `py-2`,
  una sola línea por celda, `border-row-sep`, **paginación de 10**.
- Módulo de llamadas/recepción → color de identidad **brand** (indigo), según la
  tabla de Regla #5 (B.1-B.4 Front Office / Recepción).
- **Audit log** (`writeAuditLog`) en toda mutación relevante — Regla #3.
- **No pushear sin aprobación explícita de Erick** (memoria
  `feedback-no-push-until-approved`).

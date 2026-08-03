# Plan · Migración v2 → v3 (datos + archivos)

> **Documento de traspaso.** Escrito 2026-08-03. Reúne todo lo aprendido en las
> corridas de prueba para **no repetir los mismos errores** al re-migrar.
>
> La data actual en `phoenix-dev` es **de prueba y se borra**. Nada de lo que
> sigue hay que "arreglar" sobre lo existente — hay que resolverlo **en los
> scripts** antes de la corrida real.

---

## 0. Antes de tocar nada: qué proyecto Supabase

⚠️ **Hay DOS proyectos Supabase distintos y desconectados:**
- **Admin** (`ztyahz…`) — usuarios / roles / auth. `roles_config` solo existe acá.
- **Phoenix** (`kiqlh…`) — la data clínica. **Acá va la migración.**

Confundirlos es el error más caro posible. Verificar el `DATABASE_URL` antes de
cada script.

⚠️ **Nunca hacer `vercel env pull .env.local`** — arrastra el `DATABASE_URL` de
producción y podés escribir en la base equivocada. Usar
`vercel env pull .env.vercel-temp --environment=production` y copiar a mano solo
lo que necesites.

---

## 1. Volúmenes de la corrida anterior (referencia)

| Entidad | Cantidad |
|---|---|
| Pacientes | 5.890 |
| Casos | 2.772 |
| Citas | 14.288 |
| ICD-10 | 98.000 |
| Insurances | 943 |
| Notas | 319 |
| Billing | 5.679 |
| Firmas (script 07) | 384 en bucket `intake-signatures` (1.104 procesados, 350 sin case map — esperado) |

Sirven para validar que la corrida nueva dé números comparables.

---

## 2. 🔴 Cifrado — 3 causas raíz distintas

El sistema tiene una capa de cifrado **legítima** AES-256-GCM (formato
`"e:<base64(iv+tag+ciphertext)>"`), implementada en `apps/back-office/lib/decrypt.ts`
y `apps/forms/lib/decrypt.ts`. **No es corrupción** — es reversible con la clave
correcta. Pero hay tres problemas independientes:

### A) La clave no está donde se necesita
`AES_GCM_KEY_B64` **solo existe en `scripts/migration/.env`**. No está en los
`.env.local` de las apps ni en Vercel (confirmado por Erick 2026-07-29). Sin
ella, `decryptField()` devuelve `null` en vez de desencriptar.

**Acción:** agregar `AES_GCM_KEY_B64` (mismo valor) como env var en Vercel para
`back-office` y `forms`, y en sus `.env.local` para desarrollo.

### B) `dec()` se aplica de forma INCONSISTENTE — es sistémico, no "faltan casos"
Solo **2 archivos** llaman a `decryptFieldOrOriginal()`:
`patients-data.tsx` y `api/admin/patients/list/route.ts`.

Hay **~20 archivos más** que leen `patient.phone` (y probablemente `employer`,
`preferredPharmacy`, `emergencyContactPhone`, etc.) **directo de Prisma**, sin
pasar por `dec()`: detalle de caso, admisión, front-office, edson, settings,
impresión de settlement, medical-history, `patient-edit-dialog`, entre otros.

**El riesgo no es solo el estado actual**: cualquier archivo NUEVO que lea estos
campos va a mostrar `e:...` crudo si nadie se acuerda de envolverlo.

**Recomendación registrada (no parchar archivo por archivo — ya se demostró que
no escala):**
1. **Preferida:** desencriptar **en la migración misma** — escribir los valores
   en texto plano al importar de v2.
2. Si el cifrado debe preservarse: un **middleware de Prisma** que desencripte al
   leer, en vez de depender de que cada call site recuerde llamar a `dec()`.

### C) 19 `caseCode` con NOMBRES DE BUFETE — desfase de columnas en el import
No es cifrado mal aplicado: al desencriptarlos dan nombres reales de bufetes —
`"Flickinger Boulton Robson Weeks"`, `"Craigg Swapp"`, `"Moxie Law"`,
`"Melton Law"`, `"Serio Garcia Law"`, `"Blood and Jensen"`,
`"Handy and Handy Attorneys at law"`, `"Recovery Law Center"`,
`"Diaz and Madson"`, `"Good Guys Injury Law"`, `"We Win Injury Law"`, uno `"None"`.

**Por qué importa de verdad:** en esos 19 casos **no hay `lawFirmId` seteado ni
nada en `consentsData.lawFirm`**. Si esto pasa en la migración real, ese valor es
**la única copia del bufete referente** y se pierde al pisar `caseCode`.

**Cómo detectar si volvió a pasar:**
```sql
SELECT "caseCode" FROM cases WHERE "caseCode" LIKE 'e:%';
```
Si da resultados → desencriptar y ver si dan nombres de bufete en vez de un
código tipo `MVA-1234` / `CASE-1234`.

**Acción:**
1. En el script que puebla `Case.caseCode`, verificar que la columna origen sea
   la correcta (probablemente un shift porque el bufete referente viene antes que
   el código en la fuente v2).
2. **Validación post-import obligatoria:** todo `caseCode` debe matchear
   `^[A-Z]+-[0-9A-Z]+$`. Si no, loggear el caso para revisión manual **antes de
   continuar**.

⚠️ **Los scripts base 01-06 ya no están en el repo** (se limpiaron post-ejecución),
así que no se pudo inspeccionar el mapeo exacto de columnas que causó el desfase.
Hay que reconstruirlo mirando la fuente v2.

---

## 3. 🔴 Normalización de teléfonos

Si el script no normaliza, el problema **vuelve** al re-migrar.

| Entrada v2 | Qué hacer |
|---|---|
| `+1-801-555-2944`, `18012145476` | Quitar el `1` de país → `(801) 555-2944`. **Son teléfonos REALES**, no basura |
| `N/A`, `NA`, `NONE` | → `null` |
| Placeholders tipo `0000000000` | **NO inventarlos.** El back-office lo hacía y trababa el intake: forms valida NANP y un área code que empieza en 0 es inválido |

**Criterio para el UPDATE — importante:** usar **lista explícita de valores**
(`upper(btrim(phone)) IN ('N/A','NA','NONE')`), **NUNCA un regex amplio** tipo
"sin dígitos". Un regex amplio arrastraría `GERENTE DE PISO` (un cargo cargado en
el campo teléfono — dato mal ubicado, no basura) y perdería información.

**Limpieza parcial ya hecha en la DB actual** (alcance mínimo aprobado por Erick,
2026-07-29): 13 filas a `null`, 9 normalizadas de `+1`. Válidos: 1.858 → 1.868.
Respaldo JSON del estado previo en el scratchpad de esa sesión.

**Casos NO tocados a propósito, requieren mirada humana:** 4 internacionales
(`33695724493`, `5541984477300`…), `GERENTE DE PISO`, y 4 inválidos varios
(`(123) 123-1231`, `1`).

---

## 4. 🔴 Timezone en las citas

`06-appointments.mjs` guardaba timestamps **sin offset** (`${date}T${time}`).
Postgres (UTC) los interpretó como UTC, pero eran hora **Mountain local** →
las citas aparecen 6-7h antes de lo real.

**Fix ya escrito:** `scripts/migration/fix-appointment-timezone.mjs` — **NO
ejecutar** contra la data actual (se borra y reimporta igual).

**Qué hacer en la corrida real:**
1. El script debe agregar offset Mountain: `${date}T${time || '09:00:00'}-07:00`,
   o mejor usar `America/Denver` para que maneje DST automáticamente.
2. Dry-run verificando que los timestamps en MDT se vean correctos **antes** de
   insertar masivamente.
3. Confirmar en el calendario que las citas caen en los slots correctos.

**Cómo detectar si volvió a pasar:** abrir el calendario y ver si **todas** las
citas migradas aparecen en el slot de 08:00 AM. Ese es el síntoma.

---

## 5. 🔴 Archivos físicos: AWS S3 (v2) → Supabase Storage (v3)

### Lo que YA está hecho
- DMS **conectado** a Supabase Storage
- Bucket `case-documents` creado
- APIs de upload/download **funcionando**
- El detalle de caso (front-office) **ya muestra la foto** si existe en
  `case.consentsData.photos.selfie` — el código está listo, solo faltan los
  archivos

### Lo que falta migrar
| # | Qué | Bucket destino |
|---|---|---|
| 1 | Fotos de pacientes: selfie, licencia (DL), tarjeta de seguro frente/dorso | `intake-photos` (`{caseId}/selfie.jpg`, etc.) |
| 2 | Documentos de casos: PDFs, contratos, liens | `case-documents` |
| 3 | `PatientDocument` | bucket correspondiente |
| 4 | Firmas de lien | ya parcialmente en DB (`lienSignatures.signatureSvg`) — **confirmar completitud** |

### ⛔ Datos que Erick debe proveer antes de arrancar
1. **Nombre del bucket S3 y región** (ej. `us-east-1`)
2. **Estructura de paths en S3 de v2** — ¿por `patientId`? ¿por `caseId`?
3. **`AWS_ACCESS_KEY_ID`** y **`AWS_SECRET_ACCESS_KEY`** de v2

Sin estos tres, esta parte no arranca.

### Archivos clave
- `scripts/migration/13-patient-documents.mjs`
- Componentes DMS en back-office

---

## 6. Qué se desbloquea al migrar (no olvidar validarlo)

- **Duplicados.** En la corrida anterior aparecieron pares exactos (mismo
  paciente/horario/doctor/caso, misma fecha de creación). Se encontraron 2 pares
  de citas en domingo y se **cancelaron** (no se borraron: una de las copias
  tenía un pago de $500 y `Appointment → AppointmentBilling → BillingPayment`
  son `onDelete: Cascade`). Erick decidió no perseguirlos porque se re-migra.
  **En la corrida nueva: validar que no se generen.**
- **`guardianPatientId`** — hoy solo **5 pacientes de ~5.900** tienen tutor
  vinculado. La migración debería poblarlo de verdad.
  ⚠️ Ver `docs/` / pending-tasks: conviene tener el **helper compartido de
  crear/vincular tutor** ANTES de migrar, para que la migración use la misma
  regla que la UI y no queden dos criterios en la misma tabla.
- **Las 14.288 citas** — verificar que aparezcan en el tab Citas de cada caso.
- **`caseCode`** — correr la validación del §2.C.
- Utilidad existente: `scripts/migration/rebuild-all-maps.mjs`.

---

## 7. Problemas de la corrida anterior ya resueltos (no re-investigar)

- Enums, timeouts, `ON CONFLICT` / `idMap` — resueltos, ver
  memoria `session-2026-07-13-migration`.
- Script 07 (firmas / case-externs) — **completado**.
- Scripts 05b-12 — ejecutados (ICD-10, insurances, notas, billing).
- `referralSourceOther` — columna agregada, fix end-to-end.
- Códigos de caso y paciente consecutivos — resueltos.
- Catálogo de labs — 76 tests LabCorp migrados.

---

## 8. Orden sugerido de ejecución

1. **Confirmar el proyecto Supabase correcto** (§0) y respaldar lo que exista.
2. **Resolver el cifrado** (§2) — decidir A/B/C antes de escribir nada.
   La decisión clave: ¿se desencripta en la migración o se pone middleware?
3. **Reconstruir los scripts 01-06** con las correcciones de teléfonos (§3),
   timezone (§4) y mapeo de columnas de `caseCode` (§2.C).
4. **Dry-run** con validaciones post-import: regex de `caseCode`, conteo de
   teléfonos válidos, spot-check de timestamps de citas en MDT.
5. **Corrida real de datos** + validaciones del §6.
6. **Archivos físicos** (§5) — requiere las credenciales AWS.
7. Verificaciones finales: calendario, tab Citas, fotos en detalle de caso.

---

## 9. Reglas del proyecto que aplican

- **HIPAA / Regla #3:** audit log (`writeAuditLog`) en mutaciones; `actorType`
  siempre presente. Para scripts de migración → `actorType: 'SYSTEM'`.
- **No commitear secrets.** `AES_GCM_KEY_B64` y las claves AWS van a env vars,
  nunca al repo.
- **No pushear sin aprobación explícita de Erick.**
- Scripts temporales de inspección: borrarlos al terminar (patrón `_tmp-*.mjs`).
- Preferir **cancelar / marcar** antes que **borrar** cuando hay dinero o PHI
  de por medio — ver el caso del pago de $500 en §6.

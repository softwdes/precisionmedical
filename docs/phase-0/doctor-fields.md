# Decisión — Campos de Doctores · Phase 0

**Decidido**: 2026-06-05 · Claude propone, Erick confirma.
**Implementado en**: `packages/database/prisma/schema.prisma` → modelo `DoctorCredentials`.

---

## Contexto

Los doctores de Precision Medical son **empleados** (`Employee.position = 'DOCTOR'`) — esto está locked en memoria (`project_clinical_lienmaster_v2.md`). Pero los doctores tienen campos clínicos específicos que un empleado regular (admin, MA, recepción) no tiene:

| Campo | Para qué |
|---|---|
| **NPI** (National Provider Identifier) | **Mandatorio** para submission de HCFA / CMS-1500 (claim al seguro). Sin NPI, no hay billing. Source: NPPES public registry. |
| **DEA Number** | **Mandatorio** para prescribir controlled substances vía DAW EPCS (B.19). Cyclobenzaprine, Tizanidine, etc. |
| **Medical License Number + State** | **Mandatorio** para practicar. El estado del license debe matchear el estado de la clínica (sin telehealth). |
| **Specialty** | Determina qué tipo de visita puede atender. Link a B.36 (catálogo de Especialidades). |
| **Digital signature** | Para firma de notas SOAP (B.21). Inmutable post-firma. |

---

## Pregunta arquitectónica

¿Dónde viven estos campos?

**Opción A**: Como campos condicionales (`NULLable`) en `employees` table
**Opción B**: Tabla separada `doctor_credentials` linkeada 1:1 a `employees` (FK)

---

## Análisis de trade-offs

| Criterio | Opción A (en `employees`) | Opción B (tabla separada) |
|---|---|---|
| **Simplicidad de queries** | ✅ No JOIN | ⚠ JOIN extra para ver credentials |
| **Schema cleanliness** | ❌ Polución: ~90% de empleados (admin, MA, recepción) tienen NULL en NPI/DEA/license | ✅ Solo doctores tienen un registro |
| **Validación** | ❌ Difícil: CHECK constraint complejo (`if position='DOCTOR' then NPI required`) | ✅ Simple: presence of row = doctor |
| **Auditoría** | ⚠ Cambios de credentials mezclados con cambios de employee | ✅ Audit dedicado |
| **HIPAA reporting** | ⚠ Reports tienen que filter empleados → doctores | ✅ Reports directos sobre la tabla |
| **Onboarding flow** | ⚠ Un solo form gigante con campos opcionales | ✅ Dos forms claros: Employee → DoctorCredentials |
| **Migration cost** | ✅ Solo ALTER TABLE | ⚠ CREATE TABLE + migrate existing doctors |
| **Foreign Keys outbound** | ❌ Otras tablas que referencian "el doctor de la visita" tienen que filtrar empleados → doctores | ✅ FK directa a `doctor_credentials` |
| **Permisos / RLS** | ⚠ Mezcla HR data + clinical credentials en una sola tabla | ✅ Separación natural (HR vs Clinical) |
| **Extensibilidad futura** | ⚠ Cada nuevo campo clínico añade más NULLs | ✅ Solo en la tabla relevante |
| **Conflicto con Provider model** | ⚠ El modelo `Provider` existente es para EXTERNAL referrers (radiology, etc.) — NO interno | ✅ Sin conflicto |

---

## Decisión: **Opción B** (tabla `doctor_credentials`)

### Razones de peso

1. **Schema cleanliness** — el 90% de empleados no son doctores. Inflar `employees` con NPI/DEA/license NULLable es deuda técnica.
2. **Separación de concerns** — HR (Employee) vs Clinical credentials. Distintos audit, distintos permisos, distintos workflows de update (license renewal, NPI cambio, etc.).
3. **Validación natural** — la presencia de un registro = doctor. Sin necesidad de CHECK constraint complejo.
4. **Conflicto evitado con `Provider`** — el modelo `Provider` existente es para REFERRERS externos (radiology, neurology que mandan pacientes A Precision Medical). Confusión semántica si poníamos credentials en `provider` u otra tabla mal nombrada.
5. **HIPAA reporting** — para PI cases, audits regulares preguntan "¿qué doctores tienen license activo?". Tabla dedicada hace esto trivial.

### Costo aceptado

- ⚠ Un JOIN extra cuando se quiere "ver al doctor con sus credentials" — pero esto es aceptable porque ya tenemos `Employee → User → DoctorCredentials` chains. Prisma's `include` lo hace transparente.
- ⚠ Onboarding flow es 2 steps en lugar de 1 — pero es buena UX (no abrumar al usuario con campos irrelevantes para no-doctores).

---

## Schema final implementado

```prisma
model DoctorCredentials {
  id                    String     @id @default(cuid())
  employeeId            String     @unique
  employee              Employee   @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  npiNumber             String?    @unique
  deaNumber             String?    @unique
  medicalLicenseNumber  String?
  medicalLicenseState   String?    // ISO state code (e.g. "UT")
  specialty             Specialty
  signatureUrl          String?    // Digital signature for SOAP notes

  isActive              Boolean    @default(true)

  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt

  @@index([npiNumber])
  @@index([deaNumber])
  @@index([specialty])
  @@map("doctor_credentials")
}
```

Y en `Employee`:
```prisma
model Employee {
  // ... existing fields
  doctorCredentials DoctorCredentials?
  // ... existing relations
}
```

---

## Onboarding workflow (cuando se implemente en Phase 1)

```
1. Super Admin crea Employee con position='DOCTOR'
2. UI detecta position=DOCTOR → muestra form adicional "Credenciales clínicas"
3. Super Admin completa: NPI · DEA · License # + State · Specialty · Signature upload
4. POST /api/doctor-credentials con el employee_id
5. DB enforza unique on npiNumber + deaNumber (no duplicados)
6. Audit log entry: action='CREATE', entity='doctor_credentials', actor_type='HUMAN_USER'
7. Doctor ya puede:
   - Firmar notas SOAP (B.21) usando signatureUrl
   - Aparecer en HCFA con su NPI
   - Prescribir controlled vía DAW EPCS con su DEA
   - Verse en el calendario de su specialty
```

---

## Edge cases considerados

| Caso | Manejo |
|---|---|
| Doctor renueva su license (cambio de número) | UPDATE `doctor_credentials.medicalLicenseNumber`. Audit log captura before/after. Nota: no podemos delete-and-recreate porque rompe FK histórico. |
| Doctor cambia de specialty | UPDATE `specialty`. Audit log. NO afecta visitas ya firmadas (snapshot por visit). |
| Doctor se va de la clínica | `isActive=false` + `Employee.deletedAt` set. Credentials no se borran (audit + futuro). |
| Doctor regresa | `isActive=true` + nueva fecha. Si su NPI cambió, UPDATE. |
| Doctor tiene 2 NPIs (raro pero posible: NPI-1 individual + NPI-2 grupo) | Solo NPI-1 individual en esta tabla. Group NPI vive en `Clinic`. |
| Doctor pierde DEA | UPDATE `deaNumber=null`. Sistema bloquea sus prescriptions DAW automáticamente. |

---

## Decisiones por confirmar con Erick

1. ¿La specialty del doctor en `doctor_credentials.specialty` debe matchear el dropdown del agendamiento (B.10)? **Asumido sí**.
2. ¿Pueden coexistir doctores con specialty='OTHER' o forzamos enum estricto? **Asumido enum estricto** (usar `OTHER` solo como escape hatch raro).
3. ¿El `signatureUrl` apunta a Supabase Storage (private bucket con RLS) o S3 externo? **Asumido Supabase Storage** (consistencia con el rest del sistema).
4. ¿Migration plan para doctores actuales en el sistema legacy? **Pendiente Phase 1** — script de migración a definir cuando tengamos acceso al SQL legacy.

---

## Implicaciones para módulos relacionados

| Mockup / Módulo | Impacto |
|---|---|
| **B.10 Calendar** | Cuando se asigna un slot a un doctor, la query filtra por `doctor_credentials.specialty` |
| **B.17 Doctor "Mi día"** | El sidebar muestra el specialty + NPI + license state del doctor logueado |
| **B.18 Visita en sala** | Al firmar la nota, se snapshot el `npiNumber` + `signatureUrl` en la nota inmutable |
| **B.19 DAW EPCS** | Antes de prescribir controlled, verifica `deaNumber IS NOT NULL` |
| **B.26 HCFA** | Pulls `npiNumber` del doctor que firmó la nota (no del current state) |
| **B.36 Especialidades** | Catálogo central; `doctor_credentials.specialty` referencia este enum |

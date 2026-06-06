# RBAC Matrix — Phoenix (LM v3) Phase 0

**Última actualización**: 2026-06-05
**Estado**: Diseño aprobado. Implementación de RLS policies espera firma de BAA Supabase.

---

## Filosofía

- **RBAC como matriz** de permisos por **(app/workspace) × (rol) × (entidad)**. NO apps separadas por rol.
- **Roles** representan función. **Workspaces** representan contexto operativo. Un usuario puede tener un rol distinto por workspace.
- **RLS (Row-Level Security)** se enforza en Supabase a nivel de tabla — defensa server-side. Las apps son solo la primera línea.
- **Audit log** (con `actor_type`) registra **toda** lectura/escritura sobre entidades PHI. Append-only.

---

## Roles canónicos

| Rol | Descripción | Auth |
|---|---|---|
| **SUPER_ADMIN** | Acceso total a HR + finanzas + admin clínico | Supabase email + MFA |
| **SUPER_ADMIN_CLINICAL** | Variante: admin de templates compartidas, especialidades, catálogos clínicos | MFA |
| **DOCTOR** | Médico tratante. Escribe notas, prescribe (DAW EPCS) | MFA |
| **MA** | Medical Assistant. Triaje (B.16), prep de signos vitales | MFA |
| **EDSON** (Intake) | Pre-visita (verificar law firm + PIP), post-visita seguimiento/cobranzas | MFA |
| **BRUNELLA** (Billing) | HCFA, ledger, settlement, contactos con bufetes | MFA |
| **FRONT_OFFICE** | Recepción: agenda, check-in, llamadas | MFA |
| **PATIENT** | Acceso al portal del paciente con su propia data | Magic link |
| **ATTORNEY** | Acceso al portal del abogado externo (RLS por bufete) | Magic link + MFA |
| **AI_AGENT** | (Phase 3+) Voice AI Receptionist. Permisos mínimos. | Service account |
| **SYSTEM** | Cron/webhooks/scheduled tasks | Service key |

---

## Apps × Roles (acceso al app)

| App / Subdomain | SUPER_ADMIN | DOCTOR | MA | EDSON | BRUNELLA | FRONT_OFFICE | PATIENT | ATTORNEY |
|---|---|---|---|---|---|---|---|---|
| `apps/admin` (admin.lienmaster.net) | ✅ Full | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `apps/timeclock` (pmtc.lienmaster.net) | ✅ View only | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `apps/back-office` (backoffice...) | ✅ Full | ❌ | ❌ | ✅ workspace `/intake` | ✅ workspace `/billing` | ✅ workspace `/front-office` | ❌ | ❌ |
| `apps/clinical` (clinical...) | ✅ View only | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `apps/portal` (portal...) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (own data) | ❌ |
| `apps/attorney` (attorney...) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (own firm) |

---

## Workspaces dentro de `apps/back-office`

`back-office` agrupa varios roles porque comparten el mismo `Case`. Separación por workspace:

| Workspace | Acceso |
|---|---|
| `/front-office` | FRONT_OFFICE + SUPER_ADMIN |
| `/intake` | EDSON + SUPER_ADMIN |
| `/billing` | BRUNELLA + SUPER_ADMIN |
| `/dashboard` | SUPER_ADMIN solamente |

---

## Entidades × Operación × Rol (matriz de permisos)

### Patient

| Operación | SUPER_ADMIN | DOCTOR | MA | EDSON | BRUNELLA | FRONT_OFFICE | PATIENT | ATTORNEY |
|---|---|---|---|---|---|---|---|---|
| READ | ✅ All | ✅ Own visits | ✅ Own triage | ✅ All in pipeline | ✅ All | ✅ All | ✅ Own | ✅ Own firm's |
| CREATE | ✅ | ❌ | ❌ | ✅ (intake) | ❌ | ✅ (call-in) | ❌ | ❌ |
| UPDATE personal | ✅ | ❌ | ❌ | ✅ pre-visit | ❌ | ✅ pre-visit | ✅ Own (portal) | ❌ |
| UPDATE clinical | ❌ | ✅ Own visits | ⚠ Triage only | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ✅ Soft only | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Case (Lien)

| Operación | SUPER_ADMIN | DOCTOR | MA | EDSON | BRUNELLA | FRONT_OFFICE | PATIENT | ATTORNEY |
|---|---|---|---|---|---|---|---|---|
| READ | ✅ All | ✅ Own visits | ❌ | ✅ All | ✅ All | ✅ Limited | ✅ Own | ✅ Own firm's |
| CREATE | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ (intake) | ❌ | ❌ |
| UPDATE status | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| UPDATE billing | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| SIGN lien (attorney) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Own firm's |
| CLOSE | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

### Visit + Note

| Operación | SUPER_ADMIN | DOCTOR | MA | EDSON | BRUNELLA | FRONT_OFFICE | PATIENT | ATTORNEY |
|---|---|---|---|---|---|---|---|---|
| READ note (pre-sign) | ❌ | ✅ Own | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| READ note (signed) | ✅ Read only | ✅ Own + senior | ❌ | ⚠ Summary only | ✅ For HCFA | ❌ | ⚠ Own (anonim.) | ✅ For demand letter |
| WRITE note (pre-sign) | ❌ | ✅ Own | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| SIGN note | ❌ | ✅ Own | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| WRITE vital signs | ❌ | ✅ | ✅ Triage | ❌ | ❌ | ❌ | ❌ | ❌ |
| EDIT post-sign | ❌ | ⚠ Addendum only | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Template

| Operación | SUPER_ADMIN_CLINICAL | DOCTOR | Otros |
|---|---|---|---|
| CREATE PERSONAL | ✅ | ✅ Own | ❌ |
| CREATE SHARED | ✅ | ❌ | ❌ |
| CREATE SPECIALTY | ✅ | ❌ | ❌ |
| EDIT PERSONAL | ✅ | ✅ Own | ❌ |
| EDIT SHARED | ✅ | ❌ | ❌ |
| EDIT SPECIALTY | ✅ | ❌ | ❌ |
| PROMOTE personal→shared | ✅ Approves | ⚠ Request | ❌ |
| DELETE | ✅ Soft | ✅ Own | ❌ |
| READ + USE | ✅ All | ✅ Personal + Shared + Own Specialty | ❌ |

### Diagnosis

| Operación | SUPER_ADMIN_CLINICAL | DOCTOR | Otros |
|---|---|---|---|
| CREATE | ✅ | ❌ | ❌ |
| EDIT | ✅ | ❌ | ❌ |
| FAVORITE (own) | N/A | ✅ Own | ❌ |
| READ + USE | ✅ All | ✅ All active | ⚠ For their reports |

### Billing / Financial

| Operación | SUPER_ADMIN | BRUNELLA | Otros |
|---|---|---|---|
| READ HCFA / ledger / settlement | ✅ All | ✅ All | ❌ (excepto Edson summary) |
| WRITE HCFA | ❌ | ✅ | ❌ |
| WRITE settlement | ❌ | ✅ | ❌ |
| WRITE payroll | ✅ | ❌ | ❌ |

### Audit Log

| Operación | SUPER_ADMIN | Otros |
|---|---|---|
| READ own actions | N/A — all roles ven sus propias acciones | ✅ |
| READ all | ✅ | ❌ |
| WRITE | Automatic — never manual | Automatic |
| UPDATE / DELETE | ❌ Imposible (DB trigger lo previene) | ❌ |

---

## RLS Policies (resumen — implementadas en Phase 1 cuando exista PHI)

### Patient
```sql
-- Patient ve solo su propia data
CREATE POLICY patient_own_data ON patients
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Doctor ve pacientes de sus visitas
CREATE POLICY doctor_assigned_patients ON patients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.patient_id = patients.id
        AND v.doctor_id IN (SELECT id FROM doctor_credentials WHERE user_id = auth.uid())
    )
  );

-- Brunella + Edson + Front Office + Super Admin ven todos
CREATE POLICY staff_all_patients ON patients
  FOR SELECT TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('SUPER_ADMIN', 'EDSON', 'BRUNELLA', 'FRONT_OFFICE')
  );
```

### Attorney (RLS por bufete)
```sql
-- Attorney ve solo casos del bufete al que pertenece
CREATE POLICY attorney_own_firm_cases ON cases
  FOR SELECT TO authenticated
  USING (
    lawyer_firm_id IN (
      SELECT firm_id FROM attorney_user_firms WHERE user_id = auth.uid()
    )
  );
```

### Lobby Display (B.37 — público anonymized)
```sql
-- Vista pública anonimizada — NUNCA expone PII
CREATE VIEW lobby_display_v AS
SELECT
  CONCAT(SUBSTRING(first_name, 1, 1), '.', SUBSTRING(last_name, 1, 1)) AS initials,
  RIGHT(mva_case_number, 2) AS last_two_mva_digits,
  status,
  clinic_id,
  expected_seen_at
FROM visits
WHERE status IN ('WAITING', 'IN_TRIAGE', 'IN_ROOM', 'IN_CONSULTATION', 'DONE_TODAY')
  AND clinic_id = current_setting('app.clinic_id')::uuid;

-- RLS: solo permite consultar la vista, no las tablas base.
GRANT SELECT ON lobby_display_v TO anon;
REVOKE SELECT ON visits FROM anon;
```

---

## AI Receptionist (Phase 3+) — Permisos mínimos

Cuando se active el AI Receptionist (per B.38), su service account tendrá:

| Operación | Permitido |
|---|---|
| `POST /api/cases/create-from-call` (esqueleto de caso) | ✅ Solo CREATE, no UPDATE |
| `GET /api/appointments/available-slots` | ✅ Read-only |
| `POST /api/sms/send-portal-link` | ✅ Solo CREATE log entry |
| Modificar pacientes existentes | ❌ |
| Ver historial clínico | ❌ |
| Acceder a billing | ❌ |
| Cualquier acción crea audit_log con `actor_type=AI_AGENT` | ✅ Obligatorio |

Rate limiting: **30 req/min** (vs 100 req/min para humanos).

---

## Implementación en Phase 0 (hoy)

- ✅ Schema Prisma con `actor_type` enum + campo en `audit_logs`
- ✅ Schema Prisma con `DoctorCredentials`, `Template`, `Diagnosis` (no PHI)
- ✅ Este documento (matriz documentada)
- ⏳ RLS policies en Supabase → **Phase 1 cuando BAA Supabase firme**
- ⏳ Service account para AI Receptionist → **Phase 3 cuando se active**

---

## Cómo se valida este RBAC

1. **Tests unitarios** en `apps/back-office/__tests__/rbac/*.test.ts` por cada matriz de entidad
2. **Tests E2E** con usuarios de prueba de cada rol (intentando acceder a entidades fuera de scope)
3. **Pentesting manual** antes de cada deploy a producción
4. **Audit log review** mensual: ¿hubo accesos anómalos? (más de N entidades vistas en 1 hora por mismo usuario, etc.)

# Phase 0 — Definition of Done · Checklist

**Cerrado**: 2026-06-05
**Tag git**: `phase-0-complete`
**Aprobación gerencia**: 2026-06-05
**Autorización Erick para arrancar código**: "arranca con fe" — 2026-06-05

---

## ✅ Entregables completados

### 1. Spec aprobada por stakeholders ✅
- ✅ 41 mockups documentados en `docs/propuesta-clinica/mockups-flujo-completo.html`
- ✅ Phase 0 kickoff document: `docs/propuesta-clinica/phase-0-kickoff.md`
- ✅ Análisis comparativo legacy vs v2: `docs/propuesta-clinica/analisis-comparativo-lm-vs-nuevo.html`
- ✅ **Aprobación gerencia 2026-06-05** (gate stakeholders CERRADO)

### 2. Decisiones técnicas locked ✅
- ✅ Naming: **LienMaster v3** público + **Phoenix** codename interno
- ✅ Hosting: **Vercel Enterprise** (no Cloudflare Pages)
- ✅ SMS/Voice: **Weave** (no Twilio — la clínica ya lo usa, HIPAA-compliant)
- ✅ Email: **Resend** (transactional)
- ✅ Observability: **Sentry** + scrubbing PHI · primer BAA a perseguir
- ✅ DB: **Supabase Postgres** + RLS + Prisma client
- ✅ Estrategia: **LOCAL-FIRST** (no deploy hasta BAAs)
- ✅ AI Receptionist: **Phase 3+** (Claude señala cuándo)
- ✅ Folder naming: **Opción A flat** (`apps/clinical` no `apps/phoenix-clinical`)
- ✅ Doctor credentials: **Tabla separada** (`doctor_credentials`) no inflar `employees`

### 3. Monorepo scaffolding ✅
- ✅ `apps/back-office` (Next.js 15 + App Router + i18n + UI + Sentry)
- ✅ `apps/clinical` (idem + iPad-optimized viewport)
- ✅ `apps/portal` (idem + mobile-first + default ES)
- ✅ `apps/attorney` (idem + default EN, audience English-first)
- ✅ `pnpm install` limpio
- ✅ `pnpm build` pasa en las 4 apps
- ✅ Cada app expone su placeholder en su puerto asignado (3002-3005)

### 4. Packages compartidos wireados ✅
- ✅ `@precision/ui` — Button rendea correcto en las 4 apps
- ✅ `@precision-medical/i18n` — next-intl + diccionarios es/en
- ✅ `@precision-medical/observability` — Sentry config + scrubbing PHI
- ✅ `@precision-medical/database` — Prisma client + audit helpers
- ✅ `@precision-medical/tailwind-config` — design tokens preset
- ✅ `@precision-medical/tsconfig` — base/nextjs/react-library

### 5. Schema Prisma (no-PHI) ✅
- ✅ `ActorType` enum (`HUMAN_USER` | `AI_AGENT` | `SYSTEM`)
- ✅ `AuditLog` extendido con `actorType` + `idempotencyKey`
- ✅ `DoctorCredentials` model (1:1 con Employee)
- ✅ `Template` + `TemplateSection` + `TemplateFavorite` (B.17.5-B.18)
- ✅ `Diagnosis` + `DiagnosisMapping` + `UserDiagnosisFavorite` (B.35 dual ICD-10+SNOMED)
- ✅ Relations inversas agregadas a `User` y `Employee`
- ✅ `prisma generate` exitoso (v5.22.0)
- ✅ `apps/web type-check` pasa (schema changes no rompen admin)

### 6. Audit log infrastructure ✅
- ✅ `writeAuditLog()` helper en `packages/database/src/audit.ts`
- ✅ `actorFromHeaders()` helper para extraer contexto del Request
- ✅ Convention de headers documentada (x-actor-type, x-actor-user-id, x-idempotency-key)
- ✅ Export sub-path `./audit` configurado en package.json
- ✅ Schema soporta append-only (no `updatedAt`, DB trigger documentado para Phase 1)

### 7. AI Receptionist hook (3 APIs preparadas) ✅
- ✅ `POST /api/cases/create-from-call` — Zod strict + audit + idempotency
- ✅ `GET /api/appointments/available-slots` — Zod params + mock slots + audit
- ✅ `POST /api/sms/send-portal-link` — Zod strict + fake magic link + audit + phone redaction
- ✅ Cada endpoint compila a `.next/server/app/api/.../route.js`
- ✅ Cada endpoint escribe audit log con `actor_type`
- ✅ Idempotency funciona (re-llamada con misma key devuelve cached)

### 8. Sentry observability ✅
- ✅ `packages/observability` con `buildClientOptions`, `buildServerOptions`, `buildEdgeOptions`
- ✅ Scrubbing PHI configurado (`beforeSend`, `beforeBreadcrumb`, `sendDefaultPii: false`)
- ✅ Activado en zone ZERO-PHI (`apps/web`, `apps/timeclock`)
- ✅ Configurado en zone PHI (`apps/back-office`, `clinical`, `portal`, `attorney`) — inerte sin DSN hasta firmar BAA Sentry
- ✅ Source maps habilitados para upload (cuando haya SENTRY_AUTH_TOKEN en CI)

### 9. CI/CD pipeline ✅
- ✅ `.github/workflows/ci.yml` con: install + prisma generate + lint + typecheck + build
- ✅ Trigger: push a main + PRs a main
- ✅ Concurrency: cancel-in-progress en mismo branch
- ✅ Node 20 + pnpm 10.33.2 matrix
- ✅ Sin step de deploy (espera BAAs)
- ✅ Sentry env vars vacías en CI (Sentry inerte para builds)

### 10. RBAC matrix documentada ✅
- ✅ `docs/phase-0/rbac-matrix.md` — 11 roles canónicos
- ✅ Matriz Apps × Roles
- ✅ Workspaces dentro de back-office
- ✅ Matriz Entity × Operation × Role para 7 entidades (Patient, Case, Visit/Note, Template, Diagnosis, Billing, Audit Log)
- ✅ RLS policies preparadas en SQL (para aplicar en Phase 1 post-BAA)
- ✅ AI Receptionist permisos mínimos documentados
- ✅ Plan de validación: unit tests, E2E, pentesting, audit review

### 11. Doctor fields decision ✅
- ✅ `docs/phase-0/doctor-fields.md` — análisis de 11 criterios
- ✅ Opción B (tabla `DoctorCredentials` separada) elegida
- ✅ Schema implementado
- ✅ Onboarding workflow propuesto
- ✅ 6 edge cases documentados

### 12. Seed data non-PHI ✅
- ✅ 11 diagnoses dual ICD-10+SNOMED (capturados del legacy)
- ✅ 1 template completo "NG-MVA F/U" con 7 secciones (CC, HPI, ROS, PE, Eval con 3 variants tiered, Plan con 3 variants + procedural + prices, Dx)
- ✅ `db:seed` corre sin errores (skip de template si no hay users yet)

### 13. Documentación ✅
- ✅ `README.md` con setup local (<30 min para dev nuevo)
- ✅ `docs/propuesta-clinica/phase-0-kickoff.md` actualizado
- ✅ `docs/phase-0/rbac-matrix.md`
- ✅ `docs/phase-0/doctor-fields.md`
- ✅ `docs/phase-0/done-checklist.md` (este archivo)

### 14. apps/admin TODOs ⏳ (no bloqueante para Phase 0)
- ⏳ Color picker en CRUD de Clínicas — **NO incluido en Phase 0** (decisión Erick: dejarlo para Phase 1 cuando se trabaje el módulo de clínicas para `apps/clinical`)
- ⏳ Pre-cargar 6 colores actuales (West Valley red, Provo light blue, etc.) — pendiente

---

## ❌ Lo que NO se hizo en Phase 0 (explícito, por diseño)

| Item | Razón |
|---|---|
| Pacientes, casos, visitas, notas (tablas PHI) | Esperan Phase 1 |
| B.1-B.29 mockups del flujo implementados | Phase 1 / Phase 2 |
| B.17.5-B.18 implementation | Phase 1 |
| Deploy a Vercel | Espera BAAs (Sentry primero) |
| Integración Weave (SMS real) | Espera BAA Weave |
| Integración Resend (email real) | Espera BAA Resend |
| AI Receptionist real (conversación) | Phase 3+ |
| Migración de data del LM legacy | Phase 2 |
| HCFA generation (B.26) | Phase 2 (Brunella billing) |
| DAW EPCS integration (B.19) | Phase 2 (controlled substances) |
| RLS policies aplicadas en Supabase | Phase 1 post-BAA Supabase |
| DB trigger para audit_log append-only | Phase 1 post-BAA Supabase |
| Tests unitarios + E2E | Phase 1 (mientras se construye lógica real) |

---

## ⏳ Gates pendientes (no son responsabilidad de Phase 0)

Estos bloquean **deploy a producción** + **Phase 1 con PHI**, pero NO impiden el cierre de Phase 0:

| Gate | Responsable | Bloquea |
|---|---|---|
| BAA Sentry firmado | Erick + Sentry | Primer deploy + Sentry con datos reales |
| BAA Supabase firmado | Erick + Supabase | Datos PHI reales + RLS policies + DB triggers |
| BAA Vercel firmado | Erick + Vercel | Deploy a producción |
| BAA Weave firmado | Erick + Weave | SMS/voice integration |
| BAA Resend firmado | Erick + Resend | Email transaccional con PHI |
| Consultor HIPAA contratado | Erick | Validación técnica del baseline |

---

## 🎯 Métricas de éxito alcanzadas

- ✅ **Velocidad de iteración**: cambio de código → resultado local en <3s (Next.js hot reload)
- ✅ **Cero warnings TS críticos** en build
- ✅ **`apps/web` type-check pasa** después de schema changes (no rompe admin existente)
- ✅ **CI ready** en <5 min en PRs (estimado, sin run real todavía)
- ✅ **Setup local de dev nuevo** documentado en README, target <30 min
- ✅ **5 commits limpios** atribuibles a Phase 0 (4 días de scaffolding + commit final de cierre)
- ✅ **Cero PHI tocado** durante todo Phase 0

---

## 📊 Resumen ejecutivo

**Phase 0 de Phoenix (LM v3) está CERRADO.**

Tenemos:
- 4 apps nuevas scaffolded, buildables, levantables en local con UI funcional
- Schema Prisma extendido con audit + templates + diagnoses + doctor credentials (cero PHI)
- 3 API stubs del AI Receptionist hook que ya validan input, escriben audit log con `actor_type`, soportan idempotency
- CI workflow GitHub Actions
- Sentry observability configurado por zona (ZERO-PHI activado, PHI inerte hasta BAA)
- RBAC matrix completa documentada
- Decisión arquitectónica de Doctor credentials tomada y documentada
- Seeds de catálogos no-PHI listos (11 diagnoses + 1 template completo)
- README para onboarding rápido

Lo que **NO** tocamos (correctamente):
- Cero PHI en código
- Cero deploys a producción
- Cero integraciones externas con datos reales (Weave, Resend)

**Phase 1 puede arrancar tan pronto como:**
1. BAA Sentry + Supabase mínimo firmen → primer deploy posible
2. Erick autorice explícitamente arranque de Phase 1 (módulos clínicos B.1-B.29)

---

## 🔥 Tag

```bash
git tag -a phase-0-complete -m "Phase 0 cerrado · 41 mockups aprobados · 4 apps scaffolded · audit + templates + diagnoses schema · 3 API stubs · CI workflow · RBAC documentada"
git push origin phase-0-complete
```

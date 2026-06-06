# Precision Medical — Monorepo

Turborepo + pnpm workspace que aloja todos los apps + packages compartidos de Precision Medical (PI clinic en Utah, EEUU).

## Apps

| App | URL prod | Estado | Para qué |
|---|---|---|---|
| `apps/web` | admin.lienmaster.net | 🟢 LIVE | Super Admin HR + Finanzas + Reportes |
| `apps/timeclock` | pmtc.lienmaster.net | 🟢 LIVE | Marcaje de empleados con GPS |
| `apps/back-office` | backoffice.lienmaster.net | 🚧 Phase 0 scaffold | Front Office + Edson + Brunella + Super Admin clínico |
| `apps/clinical` | clinical.lienmaster.net | 🚧 Phase 0 scaffold | Doctores + MAs (iPad-optimized) |
| `apps/portal` | portal.lienmaster.net | 🚧 Phase 0 scaffold | Portal del paciente (magic link) |
| `apps/attorney` | attorney.lienmaster.net | 🚧 Phase 0 scaffold | Portal de abogados externos |

**Las 4 nuevas (`back-office`, `clinical`, `portal`, `attorney`)** son parte de **Phoenix** (codename interno) / **LienMaster v3** (nombre público). Spec canónica viva en `docs/propuesta-clinica/` con 41 mockups aprobados por gerencia el 2026-06-05.

## Packages

```
packages/
├── api/                   tRPC server + Resend + Zod
├── auth/                  Supabase Auth wrappers (server/client/admin/middleware)
├── database/              Prisma client + audit log helpers
├── eslint-config/         Shared ESLint
├── i18n/                  next-intl + diccionarios es/en
├── observability/         Sentry config + scrubbing PHI
├── tailwind-config/       Tailwind preset (design tokens)
├── tsconfig/              base/nextjs/react-library
└── ui/                    shadcn/ui components (Button, Card, Dialog, Table, etc.)
```

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | `>=20` | Next.js 15 requirement |
| **pnpm** | `10.33.2` | Lockfile compatibility (package.json declares this) |
| **PostgreSQL** | 15+ (or Supabase) | Database. Local Docker o cloud Supabase. |
| **Git** | recent | Obvio |

Recomendado: instalar pnpm via corepack
```bash
corepack enable
corepack prepare pnpm@10.33.2 --activate
```

---

## Setup local (dev nuevo, ≤30 min)

### 1. Clone + install

```bash
git clone https://github.com/softwdes/precisionmedical.git
cd precisionmedical
pnpm install
```

### 2. Env vars

Copiar `.env.example` → `.env`:

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales locales (Supabase project URL, anon key, etc.). Mientras no tengas Supabase, los apps Phoenix (`back-office`, `clinical`, `portal`, `attorney`) levantan en local sin DB (las APIs stub solo necesitan DATABASE_URL para audit log writes — sin DB tira error 500 al hacer POST a /api/cases/... pero el resto de la app funciona).

**Sentry vars**: déjalas vacías en Phase 0 — Sentry queda inerte sin DSN. Se activan cuando firme BAA Sentry.

### 3. Database (Prisma)

```bash
# Generar Prisma client (siempre, después de cualquier cambio de schema):
pnpm --filter @precision-medical/database db:generate

# Aplicar migrations a tu DB local:
pnpm --filter @precision-medical/database db:push

# Sembrar data inicial (countries, departments, clinics, diagnoses, template MVA F/U):
pnpm --filter @precision-medical/database db:seed

# Prisma Studio (UI de DB):
pnpm --filter @precision-medical/database db:studio
```

### 4. Dev — levantar las apps

Todas en paralelo (Turborepo):
```bash
pnpm dev
```

O una sola app:
```bash
pnpm dev:web        # admin existente en :3000
pnpm dev:timeclock  # timeclock existente en :3001

# Phoenix apps (Phase 0 scaffolded):
pnpm --filter @precision-medical/back-office dev   # :3002
pnpm --filter @precision-medical/clinical dev      # :3003
pnpm --filter @precision-medical/portal dev        # :3004
pnpm --filter @precision-medical/attorney dev      # :3005
```

### 5. Verificar que todo funciona

| URL | Esperado |
|---|---|
| `http://localhost:3000` | Admin (apps/web) — login screen |
| `http://localhost:3001` | Timeclock — login screen |
| `http://localhost:3002` | Phoenix Back Office — placeholder Phase 0 + Button UI |
| `http://localhost:3003` | Phoenix Clinical — placeholder + Button UI |
| `http://localhost:3004` | Phoenix Portal — placeholder + Button UI |
| `http://localhost:3005` | Phoenix Attorney Portal — placeholder + Button UI |

### 6. Probar las 3 API stubs del AI Receptionist hook

```bash
# 1. Crear caso desde llamada (stub Phase 0)
curl -X POST http://localhost:3002/api/cases/create-from-call \
  -H "x-actor-type: HUMAN_USER" \
  -H "x-actor-user-id: <your-user-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "patient": {"firstName":"John","lastName":"Doe","phone":"+18015550123"},
    "accident": {"type":"MVA"},
    "lawFirmName": "Smith & Johnson LLP"
  }'

# 2. Slots disponibles (stub)
curl 'http://localhost:3002/api/appointments/available-slots?clinicId=clinic_provo&limit=5' \
  -H "x-actor-type: HUMAN_USER"

# 3. Enviar portal link por SMS (stub — no envía SMS real, Weave BAA pendiente)
curl -X POST http://localhost:3002/api/sms/send-portal-link \
  -H "x-actor-type: HUMAN_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "caseId": "case_test_001",
    "patientPhone": "+18015550123"
  }'
```

Cada llamada **escribe al audit log** con el `actorType` apropiado.

---

## Comandos útiles

```bash
# Build all
pnpm build

# Build una app
pnpm --filter @precision-medical/back-office build

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

---

## Project Structure

```
precisionmedical/
├── apps/
│   ├── web/             # Admin existente
│   ├── timeclock/       # Timeclock existente
│   ├── back-office/     # Phoenix · Phase 0 scaffold
│   ├── clinical/        # Phoenix · Phase 0 scaffold
│   ├── portal/          # Phoenix · Phase 0 scaffold
│   └── attorney/        # Phoenix · Phase 0 scaffold
├── packages/
│   ├── api/
│   ├── auth/
│   ├── database/
│   ├── eslint-config/
│   ├── i18n/
│   ├── observability/
│   ├── tailwind-config/
│   ├── tsconfig/
│   └── ui/
├── docs/
│   ├── propuesta-clinica/    # Spec canónica: 41 mockups + Phase 0 kickoff
│   ├── phase-0/              # rbac-matrix.md, doctor-fields.md, done-checklist.md
│   └── ...
├── .github/workflows/ci.yml  # CI: lint + typecheck + build (sin deploy todavía)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Phoenix (LM v3) — Phase 0 status

**APROBADA por gerencia 2026-06-05**. Erick dio luz verde para arrancar código no-PHI.

Spec canónica: `docs/propuesta-clinica/mockups-flujo-completo.html` (41 mockups).
Decisiones técnicas: `docs/propuesta-clinica/phase-0-kickoff.md`.
Checklist Phase 0 Done: `docs/phase-0/done-checklist.md`.

### Estrategia LOCAL-FIRST
- ✅ Todo el desarrollo Phase 0 en **local** sin deploy
- ✅ Cero PHI real en development
- ⏳ Primer deploy a producción → cuando firme BAA Sentry (primero) + Vercel + Supabase
- ⏳ Integración Weave (SMS) → cuando firme BAA Weave
- ⏳ Integración Resend (email) → cuando firme BAA Resend

### Naming
- **Público / contratos / dominio / bufetes**: **LienMaster v3** (en `lienmaster.net`)
- **Codename interno**: **Phoenix** 🔥 (commits, Slack `#phoenix-dev`, Sentry projects)

---

## Reglas no negociables

- 🔒 **Diseño LOCKED** — no rediseñar lo aprobado en `docs/propuesta-clinica/`
- 🌐 **Bilingüe** — es/en siempre (default `es` excepto attorney portal que default a `en`)
- 📱 **Mobile-first** — todas las apps deben funcionar en mobile (portal/attorney especialmente)
- 💰 **Financieros append-only** — nunca UPDATE/DELETE en transacciones
- 🚦 **Phase-gated** — NO escribir código fuera de la fase autorizada
- 🩺 **apps/admin INTOCABLE** salvo el color picker pendiente
- 📊 **Audit log con `actor_type`** obligatorio en toda mutation

---

## Soporte

Preguntas técnicas → Erick Salinas <erick@precisionmedicalcare.com>.

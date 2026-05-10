# Architecture · LM Super Admin

> Technical architecture decisions and rationale.

---

## 1. Top-level structure: Turborepo monorepo

We use **Turborepo + pnpm** to manage all apps and shared packages in a single repository.

### Why Turborepo?
- **Incremental builds:** Only rebuild what changed
- **Cached outputs:** Shared cache across team and CI
- **Atomic deployments:** Deploy multiple apps consistently
- **Code sharing:** Easy to share UI, types, and logic
- **Future-proof:** Each app can be extracted later if needed

### Directory layout

```
precision-medical/
├── apps/
│   ├── web/                      # Main admin dashboard (Next.js 15)
│   ├── portal-lawyers/           # Lawyer portal (Next.js 15)
│   ├── portal-providers/         # Provider portal (Next.js 15)
│   └── portal-employees/         # Employee self-service (Phase 2)
├── packages/
│   ├── ui/                       # Design system + shadcn/ui wrappers
│   ├── database/                 # Prisma schema + client
│   ├── auth/                     # Supabase Auth utilities
│   ├── ai-agents/                # AI agents framework (CIFO + Audit)
│   ├── currency/                 # Multi-currency / FX engine
│   ├── metrics/                  # Performance metrics engine
│   ├── notifications/            # Resend wrapper + templates
│   ├── i18n/                     # Translations + next-intl setup
│   ├── api/                      # tRPC routers shared across apps
│   ├── eslint-config/            # Shared ESLint
│   ├── tsconfig/                 # Shared TS configs
│   └── tailwind-config/          # Shared Tailwind preset
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 2. Layered architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend Layer                        │
│  Web Admin · Portal Lawyers · Portal Providers          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              API Gateway · Auth Layer                   │
│  tRPC routers · Supabase Auth · Rate limiting           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                Business Services                        │
│  Employees · Payroll · Metrics · Cash · Referrals       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  AI Agent Layer                         │
│  CIFO · Audit Agent · Future agents                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Data Layer                           │
│  Supabase PG · Storage · External attendance DB         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Frontend stack

### Next.js 15 (App Router)
- Server Components by default
- Server Actions for mutations
- Streaming for slow data
- Route groups for module organization

### React 19
- `use()` hook for promises
- Concurrent rendering
- Suspense boundaries everywhere

### TypeScript (strict)
- `strict: true` in `tsconfig.json`
- No `any` allowed
- Explicit return types on all functions
- `unknown` instead of `any` when type is genuinely unknown

### Tailwind CSS + shadcn/ui
- Design tokens defined in `packages/tailwind-config`
- shadcn/ui components copied into `packages/ui`
- Custom components built on top
- No other UI library

### State management
- **Server state:** tRPC + React Query (built-in)
- **Local UI state:** React `useState`
- **Cross-component state:** React Context (sparingly)
- **Forms:** `react-hook-form` + `zod` validation
- **No Redux, no Zustand** unless absolutely necessary

---

## 4. API layer: tRPC

### Why tRPC?
- End-to-end type safety (server types flow to client automatically)
- No code generation step
- Excellent DX
- Built-in React Query integration

### Router organization

```typescript
// packages/api/src/root.ts
export const appRouter = router({
  users: usersRouter,
  employees: employeesRouter,
  payroll: payrollRouter,
  metrics: metricsRouter,
  cash: cashRouter,
  lawyers: lawyersRouter,
  providers: providersRouter,
  referrals: referralsRouter,
  commissions: commissionsRouter,
  ai: aiRouter,
  audit: auditRouter,
});
```

Each router lives in `packages/api/src/routers/` and exports its own procedures.

### Authentication middleware

```typescript
// All procedures pass through auth middleware
const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!hasRole(ctx.user, ['admin', 'super_admin'])) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});
```

---

## 5. Database: Supabase (PostgreSQL)

### Why Supabase?
- Managed PostgreSQL (no DevOps overhead)
- Built-in auth that integrates with Prisma
- Storage for files (replaces S3 in Phase 1)
- Real-time subscriptions for live updates
- Row-level security (RLS) for fine-grained access control

### Prisma as ORM
- Schema-first development
- Migrations versioned in Git
- Type-safe client
- Automatic TypeScript types

### Connection strategy
- **Web apps:** Connect to Supabase via the JS client for auth/realtime
- **Server-side queries:** Connect via Prisma using the connection string
- **RLS:** Enabled on all tables; policies defined per role

### Key tables (see `DATA_MODEL.md` for full schema)

| Table | Purpose |
|-------|---------|
| `users` | Central user table (auth) |
| `employees` | Employee records |
| `wallets` | Multi-currency virtual wallets |
| `fx_operations` | FX trades between wallets |
| `payments` | Payments to employees |
| `tasks` | Tasks assigned to employees |
| `attendance_sync` | Snapshots of external DB |
| `metric_snapshots` | Daily computed KPIs |
| `cash_boxes` | Petty cash by clinic |
| `cash_transactions` | Cash movements |
| `lawyers` | Lawyer entities |
| `providers` | Provider entities |
| `patients` | Patient records |
| `appointments` | Appointments |
| `commissions` | Commission earnings |
| `agents` | AI agent configurations |
| `agent_actions` | Actions taken by agents |
| `audit_log` | Immutable activity log |

---

## 6. Authentication

### Supabase Auth as foundation
- Email + password login
- Social providers ready (Google, etc.)
- MFA via TOTP
- Session management

### Role-based access control (RBAC)
- Roles defined in `users.role` column
- Permissions evaluated server-side via tRPC middleware
- Frontend hides UI based on role (defense in depth)

### Modular login URLs
| URL | Purpose |
|-----|---------|
| `/admin` | Super admins, admins |
| `/lawyers` | Lawyers only |
| `/providers` | Providers only |
| `/employees` | Employees self-service (Phase 2) |

All authenticate against the same Supabase project. The URL determines which app is loaded.

---

## 7. Background jobs

### Why we need them
- Nightly metric calculation
- Daily attendance sync
- Email batching
- Audit Agent scheduled runs
- FX rate updates

### Solution: Supabase Edge Functions + cron
- Define jobs as serverless functions
- Schedule via Supabase cron (postgres pg_cron)
- For longer/complex jobs: dedicated worker (Vercel Cron or self-hosted)

### Future: BullMQ + Redis
- If queue complexity grows, migrate to BullMQ on Redis
- Not needed for Phase 0-2

---

## 8. AI Agents architecture

### Framework choice: Vercel AI SDK + custom orchestrator
- `ai` package (Vercel AI SDK) for LLM calls and streaming
- Custom orchestrator for multi-step agent workflows
- LangGraph for complex agent flows (Phase 4+)

### Multi-provider support
- Primary: **Anthropic Claude** (best for reasoning)
- Fallback: **OpenAI GPT-4** (for specific tasks)
- Provider abstraction in `packages/ai-agents/src/providers/`

### Agent execution
- Run as background jobs (not in HTTP request lifecycle)
- Persist all actions in `agent_actions` table
- Cost tracking per token consumed
- Budget limits enforced at the agent level

See `docs/AI_AGENTS.md` for full details.

---

## 9. File storage

### Phase 1: Supabase Storage
- Receipts, contracts, IDs, medical documents
- Buckets per category (`receipts`, `contracts`, `medical-docs`, `avatars`)
- Signed URLs with expiration
- RLS policies on buckets

### Phase 2+: Optional migration to AWS S3
- Only if scale demands it
- Cloudflare R2 as cheaper alternative

---

## 10. Email: Resend

### Why Resend?
- Excellent DX
- React Email templates
- Transactional + marketing in one platform
- Generous free tier

### Templates location
- `packages/notifications/src/templates/`
- Built with `@react-email/components`
- Bilingual (ES/EN)

### Triggered emails
- User invitation
- Password reset
- New referral notification (lawyer/provider)
- Commission earned
- Commission paid
- Weekly performance summary (employees)
- Payment confirmation
- Audit Agent reports (admin)

---

## 11. Internationalization

### Library: next-intl
- Server and client components support
- Type-safe translation keys
- Pluralization
- Date/time/number formatting per locale

### Translation files
```
packages/i18n/messages/
├── en.json
└── es.json
```

### Module-level namespaces
```json
{
  "common": { ... },
  "dashboard": { ... },
  "employees": { ... },
  "finance": { ... },
  ...
}
```

### Detection priority
1. User preference (saved in DB)
2. Browser language
3. Default: Spanish (`es`)

---

## 12. Theming

### Implementation
- CSS custom properties on `:root` and `[data-theme="light"]`
- Tailwind's `dark:` variant via `class` strategy
- Toggle persists to localStorage and DB

### Color tokens (locked, do not change)
```css
:root, [data-theme="dark"] {
  --bg-0: #0A0E1A;
  --bg-1: #0F1524;
  --surface: #161D31;
  --text-1: #F5F7FB;
  --brand: #6366F1;
  --cyan: #06B6D4;
  --emerald: #10B981;
  /* ... see design/design-tokens.css */
}

[data-theme="light"] {
  --bg-0: #F8FAFC;
  --bg-1: #FFFFFF;
  --surface: #FFFFFF;
  --text-1: #0F172A;
  /* same accents */
}
```

---

## 13. Hosting & deployment

### Vercel for Next.js apps
- Each app deploys independently
- Preview deployments per PR
- Production via `main` branch
- Environment variables managed in Vercel dashboard

### Supabase for backend
- Managed PostgreSQL
- Storage
- Edge Functions for jobs

### GitHub for source control
- Conventional Commits
- PR templates
- Required reviews on `main`
- Automated checks (typecheck, lint, test)

### Environments
- **Development:** Local + Supabase local OR dev project
- **Staging:** `staging.precisionmedical.com` + Supabase staging project
- **Production:** `app.precisionmedical.com` + Supabase production project

---

## 14. External integrations

| Integration | Purpose | Phase |
|-------------|---------|-------|
| **External attendance DB** | Sync employee attendance | Phase 2 |
| **Resend** | Transactional email | Phase 0 |
| **Anthropic API** | LLM for CIFO + agents | Phase 4 |
| **OpenAI API** | LLM fallback | Phase 4 |
| **ElevenLabs API** | Premium voice (optional) | Phase 4 |
| **Web Speech API** | Browser-native voice | Phase 4 |
| **exchangerate-api.com** | FX reference rates | Phase 2 |
| **Sentry** | Error tracking | Phase 0 |
| **PostHog** | Product analytics | Phase 0 |
| **Twilio** | SMS (future) | Phase 5+ |

---

## 15. Observability

### Sentry (error tracking)
- All apps configured with Sentry SDK
- User context attached to errors
- Source maps uploaded on build
- Slack alerts for critical errors

### PostHog (product analytics)
- Track key events (login, module visit, feature use)
- Funnels for critical flows (referral creation, payment)
- A/B testing support (future)

### Logging
- Structured logging via `pino`
- Logs flow to Vercel logs in production
- Sensitive data redacted (PII, payment info, tokens)

---

## 16. CI/CD

### GitHub Actions

**On every PR:**
- TypeScript check (`tsc --noEmit`)
- ESLint
- Prettier check
- Unit tests (`vitest`)
- Build verification

**On merge to `main`:**
- Auto-deploy to staging via Vercel
- Run E2E tests (Playwright)
- Manual promote to production

**Nightly:**
- Dependency updates check (Dependabot)
- Security audit

---

## 17. Security considerations

See `docs/SECURITY.md` for full details. Highlights:

- HIPAA-aware (US clinic with patient data)
- All sensitive fields encrypted at rest
- TLS 1.3 in transit
- MFA required for sensitive roles
- Anti-kickback compliance documented (lawyer commissions)
- Immutable audit log
- Rate limiting on API
- CSRF protection on Server Actions
- Content Security Policy headers

---

## 18. Performance budgets

| Metric | Target |
|--------|--------|
| LCP (Largest Contentful Paint) | < 2.0s |
| FCP (First Contentful Paint) | < 1.5s |
| TTI (Time to Interactive) | < 3.0s |
| CLS (Cumulative Layout Shift) | < 0.1 |
| API p95 response time | < 500ms |
| DB query p95 | < 100ms |
| Bundle size (initial) | < 200KB gzipped |

---

## 19. Decision log

| Decision | Rationale |
|----------|-----------|
| Turborepo over Nx | Simpler, lighter, sufficient for our needs |
| pnpm over npm/yarn | Faster, disk-efficient, better monorepo support |
| Supabase over self-hosted PG | Speed of development, includes auth + storage |
| tRPC over REST/GraphQL | Type safety wins for tightly coupled monorepo |
| shadcn/ui over MUI | Better customization, owns the components |
| `next-intl` over `next-i18next` | Better App Router support |
| Web Speech API first, ElevenLabs later | Free + works immediately |
| Append-only finance | Audit compliance non-negotiable |
| Modular login URLs | Better UX, clearer access boundaries |

---

**Next:** Read `DATA_MODEL.md` to understand the database schema.

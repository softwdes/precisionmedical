# Phase 0 — Foundation Setup

> **Duration:** 2 weeks
> **Goal:** Build the foundation that all subsequent phases depend on.

---

## ✅ Definition of done for this phase

A user can:
- Visit `/admin` and see a login page styled with our design system
- Log in with email + password (Supabase Auth)
- See an empty dashboard layout (sidebar + topbar) matching the mockup
- Toggle dark/light theme
- Toggle ES/EN language

The repo:
- Builds without errors
- Has CI running on every PR
- Auto-deploys preview to Vercel

---

## 🎯 Tasks

### Task 0.1 — Initialize the monorepo

**Estimated:** 4 hours

Steps:
1. Create new GitHub repo: `precision-medical/lm-super-admin`
2. Initialize with Turborepo + pnpm:
   ```bash
   pnpm dlx create-turbo@latest precision-medical
   cd precision-medical
   ```
3. Configure `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```
4. Configure `turbo.json` (see `examples/config/turbo.json`)
5. Set up shared configs:
   - `packages/eslint-config` with Next.js + TypeScript rules
   - `packages/tsconfig` with `base.json`, `nextjs.json`, `react-library.json`
   - `packages/tailwind-config` with our design tokens
6. Initial commit, push to GitHub

**Acceptance:** `pnpm install && pnpm build` succeeds.

---

### Task 0.2 — Set up Supabase project

**Estimated:** 3 hours

Steps:
1. Create Supabase project at [supabase.com](https://supabase.com)
2. Note: keep separate projects for dev / staging / prod
3. Get credentials (URL, anon key, service role key, DB connection string)
4. Add to GitHub Secrets and `.env.local`:
   ```
   DATABASE_URL=
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```
5. Enable email + password auth in Supabase dashboard
6. Configure email templates (use minimal default for now)
7. Verify a sending domain (will be needed in Phase 0.7)

**Acceptance:** Can connect to Supabase from local environment.

---

### Task 0.3 — Initialize Prisma schema

**Estimated:** 4 hours

Steps:
1. Create `packages/database/`:
   ```bash
   cd packages
   mkdir database && cd database
   pnpm init
   pnpm add -D prisma @prisma/client
   pnpm dlx prisma init
   ```
2. Copy minimal schema from `examples/prisma/schema.prisma` (Phase 0 models only):
   - `User`
   - `UserRole` enum
   - `UserStatus` enum
   - `Locale` enum
   - `Theme` enum
   - `Session`
3. Connect to Supabase via `DATABASE_URL`
4. Run first migration:
   ```bash
   pnpm prisma migrate dev --name init
   ```
5. Generate Prisma Client
6. Export client from `packages/database/src/index.ts`:
   ```typescript
   export { PrismaClient } from '@prisma/client';
   export const db = new PrismaClient();
   ```

**Acceptance:** Tables visible in Supabase dashboard.

---

### Task 0.4 — Create the web app

**Estimated:** 4 hours

Steps:
1. Create `apps/web/`:
   ```bash
   cd apps
   pnpm dlx create-next-app@latest web --typescript --tailwind --app --no-src-dir
   ```
2. Configure to use shared packages
3. Replace default Tailwind config with our preset
4. Add `next-intl` for i18n
5. Set up route structure:
   ```
   apps/web/app/
   ├── (auth)/
   │   ├── login/page.tsx
   │   └── layout.tsx
   ├── (admin)/
   │   ├── dashboard/page.tsx
   │   └── layout.tsx
   ├── api/
   └── layout.tsx
   ```
6. Implement auth middleware that redirects unauthenticated users to `/login`

**Acceptance:** `pnpm dev` shows the login page on localhost.

---

### Task 0.5 — Implement design tokens

**Estimated:** 3 hours

Steps:
1. Copy `design/design-tokens.css` to `apps/web/app/globals.css`
2. Configure Tailwind to use the CSS variables (see `examples/config/tailwind.config.ts`)
3. Set up theme switching:
   - Toggle in topbar
   - Persist to `localStorage`
   - Sync to user profile when logged in
4. Set up font loading:
   - Plus Jakarta Sans (400, 500, 600, 700, 800)
   - JetBrains Mono (400, 500, 600, 700)
5. Create base components in `packages/ui/`:
   - `Button` (primary, secondary, ghost, icon variants)
   - `Card`
   - `Input`
   - `Badge`
   - `PillToggle`

**Acceptance:** A test page renders all base components in both themes correctly.

---

### Task 0.6 — Set up Supabase Auth integration

**Estimated:** 6 hours

Steps:
1. Install `@supabase/ssr`
2. Create `packages/auth/` with helpers:
   - `createClient()` for browser
   - `createServerClient()` for server components
   - `getCurrentUser()` for tRPC context
3. Build `/login` page matching design system
4. Implement login flow (email + password)
5. Implement logout
6. Implement session refresh
7. Add middleware to protect `/admin/*` routes
8. Sync Supabase Auth users with our `User` table (trigger on signup)

**Acceptance:** Can log in, log out, and protected routes are inaccessible without auth.

---

### Task 0.7 — Implement i18n (ES/EN)

**Estimated:** 3 hours

Steps:
1. Install `next-intl`
2. Create `packages/i18n/`:
   ```
   packages/i18n/
   ├── messages/
   │   ├── en.json
   │   └── es.json
   ├── src/
   │   ├── config.ts
   │   └── middleware.ts
   ```
3. Set up locale detection:
   - User preference (DB) > Browser language > Default (ES)
4. Add language toggle in topbar
5. Translate base strings (login page, common buttons, etc.)
6. Persist preference to `users.preferredLocale`

**Acceptance:** Toggling ES/EN switches all visible text correctly.

---

### Task 0.8 — Build the AppLayout

**Estimated:** 8 hours

Steps:
1. Build `Sidebar` component (`packages/ui/`):
   - Brand block at top
   - Nav groups (Main, Modules, System)
   - Active state with gradient + accent bar
   - Submenu support (collapsible)
   - Recent items section at bottom
   - Mobile drawer behavior
2. Build `Topbar` component:
   - Search input (placeholder for ⌘K)
   - Clock pill (live updating time)
   - Notification bell (placeholder)
   - Theme toggle (moon/sun pill)
   - Language toggle (ES/EN pill)
   - Avatar with name + role
3. Build `AppLayout` template that combines sidebar + topbar + main
4. Add boot animation (logo glow, layout slide-in, content fade-in)

**Acceptance:** Layout renders identically to mockup in both themes, both languages, mobile and desktop.

---

### Task 0.9 — Set up tRPC

**Estimated:** 4 hours

Steps:
1. Create `packages/api/`:
   ```bash
   pnpm add @trpc/server @trpc/client @trpc/react-query @trpc/next zod
   ```
2. Define context with auth user
3. Create base procedures:
   - `publicProcedure`
   - `protectedProcedure` (requires login)
   - `adminProcedure` (requires admin role)
4. Create root router with placeholder modules:
   ```typescript
   export const appRouter = router({
     users: router({ ping: protectedProcedure.query(() => 'ok') }),
   });
   ```
5. Set up tRPC client in `apps/web/`
6. Test from a server component and a client component

**Acceptance:** `users.ping` returns "ok" when called from authenticated client.

---

### Task 0.10 — Install shadcn/ui

**Estimated:** 2 hours

Steps:
1. Initialize shadcn in `packages/ui/`:
   ```bash
   pnpm dlx shadcn-ui@latest init
   ```
2. Customize defaults to use our design tokens
3. Install initial components:
   - Button (override the default with our styling)
   - Dialog
   - Toast (Sonner)
   - DropdownMenu
   - Tabs
   - Form (with react-hook-form integration)

**Acceptance:** shadcn components render with our design tokens.

---

### Task 0.11 — Set up CI/CD

**Estimated:** 4 hours

Steps:
1. Create `.github/workflows/ci.yml`:
   - Trigger: PR opened/updated
   - Steps: install, typecheck, lint, test, build
2. Create `.github/workflows/deploy-staging.yml`:
   - Trigger: push to `develop`
   - Auto-deploys to Vercel staging
3. Configure Vercel projects:
   - One project per app in `apps/`
   - Environment variables per environment
4. Configure branch protection on `main`:
   - Requires PR
   - Requires green CI
   - Requires 1 review
5. Set up Conventional Commits hook (optional but recommended)

**Acceptance:** PR triggers CI; merge to `develop` deploys to staging.

---

### Task 0.12 — Set up observability

**Estimated:** 3 hours

Steps:
1. Sentry:
   - Create project at sentry.io
   - Install `@sentry/nextjs`
   - Configure `instrumentation.ts`
   - Add PHI scrubbing
   - Verify error tracking works
2. PostHog:
   - Create project at posthog.com
   - Install `posthog-js` and `posthog-node`
   - Configure with privacy settings
   - Track first event: `app.loaded`

**Acceptance:** Errors appear in Sentry; events appear in PostHog.

---

### Task 0.13 — Documentation

**Estimated:** 4 hours

Steps:
1. Write a developer `README.md` in the repo:
   - Setup instructions
   - How to run locally
   - How to run tests
   - How to deploy
2. Document each package with its own `README.md`:
   - `packages/ui/README.md`
   - `packages/auth/README.md`
   - `packages/database/README.md`
   - `packages/api/README.md`
   - etc.
3. Set up Storybook for `packages/ui/` (optional but recommended)

**Acceptance:** A new developer can clone the repo and run it locally following only the README.

---

## 📊 Phase 0 milestone review

After Phase 0, demo to the project lead:

1. Login → empty dashboard transition
2. Theme toggle (dark ↔ light)
3. Language toggle (ES ↔ EN)
4. Sidebar nav (clicking links works, even if pages are empty)
5. Mobile responsive (sidebar becomes drawer)
6. Boot animation
7. CI passing on a sample PR
8. Preview deployment URL

**Sign-off required before starting Phase 1.**

---

## ⚠️ Common pitfalls

- ❌ Skipping the design tokens setup → leads to inconsistent UI later
- ❌ Building components without theming support → painful refactor later
- ❌ Hardcoded strings → painful refactor for i18n
- ❌ Forgetting to configure RLS in Supabase → security hole
- ❌ Not setting up CI early → bugs slip into main
- ❌ Skipping documentation → onboarding others is painful

---

**Next:** `tasks/phase-1-core.md`

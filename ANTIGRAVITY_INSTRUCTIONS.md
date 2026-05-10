# Instructions for Antigravity (and AI Development Agents)

> **READ THIS FIRST.** This document tells you how to interpret the rest of the specifications and how to build this project successfully.

---

## 🎯 Your mission

You are building **LM Super Admin** for **Precision Medical**, an auto-accident specialty clinic in Utah, USA. This is a real production system, not a prototype. The visual design has been approved by the client — your job is to bring it to life with working code.

---

## 📖 How to read these specs (order matters)

Follow this exact sequence:

1. **`README.md`** — Get the big picture
2. **This file** — Understand how to work with the specs
3. **`PRD.md`** — Read the full product requirements
4. **`docs/ARCHITECTURE.md`** — Understand the technical decisions
5. **`docs/DATA_MODEL.md`** — Internalize the data model
6. **`docs/DESIGN_SYSTEM.md`** — Match the visual identity
7. **`design/lm-dashboard.html`** — Open in a browser to see the target UI
8. **`tasks/phase-0-setup.md`** — Start executing tasks

Do not jump ahead. Each phase depends on the previous one.

---

## ✅ Rules of engagement

### Rule 1: Follow the patterns, don't invent new ones
The `examples/` folder contains canonical code snippets. **Replicate these patterns** across the codebase. Do not introduce new patterns unless absolutely necessary, and always justify why.

### Rule 2: The design is locked
The visual mockup at `design/lm-dashboard.html` has been approved by the client. **Do not redesign anything.** Match it pixel-by-pixel using the design tokens in `design/design-tokens.css`.

### Rule 3: TypeScript strict mode, always
No `any`. No `@ts-ignore`. Every function has explicit return types. Every prop is typed.

### Rule 4: Append-only for financial data
`Payment`, `FxOperation`, `CashTransaction`, `Commission` records are **immutable**. To "edit" something, create a reversal/adjustment record. This is non-negotiable for audit compliance.

### Rule 5: Bilingual everything
Every user-facing string must go through the `i18n` package. No hardcoded text. Both Spanish and English translations are required from day one.

### Rule 6: Mobile-first
Build for mobile, then enhance for desktop. The client uses iPad and phones extensively. Test every screen at 375px width before considering it done.

### Rule 7: Ask, don't assume
If a spec is ambiguous, **stop and ask the project lead** (Erick Salinas) before proceeding. Wrong assumptions are expensive to undo.

### Rule 8: Commit often, push often
Small, atomic commits. Every commit should leave the build green. Use conventional commits (`feat:`, `fix:`, `docs:`, etc.).

---

## 🏗️ Build order (strict)

Each phase must be **completed and approved** before moving to the next.

### Phase 0 — Foundation (2 weeks)
- Turborepo monorepo setup
- Next.js 15 app skeleton
- Supabase project + Prisma schema (initial models only)
- Tailwind config matching design tokens
- shadcn/ui base components
- Auth.js or Supabase Auth integration
- CI/CD with Vercel + GitHub Actions
- Basic landing/login pages

**Done when:** A user can log in to the admin app, see an empty dashboard layout, and the design tokens are wired correctly.

### Phase 1 — Core modules (6-8 weeks)
- Users + Roles + Permissions module
- Employees module (3 types)
- Basic Payments (single currency)
- Petty Cash module
- Main dashboard with KPIs
- Modular login URLs (`/admin`, `/lawyers`, `/providers`)
- ES/EN translations infrastructure
- Theme toggle (light/dark) working

**Done when:** A super admin can manage employees, log petty cash, and see a working dashboard.

### Phase 2 — Finance & Metrics (4-6 weeks)
- Multi-currency wallets (USD, BOB, PEN)
- FX operations with rate tracking
- External attendance DB sync (read-only)
- Metrics engine with KPIs (punctuality, task completion, productivity, quality)
- Performance dashboard per employee
- Snapshot-based history

**Done when:** Payroll generation works in 3 currencies and the metrics dashboard shows live data.

### Phase 3 — External portals (6-8 weeks)
- Lawyers module + dedicated portal
- Providers module + dedicated portal
- Calendar with availability
- Patient referral flow
- Commission engine (multiple schemes)
- Notifications via Resend
- Commission dashboards for lawyers/providers

**Done when:** A lawyer can log in, refer a patient via calendar, and see their commissions.

### Phase 4 — AI agents (4-6 weeks)
- AI Agents module (dedicated section in admin)
- **CIFO** conversational assistant (with voice)
- **Audit Agent** with three modes (manual/approval/autonomous)
- Action inbox for human approval
- Cost tracking per agent
- Agent permissions and budget controls

**Done when:** CIFO talks back with voice and the Audit Agent finds a real issue and proposes a fix.

---

## 🤖 Working with CIFO (the AI assistant)

CIFO is the in-app AI assistant. It is **NOT optional** — it is core to the product experience.

### Voice requirements
- **Default voice:** masculine, child-like, friendly tone
- **Default engine:** Web Speech API (free, browser-native)
- **Premium engine ready:** ElevenLabs integration scaffolded (activated by env var)
- **Welcome on first load:** "Hola Erick, soy CIFO. Estoy listo para ayudarte." (auto-translated to EN)
- **Microphone input:** Web Speech Recognition supported

### Behavior requirements
- Floating action button (FAB) always visible
- Idle state: gentle pulse animation
- Active state: expand to side panel
- Speaking state: animated waveform/orbit
- Listening state: red glow with vibrating particles
- Mute button visible
- Close transitions back to FAB with particle burst

### Action capability
CIFO must be able to:
- Answer questions about data ("Top employees this month")
- Propose actions ("Create new patient" → opens modal)
- Execute simple actions when authorized
- Use tools (function calling) to query the database

See `docs/AI_AGENTS.md` for full implementation details.

---

## 🎨 Design system enforcement

### Colors (from `design/design-tokens.css`)
```css
--brand: #6366F1;   /* indigo */
--brand-2: #8B5CF6; /* violet */
--cyan: #06B6D4;
--emerald: #10B981;
--amber: #F59E0B;
--rose: #F43F5E;
```

### Typography
- **Body:** Plus Jakarta Sans (400, 500, 600, 700, 800)
- **Numbers/code:** JetBrains Mono (400, 500, 600, 700)

### Spacing rhythm
4px base unit. Most paddings: 8, 12, 14, 18, 20, 24px.

### Border radius
- Small: 8px
- Default: 14px
- Large: 20px

### Component patterns
See `design/components-guide.md` for canonical component implementations.

---

## 🚫 Common mistakes to avoid

1. ❌ Using a different UI library (Material, Chakra, Ant Design) — **only shadcn/ui**
2. ❌ Inventing new color shades not in the design tokens
3. ❌ Hardcoding strings instead of using i18n
4. ❌ Building desktop-first and "fixing" mobile later
5. ❌ Allowing edits to financial records — they must be append-only
6. ❌ Skipping CIFO — it's a core feature, not a polish item
7. ❌ Mixing concerns across packages — each package has a clear boundary
8. ❌ Using REST instead of tRPC — type safety is mandatory
9. ❌ Forgetting the "external" employee type in payroll calculations
10. ❌ Ignoring the multi-currency requirement until Phase 3 — plan for it from Phase 1

---

## 📞 Communication protocol

When you encounter:

| Situation | What to do |
|-----------|-----------|
| Ambiguous spec | Stop and ask the project lead in writing |
| Need a design decision | Refer to `design/lm-dashboard.html` first; if not covered, ask |
| Missing data structure | Propose addition with rationale, wait for approval |
| Performance concern | Document trade-offs; propose 2-3 options |
| Security concern | Block work, escalate immediately |
| Phase complete | Demo it, get sign-off, document, move on |

---

## ✨ Definition of "Done"

A feature is done when:

- [ ] Code is in `main` branch (not in a forgotten PR)
- [ ] TypeScript compiles with zero errors
- [ ] ESLint passes with zero warnings
- [ ] Component matches the design tokens exactly
- [ ] Works on mobile (375px) and desktop (1440px)
- [ ] Strings are translated to ES and EN
- [ ] Both light and dark themes work
- [ ] Has at least one test (unit or integration)
- [ ] Documented in the relevant package's README
- [ ] Reviewed by the project lead
- [ ] Deployed to staging and validated

---

## 🎬 Ready to start?

Your next action: **Open `PRD.md` and read it end-to-end.**

Then proceed to `docs/ARCHITECTURE.md`, then `docs/DATA_MODEL.md`, and finally `tasks/phase-0-setup.md` to begin executing.

Good luck. Build something the client will love.

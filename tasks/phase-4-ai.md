# Phase 4 — AI Agents

> **Duration:** 4-6 weeks
> **Goal:** Build the AI Agents module, ship CIFO with voice, and ship the Audit Agent.

---

## ✅ Definition of done for this phase

- The AI Agents module is fully functional in the admin app
- CIFO is ALWAYS visible (FAB) and can converse with voice
- CIFO greets the user on first load: "Hola Erick, soy CIFO. Estoy listo para ayudarte."
- The Audit Agent runs on schedule and detects real issues
- Admin can approve/reject agent actions from an inbox
- Cost tracking shows token usage and USD cost per agent

---

## 🎯 Tasks

### Task 4.1 — Extend schema for Phase 4

**Estimated:** 3 hours

Add models:
- `Agent`
- `AgentAction`
- `AgentConversation`

Run migration: `pnpm prisma migrate dev --name phase-4-ai`

Seed initial agents:
- CIFO (type: CONVERSATIONAL)
- Audit Agent (type: AUDITOR)

---

### Task 4.2 — AI Agents framework package

**Estimated:** 14 hours

Create `packages/ai-agents/`:

#### Sub-tasks

**4.2.1 — Provider abstraction**
- `src/providers/anthropic.ts` — Claude integration
- `src/providers/openai.ts` — GPT integration
- `src/providers/index.ts` — generic interface + auto-fallback

**4.2.2 — Voice abstraction**
- `src/voice/web-speech.ts` — browser-native (default)
- `src/voice/elevenlabs.ts` — premium (toggle via env)
- `src/voice/recognition.ts` — speech-to-text
- `src/voice/index.ts` — generic interface

**4.2.3 — Agent base class**
- `src/agents/base.ts`:
  - Logging utilities
  - Cost tracking
  - Permission checks
  - Tool registry

**4.2.4 — Tool framework**
- Define tool with: name, description, parameters (Zod), handler
- Auto-generate LLM-compatible tool definitions
- Validate inputs before executing
- Log every tool call

**4.2.5 — Cost calculation**
- `calculateCost(provider, model, tokensIn, tokensOut)` utility
- Update `Agent.totalCostUsd` after each run
- Auto-pause if budget exceeded

**Acceptance:** Framework supports adding agents declaratively.

---

### Task 4.3 — CIFO conversational agent

**Estimated:** 24 hours

#### Sub-tasks

**4.3.1 — CIFO agent definition**
```typescript
// packages/ai-agents/src/agents/cifo.ts
export const cifoAgent = {
  name: 'CIFO',
  type: 'CONVERSATIONAL',
  systemPrompt: `You are CIFO, a friendly assistant...`,
  tools: [
    getEmployeeSummary,
    getTopPerformers,
    getAppointmentsToday,
    createPatient,
    getRevenueSummary,
    getPendingCommissions,
    getCashBalance,
    navigateTo,
    generateReport,
  ],
  voiceConfig: {
    pitch: 1.4,
    rate: 1.05,
    volume: 1.0,
  },
};
```

**4.3.2 — Tools implementation**
For each tool: define Zod schema, implement handler that queries DB, returns result for LLM. Examples:
- `getEmployeeSummary({country?, type?})` → counts and stats
- `getTopPerformers({n, period})` → list with scores
- `getAppointmentsToday({clinicName?})` → list with patients/providers
- `createPatient()` → returns instruction to open the form (no DB write)
- `navigateTo({module, view?})` → returns nav instruction (handled client-side)

**4.3.3 — tRPC endpoint**
- `cifo.chat({ messages })` — sends to LLM, returns streamed response
- Authenticated, with user context
- Tracks tokens used per request
- Updates `Agent.totalTokensUsed` and cost

**4.3.4 — CIFO FAB component**
- `packages/ui/src/agents/CifoFab.tsx`
- Always visible (fixed bottom-right)
- States: idle, hover, active, listening, speaking
- Animations per state (see DESIGN_SYSTEM.md)
- Click to expand panel

**4.3.5 — CIFO panel component**
- `packages/ui/src/agents/CifoPanel.tsx`
- Slides in from right
- Header: orb, name, mute, lang, close
- Message thread (scrollable)
- Input bar with mic + send buttons
- Suggestion chips (context-aware)
- Voice waveform during speaking
- Typing indicator during thinking

**4.3.6 — Welcome message logic**
- On first app load: trigger welcome
- Detects locale, plays appropriate text
- ES: "Hola Erick, soy CIFO. Estoy listo para ayudarte."
- EN: "Hi Erick, I'm CIFO. I'm ready to help you."
- Toggleable in user settings

**4.3.7 — Voice integration**
- Wire Web Speech API for synthesis (default)
- Wire Web Speech Recognition for input
- Preview ElevenLabs integration (gated by `ELEVENLABS_ENABLED`)
- Mute toggle persists per user

**4.3.8 — Context-aware suggestions**
- Suggestions change based on `currentModule` prop
- 3 suggestions visible at once
- Click suggestion → sends as message

**4.3.9 — Conversation persistence**
- Each session creates an `AgentConversation` row
- Messages array updated as conversation proceeds
- History clears on close (per spec, can be made configurable)

**4.3.10 — Fallback responses**
- If `ANTHROPIC_API_KEY` not set OR API fails:
  - Use keyword-matching fallback
  - Friendly fallback message: "Estoy aprendiendo sobre eso. ¿Puedes preguntarme de otra forma?"

**Acceptance:** CIFO fully functional: greets on load, responds with voice, takes microphone input, executes tool calls, renders beautifully.

---

### Task 4.4 — Audit Agent

**Estimated:** 16 hours

#### Sub-tasks

**4.4.1 — Audit Agent definition**
```typescript
// packages/ai-agents/src/agents/audit.ts
export const auditAgent = {
  name: 'Audit Agent',
  type: 'AUDITOR',
  systemPrompt: `You are an audit agent for LM Super Admin...`,
  capabilities: [
    'data_audit',
    'error_monitoring',
    'compliance_check',
  ],
  schedule: '0 8 * * *',  // daily at 8am
};
```

**4.4.2 — Data audit checks**
- Find payments without proof URLs
- Find FX operations that don't balance
- Find employees missing metric snapshots
- Find orphaned records
- Find suspicious patterns:
  - Unusual cash transactions (>3 std devs above mean)
  - Sudden referral spikes
  - Repeated reversals from same user

**4.4.3 — Error monitoring**
- Connect to Sentry API (read-only)
- Detect new error types
- Detect spikes in error rates
- Categorize by severity

**4.4.4 — Compliance checks**
- All commissions have provenance
- All payments above threshold have approval
- All patient data accesses have valid consent
- Audit log integrity (no gaps)

**4.4.5 — Action generation**
- For each finding, create `AgentAction`:
  - type: DETECTION or RECOMMENDATION
  - severity: based on issue
  - status: PENDING_REVIEW (or AUTO_APPLIED if mode=AUTONOMOUS and risk low)
  - payload: full details for review
  - summary: human-readable description

**4.4.6 — Operating modes**
- MANUAL: only logs, no autonomous action
- APPROVAL: proposes fixes, waits for human approval
- AUTONOMOUS: applies low-risk fixes within boundaries

**4.4.7 — Cron scheduling**
- Vercel Cron triggers `/api/cron/audit-agent-run`
- Endpoint runs the agent
- Results saved to DB
- Notifications sent for critical findings

**Acceptance:** Audit Agent runs daily, finds real issues (test with seeded bad data), creates actions for review.

---

### Task 4.5 — AI Agents Module UI (admin)

**Estimated:** 18 hours

#### Sub-tasks

**4.5.1 — Module layout**
- Sidebar entry: "AI Agents" with sparkles icon
- Sub-tabs:
  - Dashboard (overview)
  - CIFO
  - Audit Agent
  - Pending Actions
  - History
  - Costs

**4.5.2 — Agents Dashboard**
- KPI cards:
  - Total actions today
  - Pending approval
  - Auto-applied today
  - Cost this month (USD)
- Active agents grid: card per agent
  - Status indicator (idle/running/paused/error)
  - Mode badge
  - Last run, next run
  - Actions: Run now, Pause, Edit
- Recent actions feed (last 20)

**4.5.3 — Agent detail page**
- Tabs:
  - Configuration (mode, schedule, permissions, budget)
  - Permissions
  - History
  - Logs
- Edit form for config

**4.5.4 — Pending Actions inbox**
- Filterable table:
  - Severity, type, date range, search
- Each row expandable:
  - Full payload (JSON viewer)
  - Proposed fix preview
  - Buttons: Approve, Reject, Defer
- Bulk operations:
  - Select multiple → bulk approve/reject

**4.5.5 — History view**
- All past actions, paginated
- Filter by agent, status, date
- Detail modal on click

**4.5.6 — Costs view**
- Tokens consumed (this month vs last)
- Cost in USD (this month vs last)
- Cost per agent (donut chart)
- Cost over time (line chart)
- Budget remaining per agent (progress bars)
- Alert badges when approaching limits

**Acceptance:** Full admin control over agents from one place.

---

### Task 4.6 — Permissions for AI agents

**Estimated:** 6 hours

#### Sub-tasks

**4.6.1 — System user for agents**
- Seed user: `auditor.ai@system.local` with role=AUDITOR_AI
- Used for agent actions in audit_log

**4.6.2 — Permission scope**
- Define what each agent can read/write
- Validate before tool execution
- Log permission denials

**4.6.3 — PHI redaction**
- Before sending data to LLM, redact PHI
- Use `redactPHI()` utility
- Document what gets redacted

**4.6.4 — Sensitive data exclusions**
- Never to LLM: passwords, MFA secrets, bank accounts
- Sometimes (with auth): aggregated patient stats
- Always OK: employee names, public data

**Acceptance:** Agents cannot exceed their permissions; PHI never leaks to LLMs.

---

### Task 4.7 — Cost management & budgets

**Estimated:** 6 hours

#### Sub-tasks

**4.7.1 — Track every API call**
- Middleware around LLM calls
- Records: agent_id, tokens_in, tokens_out, model, cost
- Updates `Agent.totalCostUsd` and `Agent.totalTokensUsed`

**4.7.2 — Auto-pause on budget hit**
- Before each agent run, check `monthlyCost >= budgetMonthlyUsd`
- If yes: pause agent, notify admin
- Status: PAUSED until manual resume or next month

**4.7.3 — Budget alerts**
- 80% used → warning notification
- 100% used → critical, agent paused

**4.7.4 — Cost dashboard widgets**
- Show on main admin dashboard if cost > $50/month
- "AI spend this month: $X / $Y budget"

**Acceptance:** Budgets enforced, no surprise bills, admin always knows costs.

---

### Task 4.8 — CIFO advanced features

**Estimated:** 10 hours

#### Sub-tasks

**4.8.1 — Multi-turn conversation memory**
- CIFO remembers context within a session
- "What about last month?" → uses previous "this month" context

**4.8.2 — Module-aware responses**
- CIFO knows what page user is on
- Suggestions adapt
- Responses can reference current view ("on this employee...")

**4.8.3 — Action confirmation**
- For destructive actions (delete, modify), CIFO asks for confirmation
- "Are you sure you want to delete this employee?"
- Requires explicit "yes" before executing

**4.8.4 — Quick actions from voice**
- "Create a new patient" → opens patient form
- "Show me today's appointments" → navigates and filters
- "Generate this month's payroll report" → triggers report generation

**4.8.5 — Streaming responses**
- LLM responses stream in (typewriter effect)
- Voice plays each sentence as it completes
- User can interrupt

**Acceptance:** CIFO feels like a real assistant, not a chatbot.

---

### Task 4.9 — Audit Agent advanced features

**Estimated:** 8 hours

#### Sub-tasks

**4.9.1 — Code analysis (optional, advanced)**
- Connect to GitHub via API
- Read repo structure
- Detect anti-patterns
- Suggest refactors

**4.9.2 — Automatic fixes (autonomous mode only)**
- Apply low-risk data fixes:
  - Tag orphaned records
  - Compute missing snapshots
  - Re-run failed syncs
- Log every auto-applied action

**4.9.3 — Daily executive report**
- Auto-generated at 8am
- Summary email to super_admin via Resend
- Includes: top issues, resolved overnight, KPIs

**4.9.4 — Weekly deep-dive**
- Mondays at 6am
- More comprehensive analysis
- Trend detection over the week

**Acceptance:** Audit Agent provides real value — proactive issue detection, not just logs.

---

### Task 4.10 — Polish and animations

**Estimated:** 8 hours

#### Sub-tasks

**4.10.1 — CIFO animations checklist**
- FAB idle pulse
- Hover effect
- Open/close particle bursts
- Listening: red glow + vibrating particles
- Speaking: waveform reactive to audio
- Thinking: dots + orbit
- Welcome: orb pulse before greeting

**4.10.2 — Audit Agent visualizations**
- Status orb on agents dashboard (pulses when running)
- Action severity color coding
- Smooth transitions on action approval/rejection

**4.10.3 — Performance**
- Lazy-load AI panel (not on initial bundle)
- Stream responses (don't wait for full response)
- Cache common tool results

**Acceptance:** AI features feel premium and polished.

---

## 📊 Phase 4 milestone review

After Phase 4, demo to the project lead:

1. Open the app, hear CIFO welcome with voice
2. Click microphone, ask "¿Cuántos empleados activos tengo?" — get response
3. Click microphone, ask "Crea un paciente nuevo" — see form open
4. Mute CIFO, see button visualization
5. Switch to English, ask in English, hear English response
6. Open AI Agents module
7. Show Audit Agent finding 3 real issues from seed data
8. Approve 2, reject 1
9. Show cost dashboard with token usage and USD spend
10. Show budget alert when limit approached

**Sign-off required for production launch.**

---

## ⚠️ Common pitfalls

- ❌ Treating CIFO as a polish item → it's CORE to the product
- ❌ Forgetting PHI redaction → HIPAA violation
- ❌ Letting AI costs run unchecked → surprise bills
- ❌ Building voice as an afterthought → it must work from launch
- ❌ Making CIFO too generic → it should know YOUR data
- ❌ Skipping the welcome animation → first impression matters
- ❌ Allowing autonomous mode without tight boundaries → risky changes

---

## 🎉 Production launch checklist

Before going to production:

- [ ] All Phase 0-4 tasks complete
- [ ] Pen test completed and findings remediated
- [ ] BAAs in place with all data processors
- [ ] Backups verified
- [ ] Monitoring active (Sentry + PostHog)
- [ ] Documentation up to date
- [ ] Training sessions held for the client team
- [ ] Migration plan from old systems documented
- [ ] Support process defined (who handles tickets, SLA)
- [ ] Initial data seeded (employees, lawyers, providers)
- [ ] CIFO tested with all admins
- [ ] Audit Agent tuned to find real issues, not noise
- [ ] DNS configured (`app.precisionmedical.com`, `lawyers.precisionmedical.com`, `providers.precisionmedical.com`)
- [ ] SSL certificates valid
- [ ] Final approval from project lead

---

**🎉 Congratulations. You've built LM Super Admin.**

Continue iterating with the client based on real-world feedback. Future phases (5+):
- Patient self-service portal
- Insurance claim automation
- Native mobile apps
- Advanced BI tools
- More AI agents (Metrics, FX Watcher, Referral Optimizer, Compliance, Onboarding, Translator)

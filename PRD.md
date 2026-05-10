# Product Requirements Document (PRD)
## LM Super Admin · Precision Medical

**Version:** 1.0
**Date:** May 2026
**Owner:** Erick Salinas (Administrator, Precision Medical)
**Status:** Approved for development

---

## 1. Executive summary

Precision Medical operates a chain of clinics in Utah specialized in treating victims of auto accidents. Their operation involves a complex ecosystem: full-time employees, contractors, external workers, lawyers (firms and independents), medical providers, and patients. Multiple currencies are involved due to teams in USA, Bolivia, and Peru.

**LM Super Admin** is the central nervous system of this operation. It unifies fragmented tools (spreadsheets, manual processes, separate logins) into one platform.

**Key differentiators:**
- AI-native from day 1 (CIFO conversational agent + Audit Agent)
- Multi-currency, multi-country
- Modular login per stakeholder type
- Bilingual (ES/EN)
- Mobile-first

---

## 2. User personas

### 2.1 Super Admin (Erick Salinas)
- **Goal:** Total visibility and control over operations
- **Pain points:** Currently using spreadsheets + multiple tools, no real-time view
- **Key needs:** Dashboard, financial control, AI insights, user management

### 2.2 Admin
- **Goal:** Day-to-day operational management
- **Pain points:** Manually updating records, no clear performance metrics
- **Key needs:** Employee management, petty cash, payments, reports

### 2.3 Employee
- **Goal:** Self-service access to their own data
- **Pain points:** No visibility into their performance or payments
- **Key needs:** View tasks, attendance, performance score, payment history

### 2.4 Lawyer (External)
- **Goal:** Refer patients efficiently and earn commissions transparently
- **Pain points:** Phone-based scheduling, opaque commission tracking
- **Key needs:** Calendar booking, referral form, commission dashboard

### 2.5 Provider (External medical specialist)
- **Goal:** Receive referrals and coordinate care
- **Pain points:** Disconnected workflows with the clinic
- **Key needs:** Calendar, clinical referrals, payment tracking

---

## 3. Module specifications

### 3.1 Module: Dashboard (main admin)

**Purpose:** Executive view at a glance.

**Components:**
- 4 KPI cards with sparklines (today's appointments, active patients, monthly revenue, pending tasks)
- Appointments panel by clinic (Pleasant Grove, Provo)
- Distribution donut chart
- Activity feed (real-time)
- Top referring lawyers (top 5 of the month)
- Top referring providers (top 5 of the month)
- Commission summary (earned, paid, pending)
- Performance chart (30 days, attended vs canceled)
- System health indicators
- AI agent status panel

**Key interactions:**
- Click any KPI → drill into the related module
- Click an appointment → open patient details
- Click an activity → jump to the source

---

### 3.2 Module: Users & Access Management

**Purpose:** Single source of truth for all system identities.

**Sub-tabs:**
- All users
- Employee accesses
- Lawyer accesses
- Provider accesses
- Roles & permissions
- Audit log

**Functional requirements:**
- CRUD for users with role assignment
- Invite by email (Resend)
- MFA setup (mandatory for admin, financial roles)
- Active session view + remote revocation
- Link user to entity (Employee, Lawyer, Provider)
- Granular permissions by module + action
- Immutable audit trail

**Roles:**
| Role | Scope |
|------|-------|
| `super_admin` | Full access including AI config |
| `admin` | Operational management |
| `employee` | Self-service only |
| `lawyer` | Lawyer portal |
| `provider` | Provider portal |
| `auditor_ai` | System role for the AI agent |

---

### 3.3 Module: Employees

**Purpose:** Manage the workforce across 3 countries with 3 employment types.

**Sub-tabs:**
- Employees list
- Payments
- Performance metrics
- Attendance
- Departments

**Employee types:**

| Type | Compensation | Benefits | Time tracking |
|------|--------------|----------|---------------|
| **Full-time** | Fixed monthly salary in local currency | Yes | Daily attendance |
| **External** | Per contract | No | Limited |
| **Contractor** | Hourly or per service | No | Mandatory time-tracking |

**Required fields:**
- Personal info: name, email, photo, phone
- Country / city (defines currency and legal rules)
- Type (full-time / external / contractor)
- Position / department
- Supervisor (reference to another employee)
- Start date
- Status (active / inactive / suspended)
- Payment info: bank, method, preferred currency (encrypted)
- Documents: contract, ID, NDA (S3 with signed URLs)

**Departments to seed:**
- Front Desk
- Medical Staff
- Administration
- IT / Tech
- Operations
- Finance

---

### 3.4 Module: Finance

**Purpose:** Multi-currency financial control with FX operations and petty cash.

**Sub-tabs:**
- Wallets (USD, BOB, PEN balances)
- Income / Deposits
- Expenses / Payments
- FX operations
- Petty Cash (Pleasant Grove)
- Petty Cash (Provo)
- Financial reports

**Wallet system:**
- Each currency has a virtual wallet with running balance
- Wallets reflect the equivalent of physical cash/bank holdings
- Transactions are append-only

**FX operations workflow:**
1. Admin sells `$5,000 USD` at exchange house in Bolivia
2. Records: from_wallet=USD_wallet, to_wallet=BOB_wallet, rate=6.90, fee=$50
3. USD wallet decreases by $5,000; BOB wallet increases by 34,500 BOB
4. Receipt photo uploaded to Supabase Storage

**Payroll generation:**
- Weekly / bi-weekly / monthly periods
- For each employee: calculates amount in local currency
- Tracks USD equivalent at the rate of the period
- Status: pending → paid → confirmed (with proof)

**Petty cash:**
- One cash box per clinic
- Categories: medical supplies, transport, food, office, utilities, maintenance, other
- Every expense requires a receipt photo
- Real-time balance with low-balance alert
- Multi-clinic consolidation reports

---

### 3.5 Module: Performance Metrics

**Purpose:** Objective measurement of employee performance.

**Data sources:**
- **External attendance DB** (read-only, sync nightly)
- **Internal task system** (full read/write)

**KPIs:**

| KPI | Calculation |
|-----|-------------|
| **Punctuality** | % of days arrived on time vs scheduled |
| **Tasks on time** | % of tasks delivered before deadline |
| **Productivity** | Tasks completed / tasks assigned |
| **Quality** | Average supervisor review (1-5 scale) |
| **Attendance** | Days present / days expected |

**Global Score formula:**
```
score = (
  punctuality      * 0.20 +
  tasks_on_time    * 0.30 +
  productivity     * 0.25 +
  quality          * 0.20 +
  attendance       * 0.05
) * 100

Grade:
A+ : 95-100
A  : 85-94
B  : 70-84
C  : 50-69
D  : <50
```

**Computation strategy:**
- Nightly job recalculates daily snapshots
- `MetricSnapshot` table stores per-employee per-day scores
- Dashboard reads from snapshots (fast queries)

**Views:**
- Per-employee detail page with score evolution
- Department ranking
- Comparative view (employee vs department average)
- Automatic alerts (score drops, recurring absences, overdue tasks)
- Exportable reports (PDF / Excel)

---

### 3.6 Module: Lawyers

**Purpose:** Manage lawyer relationships and the referral economy.

**Sub-tabs:**
- Lawyers list (firms + independents)
- Reports
- Statistics
- Performance metrics
- Commissions

**Entity types:**
- **Firm** (groups multiple lawyers)
- **Independent** (solo practitioner)

**Commission schemes (configurable per lawyer/firm):**
- **Flat per referral:** Fixed amount when referred patient completes first visit
- **Percentage of billing:** % of total billed during patient's care
- **Volume tier:** Scaled commissions based on monthly referrals
- **Hybrid:** Combination of above

**Lawyer Portal features:**
- Login at `/lawyers`
- Calendar showing available slots by clinic and specialty
- Patient referral form
- Dashboard of referrals + commissions
- Referred patients history (with consent)
- Document sharing (medical reports, invoices)
- Email/SMS notifications

⚠️ **LEGAL COMPLIANCE NOTE:** Commission models for medical referrals are regulated in the US (Stark Law, Anti-Kickback Statute). The system supports configurable models but the **client is responsible for legal validation** of specific terms.

---

### 3.7 Module: Providers

**Purpose:** Mirror of Lawyers module for medical providers (specialists, imaging, physical therapy, etc.).

**Sub-tabs:**
- Providers list
- Reports
- Statistics
- Performance metrics
- Commissions

**Differences from lawyers:**
- Specialty filter on calendar (radiology, neurology, etc.)
- Clinical context in referrals (initial diagnosis, requested studies, urgency)
- Service-based pricing tiers
- Compliance: professional service agreements, not commercial referrals

**Provider Portal features:**
- Login at `/providers`
- Specialty-filtered calendar
- Clinical referral form
- Dashboard of services rendered + revenue
- Patient outcome tracking (with consent)

---

### 3.8 Module: AI Agents

**Purpose:** Centralized management of all AI agents in the system.

**Sub-tabs:**
- Agents dashboard (overview)
- CIFO (conversational assistant)
- Audit Agent
- Pending actions (inbox)
- History
- Costs & metrics

**See `docs/AI_AGENTS.md` for full specifications.**

---

### 3.9 Module: Settings (Configuration)

**Purpose:** System-wide configuration.

**Sub-sections:**
- General (company info, default language, default theme)
- Templates (email templates, document templates) — *moved here from old menu*
- External integrations
- Versions & changelog — *moved here from old menu*
- API keys & webhooks
- Backup & data export

---

## 4. Cross-cutting requirements

### 4.1 Internationalization (i18n)
- Languages: **Spanish (default), English**
- Library: `next-intl`
- All strings via `t()` function
- Language toggle in topbar (ES / EN)
- Persistent preference per user

### 4.2 Theming
- Two themes: **dark (default)** and **light**
- Toggle in topbar (moon / sun icons)
- Preference persisted per user
- Smooth transition between themes (no flash)

### 4.3 Responsive design
- Mobile-first (375px and up)
- Sidebar collapses to drawer on mobile
- All interactive elements ≥44px tap target
- Tables scroll horizontally when needed
- KPI cards: 4 cols → 2 cols → 1 col

### 4.4 Accessibility
- WCAG 2.1 AA target
- Keyboard navigation for all interactive elements
- Screen reader support
- `prefers-reduced-motion` respected
- Color contrast ratios validated

### 4.5 Notifications
- Email: **Resend**
- In-app: real-time bell with notification panel
- SMS (future): Twilio
- Push (future): Web Push for PWA

### 4.6 Search
- Global search via `Cmd+K` command palette
- Searches across patients, employees, appointments, lawyers, providers
- Quick actions (Create patient, Generate report, Go to module)

---

## 5. Non-functional requirements

### 5.1 Performance
- First Contentful Paint < 1.5s
- Time to Interactive < 3s
- 99% of API calls < 500ms
- Database queries optimized with indexes

### 5.2 Security
- HIPAA-aware design (no patient PHI exposed without authorization)
- All data encrypted at rest (Supabase native)
- All data encrypted in transit (TLS 1.3)
- Passwords hashed with bcrypt
- MFA mandatory for super_admin and financial roles
- Audit log immutable

### 5.3 Reliability
- Uptime target: 99.5%
- Daily automated backups
- Disaster recovery plan
- Error tracking via Sentry

### 5.4 Scalability
- Architecture supports 100x growth in users
- Read replicas for reporting
- Background jobs for heavy operations
- CDN for static assets (Vercel)

---

## 6. Out of scope (Phase 1-4)

- Patient self-service portal (Phase 5+)
- Insurance claim automation (Phase 5+)
- Mobile native apps (PWA only initially)
- Telehealth integration
- Direct accounting software integration (export only initially)
- Advanced BI tools (basic dashboards only)

---

## 7. Success metrics

After launch, the project is successful when:

1. **100% of employee payments** are processed through LM Super Admin
2. **80%+ of lawyer referrals** come through the portal (vs phone)
3. **CIFO usage** exceeds 10 interactions per admin per day
4. **Audit Agent** finds and resolves at least 5 issues per week autonomously
5. **System uptime** stays above 99.5% in the first quarter
6. **Time to generate payroll** drops from days to hours

---

## 8. Approvals

- **Product owner:** Erick Salinas — Approved
- **Visual design:** Approved (see `design/lm-dashboard.html`)
- **Technical architecture:** See `docs/ARCHITECTURE.md`
- **Development partner:** Antigravity

---

**End of PRD. Proceed to `docs/ARCHITECTURE.md`.**

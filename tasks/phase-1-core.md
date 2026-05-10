# Phase 1 — Core Modules

> **Duration:** 6-8 weeks
> **Goal:** Build the foundational modules: Users, Employees, basic Payments, Petty Cash, and Dashboard.

---

## ✅ Definition of done for this phase

A super_admin can:
- Create, edit, and deactivate users with different roles
- Manage employees (create, edit, view) with all 3 employment types
- Record basic single-currency payments to employees
- Manage petty cash for both clinics (Pleasant Grove, Provo)
- View a real dashboard with live KPIs
- Access different login URLs (`/admin`, `/lawyers`, `/providers`)
- Use the system in both Spanish and English

---

## 🎯 Tasks

### Task 1.1 — Extend the Prisma schema for Phase 1

**Estimated:** 4 hours

Add the following models (full definitions in `docs/DATA_MODEL.md`):
- `Country` (US, BO, PE seeded)
- `Department` (with seed data)
- `Employee`
- `EmployeeDocument`
- `Wallet` (Phase 1: USD only)
- `Payment`
- `CashBox` (Pleasant Grove, Provo seeded)
- `CashTransaction`
- `Notification`
- `AuditLog`
- `Setting`

Run migration:
```bash
pnpm prisma migrate dev --name phase-1-models
```

Configure RLS policies for each new table (see `docs/SECURITY.md`).

---

### Task 1.2 — Users & Access Management module

**Estimated:** 16 hours

#### Sub-tasks

**1.2.1 — Users list view**
- Table with all users
- Filters: role, status, search
- Bulk actions: deactivate, change role
- Quick actions: edit, suspend, force logout

**1.2.2 — Create/edit user form**
- Fields: name, email, role, status, phone, photo
- Send invitation email on creation (via Resend, will be set up in 1.7)
- Role assignment with explanation tooltip
- Validation with Zod

**1.2.3 — User detail page**
- Personal info card
- Active sessions table
- Recent activity (audit log filtered to this user)
- Linked entity (Employee/Lawyer/Provider) if any

**1.2.4 — Roles & permissions view**
- Read-only matrix showing role × permission
- Future: editable permissions (Phase 5+)

**1.2.5 — Audit log view**
- Filterable table of audit events
- Export to CSV
- Detail modal showing before/after diff

**1.2.6 — Modular login URLs**
- `/admin` → admin app
- `/lawyers` → blocked for now (will redirect to "Coming soon" in Phase 1, full portal in Phase 3)
- `/providers` → blocked for now (same)
- Landing logic checks user role and redirects appropriately

**Acceptance:** Super admin can create a user, that user receives an email, logs in, and is redirected to the correct portal based on role.

---

### Task 1.3 — Employees module

**Estimated:** 24 hours

#### Sub-tasks

**1.3.1 — Employees list view**
- Table with: photo, name, code, type, country, department, status, score
- Filters: country, type, department, status
- Search by name/code/email
- Sort by columns
- Quick view drawer on row hover (preview)

**1.3.2 — Create/edit employee form**
- Multi-step form (3 steps):
  - Step 1: Personal info (name, email, phone, photo)
  - Step 2: Employment (country, type, department, position, supervisor, dates)
  - Step 3: Compensation (salary, currency, payment method, bank info)
- Conditional fields based on employee type:
  - FULL_TIME: monthly salary
  - EXTERNAL: contract details
  - CONTRACTOR: hourly rate, time-tracking required
- Auto-generate employee code (`EMP-2026-XXXX`)
- Encrypt bank account before saving
- Optional: link to existing User account

**1.3.3 — Employee detail page**
- Header card with photo, name, status, key info
- Tabs:
  - Overview (assignments, supervisor, key dates)
  - Compensation (salary history, payments)
  - Tasks (placeholder for Phase 2)
  - Documents (uploads with drag-and-drop)
  - Activity (audit log)

**1.3.4 — Document management**
- Upload to Supabase Storage (`contracts/` bucket)
- Document types: contract, ID, NDA, tax form, other
- Signed URLs for download
- Delete with audit log

**1.3.5 — Departments management**
- CRUD for departments
- Seed data: Front Desk, Medical Staff, Administration, IT, Operations, Finance

**Acceptance:** Can create an employee with all 3 types, upload documents, and view their detail page.

---

### Task 1.4 — Basic Payments module (single currency)

**Estimated:** 16 hours

> ⚠️ Phase 1 is single-currency (USD only). Multi-currency is Phase 2.

#### Sub-tasks

**1.4.1 — Payments list view**
- Table: employee, period, amount, status, date, actions
- Filters: period, status, employee
- Quick actions: mark as paid, upload proof, reverse

**1.4.2 — Create payment form**
- Select employee
- Period (month or week)
- Amount (validated against employee's expected salary)
- Scheduled date
- Notes
- Status defaults to PENDING

**1.4.3 — Mark as paid flow**
- Upload proof (receipt, transfer screenshot)
- Set paid date
- Status changes to PAID
- Notification sent to employee
- Audit log entry

**1.4.4 — Reverse payment**
- Cannot edit, must reverse
- Creates a new payment with negative amount + link to original
- Both records visible in history
- Reason required

**1.4.5 — Bulk payroll generation**
- Select period
- System lists all FULL_TIME and CONTRACTOR employees
- Calculates expected amount per employee
- Admin reviews, edits if needed
- Bulk creates payments

**Acceptance:** Can run payroll for all full-time employees in one period, mark each as paid, and see the totals on the dashboard.

---

### Task 1.5 — Petty Cash module

**Estimated:** 12 hours

#### Sub-tasks

**1.5.1 — Cash boxes list**
- Card view: one card per cash box (Pleasant Grove, Provo)
- Shows: balance, last transaction, low-balance alert if applicable
- Click to enter detail view

**1.5.2 — Cash box detail view**
- Big balance display (mono, large number)
- Action buttons: Deposit, Expense
- Transactions table with filters (date range, category, type)
- Category breakdown chart (donut)
- Monthly trend chart

**1.5.3 — Record deposit**
- Amount
- Source (description)
- Optional receipt/document
- Performed by (auto-fill current user)
- Updates cash box balance immediately
- Audit log entry

**1.5.4 — Record expense**
- Amount
- Category (medical_supplies, transport, food, office, utilities, maintenance, other)
- Description
- **Receipt photo required** (validation)
- Updates cash box balance immediately
- Audit log entry

**1.5.5 — Reverse transaction**
- Same pattern as payment reversal
- Creates negative-amount entry linked to original

**1.5.6 — Low balance alerts**
- When balance drops below `lowBalanceThreshold`:
  - In-app notification to admin
  - Email to admin (via Resend)
  - Visual warning on dashboard

**1.5.7 — Reports**
- Per-clinic monthly report
- Consolidated multi-clinic report
- Export to PDF and Excel
- Includes category breakdown, total in/out, ending balance

**Acceptance:** Can record deposits and expenses with receipts, see real-time balance, and export reports.

---

### Task 1.6 — Main Dashboard with live KPIs

**Estimated:** 16 hours

#### Sub-tasks

**1.6.1 — KPI cards (4)**
- **Today's appointments:** count from `appointments` (will be 0 until Phase 3)
- **Active patients:** count from `patients` where status=ACTIVE (0 until Phase 3)
- **Monthly revenue:** sum of payments for current month
- **Pending tasks:** count from `tasks` (0 until Phase 2)
- Each card has a sparkline showing 14-day trend
- Click any card → drill-down to relevant module

**1.6.2 — Appointments by clinic panel**
- Empty state for now ("No appointments scheduled. Coming in Phase 3.")
- Will be populated in Phase 3

**1.6.3 — Activity feed**
- Real-time stream of audit log events (filtered to important ones)
- Updates via Supabase realtime subscription
- Last 20 events
- Click item → jump to source

**1.6.4 — Top referrers panels**
- Empty state for now
- Will be populated in Phase 3

**1.6.5 — Performance chart**
- 30-day chart (line)
- For Phase 1: shows just appointment counts (will be empty)
- Phase 3+: shows attended vs canceled

**1.6.6 — System health indicators**
- API status (always "operational" if loaded)
- DB status (ping check)
- Last attendance sync (Phase 2)
- Last metric calculation (Phase 2)
- Active agents (Phase 4)

**Acceptance:** Dashboard loads in <2s, KPIs reflect real data, empty states are friendly.

---

### Task 1.7 — Email integration (Resend)

**Estimated:** 8 hours

#### Sub-tasks

**1.7.1 — Set up Resend**
- Configure domain
- Get API key
- Add to env vars

**1.7.2 — Build email templates package**
- `packages/notifications/`
- Templates with `@react-email/components`:
  - `UserInvitation` (Phase 1)
  - `PasswordReset` (Phase 1)
  - `PaymentConfirmation` (Phase 1)
  - `LowCashBalance` (Phase 1)
- Each template supports ES and EN

**1.7.3 — Wire up triggers**
- User invitation: when admin creates new user
- Password reset: when user clicks "Forgot password"
- Payment confirmation: when admin marks payment as paid (sent to employee)
- Low cash balance: when balance drops below threshold

**1.7.4 — Email logs**
- Log every email sent in `audit_log`
- Show "Last 7 days emails" stat on admin dashboard

**Acceptance:** All trigger emails work and arrive in inbox correctly formatted.

---

### Task 1.8 — Notifications system (in-app)

**Estimated:** 8 hours

#### Sub-tasks

**1.8.1 — Notifications model**
- Already in schema (Phase 0/1)
- Supabase Realtime subscription per user

**1.8.2 — Notification bell in topbar**
- Shows unread count badge
- Click opens drawer
- Marks as read when opened

**1.8.3 — Notification drawer**
- Slides in from right
- Lists notifications grouped by date
- Each item: icon, title, body, timestamp
- Click action: navigate to relevant page
- "Mark all as read" button

**1.8.4 — Notification triggers**
- New payment received (employee)
- Payment confirmed (employee)
- Low cash balance (admin)
- New user invited (target user)
- User suspended (super admin)

**Acceptance:** Notifications appear in real-time, drawer works, marking-as-read persists.

---

### Task 1.9 — Command palette (⌘K)

**Estimated:** 6 hours

#### Sub-tasks

**1.9.1 — Install cmdk**
- Use `cmdk` library (composable command menu)

**1.9.2 — Build command palette UI**
- Open with ⌘K (Mac) / Ctrl+K (Windows)
- Search input
- Sectioned results:
  - Quick actions (Create employee, Record payment, etc.)
  - Navigation (Go to dashboard, Go to employees, etc.)
  - Recent items
  - Search results (employees by name)

**1.9.3 — Search backend**
- tRPC procedure: `search.global(query)`
- Searches: employees, users
- Returns categorized results

**Acceptance:** ⌘K opens palette, typing finds results, clicking navigates correctly.

---

### Task 1.10 — Settings module

**Estimated:** 8 hours

#### Sub-tasks

**1.10.1 — Settings layout**
- Sub-tabs: General, Templates, Integrations, Versions, API Keys, Backup
- Each in its own page

**1.10.2 — General settings**
- Company info (name, address, logo)
- Default language and theme
- Date/time format
- Timezone

**1.10.3 — Email templates view**
- Read-only for Phase 1 (full editor in Phase 3)
- Shows the templates being used

**1.10.4 — Integrations status**
- Read-only list of integrations and their status
- Resend: ✓ connected
- Supabase: ✓ connected
- Sentry: ✓ connected
- etc.

**1.10.5 — Versions & changelog**
- Auto-generated from Git tags
- Manual notes per version

**Acceptance:** Settings page loads, all sections visible, basic settings can be edited.

---

### Task 1.11 — Mobile optimizations

**Estimated:** 8 hours

#### Sub-tasks

**1.11.1 — Sidebar drawer**
- On `<768px`, sidebar becomes drawer
- Hamburger button in topbar
- Backdrop on open
- Swipe-to-close

**1.11.2 — Tables to cards**
- Tables convert to card view on mobile
- Each row becomes a card
- Critical info visible, secondary info expandable

**1.11.3 — Form layouts**
- Multi-step forms become single-column
- Inputs full-width
- Sticky action bar at bottom

**1.11.4 — Touch targets**
- All interactive elements ≥44x44px
- Adjust button heights on mobile

**Acceptance:** All Phase 1 features work perfectly on a 375px viewport.

---

## 📊 Phase 1 milestone review

After Phase 1, demo to the project lead:

1. Create a user, log in as that user
2. Create employees of all 3 types
3. Run payroll, mark payments as paid
4. Record petty cash transactions for both clinics
5. View dashboard with live KPIs
6. Search via ⌘K
7. Receive a notification (e.g., low cash balance)
8. Test on mobile

**Sign-off required before starting Phase 2.**

---

## ⚠️ Common pitfalls

- ❌ Building tables without considering mobile → painful retrofit
- ❌ Hardcoding currency to USD → painful when Phase 2 adds multi-currency
- ❌ Forgetting append-only on payments → audit problems later
- ❌ Skipping notification triggers → users feel disconnected
- ❌ Letting performance degrade → 4-second load times kill the demo

---

**Next:** `tasks/phase-2-finance.md`

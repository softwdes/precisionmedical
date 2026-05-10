# Phase 2 — Finance & Metrics

> **Duration:** 4-6 weeks
> **Goal:** Multi-currency wallets, FX operations, attendance sync, and the metrics engine.

---

## ✅ Definition of done for this phase

A super_admin can:
- Manage wallets in 3 currencies (USD, BOB, PEN)
- Record FX operations between wallets
- Run multi-currency payroll
- See employee attendance synced from external DB
- See live performance metrics for each employee
- Export performance reports

---

## 🎯 Tasks

### Task 2.1 — Extend schema for Phase 2

**Estimated:** 3 hours

Add models:
- `FxOperation`
- `Task`
- `AttendanceSync`
- `MetricSnapshot`

Run migration: `pnpm prisma migrate dev --name phase-2-models`

Update `Wallet` to support BOB and PEN (already in schema enum).

Update `Payment` to track `amountUsdEquiv` and `rateApplied` (already in schema).

---

### Task 2.2 — Multi-currency wallets

**Estimated:** 16 hours

#### Sub-tasks

**2.2.1 — Wallets list view**
- Card view: one card per wallet
- Shows: currency, country, balance (mono), last reconciled
- Group by country

**2.2.2 — Wallet detail page**
- Big balance display
- Recent transactions
- FX operations involving this wallet
- Reconciliation history

**2.2.3 — Reconciliation flow**
- Admin enters actual physical/bank balance
- System calculates discrepancy
- Discrepancy logged with note
- Wallet balance adjusted via reconciliation entry

**2.2.4 — Multi-currency display**
- Show amounts in their native currency by default
- Toggle to "show all in USD" using current rates
- Always display with currency code/symbol

**Acceptance:** Can view wallets across 3 currencies, see balances, and reconcile.

---

### Task 2.3 — FX Operations

**Estimated:** 14 hours

#### Sub-tasks

**2.3.1 — FX operations list view**
- Table: date, from wallet, to wallet, amount from, rate, amount to, fee
- Filters: date range, currencies involved
- Sort by date

**2.3.2 — Create FX operation form**
- Select from wallet
- Select to wallet (must be different currency)
- Enter amount from
- Enter rate (manual)
- Calculated amount to displayed
- Optional fee
- Optional exchange house name
- **Receipt photo required**
- Admin notes

**2.3.3 — Reference rates display**
- Show current reference rate (from exchangerate-api.com) for comparison
- Calculate difference (favorable vs unfavorable)
- Visual indicator (green if better than reference, red if worse)

**2.3.4 — Atomic transaction**
- All FX operations are atomic at the DB level (transaction)
- If anything fails, both wallets remain unchanged
- Both wallet balances updated in single commit

**2.3.5 — Reverse FX operation**
- Cannot edit, only reverse
- Creates inverse operation
- Both linked

**2.3.6 — FX history reports**
- Monthly summary
- Average effective rate per currency pair
- Total fees paid
- Export to PDF/Excel

**Acceptance:** Can record FX operation, both wallets reflect change, can reverse if needed.

---

### Task 2.4 — Multi-currency Payroll

**Estimated:** 12 hours

#### Sub-tasks

**2.4.1 — Update payment model usage**
- Each payment knows its local currency
- Each payment also tracks USD equivalent at time of payment
- Rate applied is recorded for audit

**2.4.2 — Bulk payroll generation across currencies**
- Select period
- System groups employees by country/currency
- For each currency: shows total in local currency + USD equivalent
- Admin enters/confirms rate for each currency
- Generates payment records grouped by currency

**2.4.3 — Wallet impact**
- Each payment debits the correct wallet
- Wallet balance updates immediately
- Insufficient balance check before generating

**2.4.4 — Payroll dashboard**
- Per-period view
- Total paid in each currency
- USD equivalent total
- Status breakdown (pending, paid, partial)

**2.4.5 — Export payroll report**
- Per-period PDF report
- Includes signature lines for compliance
- Per-employee breakdown

**Acceptance:** Run payroll for employees in 3 countries, all wallets debit correctly.

---

### Task 2.5 — External attendance DB sync

**Estimated:** 12 hours

#### Sub-tasks

**2.5.1 — Connection setup**
- Configure read-only connection to external DB
- Add to env vars
- Test connection

**2.5.2 — Sync function**
- Vercel Cron job at 2am daily
- Pulls yesterday's attendance records
- Maps external `employee_id` to our `Employee.externalId`
- Upserts into `AttendanceSync` table
- Logs sync result

**2.5.3 — Sync status UI**
- Settings page section: "External integrations"
- Shows: last successful sync, last attempted sync, total records synced
- Manual "Sync now" button
- Error log if sync failed

**2.5.4 — Late detection**
- Define schedule per employee (or per department)
- On sync, calculate `isLate` based on schedule
- Mark `isAbsent` if no clock-in for the day

**2.5.5 — Attendance view per employee**
- In employee detail page, new tab: "Attendance"
- Calendar view showing: present, late, absent
- Statistics: punctuality rate, total hours
- Date range filter

**2.5.6 — Failure handling**
- Retry up to 3 times with exponential backoff
- After final failure: alert admin via Resend
- Log failure in `audit_log`

**Acceptance:** Attendance data appears in the system overnight, employee tabs show calendar.

---

### Task 2.6 — Tasks module

**Estimated:** 12 hours

#### Sub-tasks

**2.6.1 — Task CRUD**
- Admin/Supervisor can create tasks
- Assign to employee
- Set due date
- Optional supervisor for review
- Priority level

**2.6.2 — Tasks list view**
- All tasks (admin) or My tasks (employee)
- Filters: status, priority, assignee, due date
- Group by status (board view) or list view

**2.6.3 — Task detail page**
- Full description
- Status workflow: ASSIGNED → IN_PROGRESS → DELIVERED → REVIEWED
- Comments thread (optional)
- Attachments (optional)

**2.6.4 — Task review/quality scoring**
- Supervisor can rate (1-5)
- Optional feedback
- Score affects employee's quality KPI

**2.6.5 — Late task detection**
- If `dueDate < now()` and not delivered → flagged as late
- Affects "tasks on time" KPI

**2.6.6 — Bulk task creation**
- Templates for recurring tasks
- Bulk assign via CSV import (optional)

**Acceptance:** Tasks can be created, assigned, completed, and rated.

---

### Task 2.7 — Metrics engine

**Estimated:** 16 hours

#### Sub-tasks

**2.7.1 — Calculation logic in `packages/metrics/`**
- Function: `calculateEmployeeScore(employeeId, date)` → returns scores
- Calculates 5 KPIs:
  - Punctuality: from `AttendanceSync`
  - Tasks on time: from `Task` (delivered before dueDate)
  - Productivity: from `Task` (completed / assigned)
  - Quality: from `Task.qualityRating`
  - Attendance: from `AttendanceSync.isAbsent`
- Computes weighted global score
- Assigns grade (A+, A, B, C, D)

**2.7.2 — Snapshot storage**
- Nightly job at 3am
- For each active employee:
  - Compute score for yesterday
  - Save to `MetricSnapshot`
- Idempotent (re-running doesn't duplicate)

**2.7.3 — Performance dashboard**
- Per-employee detail page, "Performance" tab
- Big score number with grade badge
- 5 KPI mini-cards
- 30-day score evolution chart
- Last 10 events that affected the score

**2.7.4 — Department ranking**
- Module: Employees > Performance Metrics
- Table: rank, employee, department, score, trend
- Filterable by department, period
- Top performers visible
- Bottom performers (admin-only view)

**2.7.5 — Comparative view**
- Employee vs department average
- Department vs company average
- Visualized as deltas

**2.7.6 — Alerts**
- Score drops >10% in a week → notify supervisor
- Recurring absences (3+ in week) → notify supervisor + admin
- Multiple overdue tasks → notify admin

**2.7.7 — Reports**
- Per-employee monthly report (PDF)
- Department quarterly report (PDF)
- Export to Excel

**Acceptance:** Every employee has a daily score that updates overnight; dashboard shows trends.

---

### Task 2.8 — Finance reports

**Estimated:** 8 hours

#### Sub-tasks

**2.8.1 — Reports page in Finance module**
- Date range selector
- Currency selector (or "all currencies in USD")

**2.8.2 — Income/Expense report**
- Group by category
- Comparative (vs previous period)
- Charts (bar, donut)
- Export PDF/Excel

**2.8.3 — Wallet reconciliation report**
- Per-wallet history
- Discrepancies log

**2.8.4 — FX summary**
- Total volume per currency pair
- Average rate
- Total fees

**Acceptance:** All reports generate correctly with real data.

---

### Task 2.9 — Performance optimizations

**Estimated:** 6 hours

#### Sub-tasks

**2.9.1 — Database indexes**
- Verify all indexes from `DATA_MODEL.md` are in place
- Add missing indexes for slow queries (use `EXPLAIN ANALYZE`)

**2.9.2 — Query optimization**
- Use Prisma `select` to fetch only needed fields
- Avoid N+1 queries (use `include` strategically)
- Add caching where appropriate (e.g., reference rates)

**2.9.3 — Pagination**
- All list views must paginate
- Default page size: 25
- Infinite scroll for activity feeds

**Acceptance:** All Phase 1+2 list views load in <500ms with 1000+ records.

---

## 📊 Phase 2 milestone review

After Phase 2, demo to the project lead:

1. Show wallet balances in 3 currencies
2. Record an FX operation, see both wallets update
3. Run payroll for employees in different countries
4. Show attendance data synced overnight
5. Show performance metrics for an employee
6. Generate a performance report
7. Show an alert triggered by a score drop

**Sign-off required before starting Phase 3.**

---

## ⚠️ Common pitfalls

- ❌ Forgetting to wrap FX operations in DB transactions → can leave balances inconsistent
- ❌ Calculating metrics on the fly → too slow; use snapshots
- ❌ Not testing the attendance sync with real external data → surprises at go-live
- ❌ Allowing edits to FX operations → audit trail broken
- ❌ Skipping pagination → tables time out

---

**Next:** `tasks/phase-3-portals.md`

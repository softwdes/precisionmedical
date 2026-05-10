# Phase 3 — External Portals (Lawyers & Providers)

> **Duration:** 6-8 weeks
> **Goal:** Build the lawyer and provider modules + their dedicated portals with referrals and commissions.

---

## ✅ Definition of done for this phase

- A lawyer can log in at `/lawyers`, see their dashboard, refer a patient via the calendar, and track commissions
- A provider can log in at `/providers`, see their dashboard, receive clinical referrals, and track services
- An admin can configure commission schemes, approve commissions, and view referral analytics
- Patients flow through the system from referral → appointment → completion → commission

---

## 🎯 Tasks

### Task 3.1 — Extend schema for Phase 3

**Estimated:** 4 hours

Add models:
- `Lawyer` (entity types: FIRM, INDEPENDENT, FIRM_MEMBER)
- `Provider` (with specialty)
- `ServiceTariff` (provider service prices)
- `Patient` (referrer can be lawyer OR provider)
- `Clinic` (Pleasant Grove, Provo seeded)
- `Appointment`
- `CommissionConfig`
- `Commission`

Run migration: `pnpm prisma migrate dev --name phase-3-models`

Configure RLS for all new tables (strict for patient data).

---

### Task 3.2 — Lawyers module (admin)

**Estimated:** 18 hours

#### Sub-tasks

**3.2.1 — Lawyers list view**
- Tabs: Firms, Independents, All
- Table: name/firm, contact, status, this-month referrals, this-month commissions
- Filters: status, entity type, performance

**3.2.2 — Create/edit lawyer form**
- Type: Firm or Independent
- For firms: firm name, members (link existing or create)
- Personal/firm details
- Status
- Optional: link to User account (creates portal access)

**3.2.3 — Lawyer detail page**
- Tabs:
  - Overview (stats, contact, recent referrals)
  - Referred patients
  - Commissions
  - Commission config
  - Documents
  - Activity log

**3.2.4 — Commission configuration**
- Select scheme:
  - FLAT_PER_REFERRAL: enter amount
  - PERCENTAGE_OF_BILLING: enter %
  - VOLUME_TIER: build tier table
  - HYBRID: configure combination
- Effective date range
- Preview calculation with sample numbers
- ⚠️ Show legal disclaimer about anti-kickback compliance

**3.2.5 — Bulk operations**
- Bulk activate/deactivate
- Bulk update commission scheme

**Acceptance:** Can create a firm with members, configure commissions, and see them in list/detail views.

---

### Task 3.3 — Providers module (admin)

**Estimated:** 14 hours

#### Sub-tasks

Similar structure to Lawyers, but with these differences:

**3.3.1 — Specialty enum**
- RADIOLOGY, NEUROLOGY, ORTHOPEDICS, PHYSICAL_THERAPY, CHIROPRACTIC, PAIN_MANAGEMENT, PSYCHOLOGY, GENERAL, OTHER

**3.3.2 — Service tariffs**
- Provider can have multiple services with prices
- Used in clinical referrals to estimate costs

**3.3.3 — License tracking**
- License number field
- Expiration date (with warning when <60 days)

**3.3.4 — Detail page differences**
- Tab: "Services rendered" instead of just "patients referred"
- Tab: "Service tariffs" for managing prices

**Acceptance:** Can manage providers similarly to lawyers, with specialty filters.

---

### Task 3.4 — Patients module

**Estimated:** 12 hours

#### Sub-tasks

**3.4.1 — Patients list view**
- Table: code, name, accident date, referrer, status, last appointment
- Filters: status, accident type, referrer (lawyer/provider), date range
- Search by name, code, phone

**3.4.2 — Create patient form**
- Personal info (firstName, lastName, email, phone, DOB)
- Accident info (date, type, insurance, policy)
- Referrer (select lawyer OR provider)
- Auto-generate patient code (`P-2026-XXXX`)

**3.4.3 — Patient detail page**
- Tabs:
  - Overview
  - Appointments (list + calendar)
  - Documents (medical records, intake forms)
  - Activity timeline
  - Notes

**3.4.4 — Patient documents**
- Upload to `medical-docs/` Supabase bucket
- Strict RLS (only treating clinic + admin + patient's referrer with consent)

**Acceptance:** Can create patient, link to referrer, manage appointments.

---

### Task 3.5 — Calendar & Appointments

**Estimated:** 20 hours

#### Sub-tasks

**3.5.1 — Calendar component**
- Use `react-big-calendar` or `@fullcalendar/react`
- Match design system styling (custom CSS)
- Views: Month, Week, Day, Agenda
- Filters: clinic, provider, type

**3.5.2 — Availability configuration**
- Per clinic: opening hours
- Per provider: available hours, blocked dates, vacation
- Configurable in admin settings

**3.5.3 — Create appointment**
- From admin: full form
- From lawyer portal: simplified form (auto-fills referrer)
- From provider portal: clinical referral with diagnostic info
- Type: Auto Accident, Family Practice, Urgent Care, Follow-up, Consultation
- Conflict detection (no overlap with existing)

**3.5.4 — Appointment lifecycle**
- SCHEDULED → CONFIRMED → IN_PROGRESS → COMPLETED
- Or: CANCELLED, NO_SHOW
- Each transition logs to audit + sends notifications

**3.5.5 — Reminders**
- 24h before: email reminder via Resend
- Day-of: optional SMS (Twilio, future)

**3.5.6 — Calendar in portals**
- Lawyers see availability for booking referrals
- Providers see their own appointments

**Acceptance:** Calendar displays appointments, lawyers can book through portal, conflict detection works.

---

### Task 3.6 — Lawyer Portal

**Estimated:** 24 hours

#### Sub-tasks

**3.6.1 — Portal layout**
- Login at `/lawyers`
- Different sidebar (lawyer-specific menu)
- Lawyer's name + firm in topbar
- Limited modules visible

**3.6.2 — Lawyer dashboard**
- KPI cards:
  - Active patients (their referrals)
  - This month referrals
  - This month commissions earned
  - Commissions paid YTD
- Chart: referrals over time
- Recent activity (their patients)
- Top performing case types (if relevant)

**3.6.3 — My patients view**
- Table of patients they referred
- Filters: status, date range
- Privacy: only basic info + appointment status (per consent)
- No detailed medical records (unless explicit consent)

**3.6.4 — Refer new patient**
- Form to refer
- Patient basic info
- Accident details
- Insurance info
- Calendar selection (book first appointment)
- Submit creates patient + appointment + initial commission record (status=EARNED)

**3.6.5 — My commissions view**
- Table: patient code, date earned, amount, status
- Filter: status, date range
- Total summary cards (earned, paid, pending)
- Download CSV

**3.6.6 — Documents shared with me**
- Documents the clinic has shared (e.g., invoices, medical reports the patient consented to share)
- Download, request more info

**3.6.7 — Profile management**
- Update contact info
- Change password
- MFA setup

**3.6.8 — Notifications**
- New referral confirmed
- Commission earned
- Commission paid
- Patient appointment reminder

**Acceptance:** A lawyer can log in, refer a patient, see commission accrue, and download a report.

---

### Task 3.7 — Provider Portal

**Estimated:** 20 hours

Similar to Lawyer Portal but with these differences:

**3.7.1 — Specialty-filtered calendar**
- Calendar shows only appointments for their specialty
- Their availability blocks other specialties from being booked at same time

**3.7.2 — Clinical referral form**
- Initial diagnosis
- Requested studies (radiology, blood work, etc.)
- Urgency level
- Patient consent for clinical info sharing

**3.7.3 — Services rendered view**
- Table of services completed for patients
- Status: Pending → Approved → Paid
- Linked to commissions

**3.7.4 — Patient outcome tracking**
- With consent: see treatment progress
- Add follow-up notes (visible to clinic)

**Acceptance:** Provider can manage their schedule, refer/receive patients, and track services.

---

### Task 3.8 — Commission engine

**Estimated:** 14 hours

#### Sub-tasks

**3.8.1 — Trigger logic**
- When patient appointment moves to COMPLETED:
  - Look up referrer
  - Look up active CommissionConfig
  - Calculate commission based on scheme
  - Create Commission record with status=EARNED
  - Notify referrer

**3.8.2 — Calculation engine**
- `packages/commissions/` with calculation functions
- Each scheme has its own calculator:
  - Flat: simple amount
  - Percentage: requires billing amount
  - Tier: lookup based on monthly count
  - Hybrid: combination logic

**3.8.3 — Commission lifecycle**
- EARNED → APPROVED → PAID
- Or: CANCELLED, REVERSED (append-only)

**3.8.4 — Bulk approval**
- Admin can bulk-approve commissions for a period
- Each approval logged

**3.8.5 — Bulk payout**
- Generate payment to lawyer/provider's bank account
- Mark commissions as PAID
- Upload proof
- Notify referrer

**3.8.6 — Commission dashboard for admins**
- Total earned this month
- Total paid this month
- Pending approval queue
- Charts and breakdowns

**Acceptance:** Commission engine runs end-to-end: appointment completes → commission generated → admin approves → payment recorded → referrer notified.

---

### Task 3.9 — Email templates for Phase 3

**Estimated:** 6 hours

Add templates:
- `NewReferral` (admin gets, when lawyer/provider refers)
- `ReferralConfirmed` (referrer gets)
- `CommissionEarned` (referrer gets)
- `CommissionPaid` (referrer gets)
- `AppointmentReminder` (patient gets)
- `AppointmentReminderInternal` (provider gets)
- `WeeklyReferralDigest` (lawyer/provider gets)

All bilingual.

**Acceptance:** All email triggers work and look great.

---

### Task 3.10 — Dashboard Phase 3 enhancements

**Estimated:** 6 hours

Update main admin dashboard:
- Top referring lawyers (top 5 of month) — populate the panel
- Top referring providers (top 5 of month) — populate the panel
- Commission summary card: earned, paid, pending
- Performance chart shows real appointment data (attended vs canceled)
- Real appointments by clinic in the appointments panel

**Acceptance:** Dashboard fully populated with live referral and appointment data.

---

### Task 3.11 — Reports for Phase 3

**Estimated:** 8 hours

#### Sub-tasks

- **Referral analytics report:** Source breakdown, conversion rates, geographic distribution
- **Commission report:** Per lawyer/provider, per period, with all details for legal audit
- **Patient flow report:** Referral → appointment → completion funnel
- **Per-lawyer/provider statement:** PDF document with all their activity for a period

All exportable to PDF and Excel.

**Acceptance:** All reports generate correctly with proper formatting.

---

### Task 3.12 — Compliance documentation

**Estimated:** 6 hours

⚠️ **CRITICAL** — Anti-kickback compliance.

#### Sub-tasks

**3.12.1 — Audit trail**
- Every commission has full provenance:
  - Which patient triggered it
  - Which scheme was active
  - Calculation details
  - Approval chain

**3.12.2 — Documentation generation**
- Per-quarter compliance report
- Includes:
  - All active commission schemes
  - All commissions earned
  - All commissions paid
  - Anomalies flagged

**3.12.3 — Anomaly detection**
- Flag unusual patterns:
  - Sudden spike in referrals from one source
  - High-value commissions that need review
  - Repeated reversals
- Alert super_admin

**3.12.4 — Legal review checkpoint**
- "For legal review" section in admin
- Mark records as "reviewed by legal" with timestamp + reviewer

**Acceptance:** Compliance reports generate, anomalies surface for review.

---

## 📊 Phase 3 milestone review

After Phase 3, demo to the project lead:

1. Create a lawyer + a provider
2. Configure commission schemes for both
3. Lawyer logs in to portal, refers a patient via calendar
4. Patient appointment is completed
5. Commission is automatically generated
6. Admin approves and records payment
7. Lawyer sees commission in their dashboard
8. Generate a per-lawyer report

**Sign-off required before starting Phase 4.**

---

## ⚠️ Common pitfalls

- ❌ Building portals as separate apps from scratch → reuse the same packages
- ❌ Allowing lawyers to see other lawyers' patients → privacy violation
- ❌ Not enforcing patient consent → HIPAA risk
- ❌ Skipping anti-kickback documentation → legal exposure
- ❌ Over-sharing patient PHI in lawyer dashboard → compliance issue
- ❌ Forgetting to log commission scheme changes → audit trail broken

---

**Next:** `tasks/phase-4-ai.md`

# Data Model · LM Super Admin

> Database schema design with Prisma. This document defines all entities and their relationships.

---

## Schema overview

The schema is divided into logical groups:

1. **Identity** — Users, roles, sessions
2. **Workforce** — Employees, departments, attendance, tasks
3. **Finance** — Wallets, FX, payments, cash boxes
4. **External relations** — Lawyers, providers, patients, appointments
5. **Commissions** — Referrals, commissions, payouts
6. **AI** — Agents, actions, executions
7. **System** — Audit log, settings, translations

---

## 1. Identity

```prisma
// User: central identity for ALL system users
model User {
  id               String    @id @default(cuid())
  email            String    @unique
  emailVerifiedAt  DateTime?
  passwordHash     String?   // null if SSO only
  
  firstName        String
  lastName         String
  avatarUrl        String?
  phone            String?
  
  role             UserRole
  status           UserStatus @default(ACTIVE)
  
  preferredLocale  Locale     @default(es)
  preferredTheme   Theme      @default(dark)
  
  // MFA
  mfaEnabled       Boolean    @default(false)
  mfaSecret        String?    // encrypted
  
  // Linked entities (nullable, only one is typically set)
  employee         Employee?
  lawyer           Lawyer?
  provider         Provider?
  
  // Activity
  lastLoginAt      DateTime?
  lastLoginIp      String?
  
  sessions         Session[]
  notifications    Notification[]
  agentActions     AgentAction[] @relation("ReviewedBy")
  auditLogs        AuditLog[]    @relation("ActorUser")
  
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  deletedAt        DateTime?  // soft delete
  
  @@index([email])
  @@index([role])
  @@index([status])
}

enum UserRole {
  SUPER_ADMIN
  ADMIN
  EMPLOYEE
  LAWYER
  PROVIDER
  AUDITOR_AI       // system role for the AI agent
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  PENDING_VERIFICATION
}

enum Locale {
  es
  en
}

enum Theme {
  light
  dark
}

// Session tracking for active devices
model Session {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  ipAddress     String?
  userAgent     String?
  device        String?   // "Mac · Chrome"
  
  expiresAt     DateTime
  revokedAt     DateTime?
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@index([userId])
  @@index([expiresAt])
}

// Permission system (granular per module + action)
model Permission {
  id        String   @id @default(cuid())
  module    String   // "employees", "finance", "lawyers", etc.
  action    String   // "read", "write", "delete", "approve"
  
  rolePermissions RolePermission[]
  
  @@unique([module, action])
}

model RolePermission {
  id            String     @id @default(cuid())
  role          UserRole
  permissionId  String
  permission    Permission @relation(fields: [permissionId], references: [id])
  
  @@unique([role, permissionId])
}
```

---

## 2. Workforce

```prisma
model Employee {
  id              String          @id @default(cuid())
  userId          String?         @unique
  user            User?           @relation(fields: [userId], references: [id])
  
  employeeCode    String          @unique  // "EMP-2026-0142"
  
  firstName       String
  lastName        String
  email           String
  phone           String?
  photoUrl        String?
  
  // Location & legal
  countryId       String
  country         Country         @relation(fields: [countryId], references: [id])
  city            String?
  
  // Employment
  type            EmploymentType
  startDate       DateTime
  endDate         DateTime?
  
  departmentId    String
  department      Department      @relation(fields: [departmentId], references: [id])
  position        String
  
  supervisorId    String?
  supervisor      Employee?       @relation("Supervision", fields: [supervisorId], references: [id])
  reports         Employee[]      @relation("Supervision")
  
  // Compensation
  baseSalary      Decimal?        @db.Decimal(12, 2)
  baseCurrency    Currency
  hourlyRate      Decimal?        @db.Decimal(10, 2)  // for contractors
  paymentMethod   PaymentMethod?
  bankAccount     String?         // encrypted
  
  // Status
  status          EmployeeStatus  @default(ACTIVE)
  
  // Relations
  payments        Payment[]
  tasks           Task[]          @relation("AssignedTo")
  reviewedTasks   Task[]          @relation("Supervisor")
  attendanceSync  AttendanceSync[]
  metricSnapshots MetricSnapshot[]
  documents       EmployeeDocument[]
  
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  deletedAt       DateTime?
  
  @@index([countryId])
  @@index([type])
  @@index([status])
  @@index([departmentId])
}

enum EmploymentType {
  FULL_TIME
  EXTERNAL
  CONTRACTOR
}

enum EmployeeStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  ON_LEAVE
}

enum PaymentMethod {
  BANK_TRANSFER
  CASH
  ZELLE
  WIRE
  OTHER
}

model Country {
  id          String     @id @default(cuid())
  code        String     @unique  // "US", "BO", "PE"
  name        String
  currency    Currency
  
  employees   Employee[]
  wallets     Wallet[]
}

model Department {
  id          String     @id @default(cuid())
  name        String     @unique
  description String?
  
  employees   Employee[]
}

model EmployeeDocument {
  id          String         @id @default(cuid())
  employeeId  String
  employee    Employee       @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  
  type        DocumentType
  name        String
  fileUrl     String
  uploadedBy  String
  
  createdAt   DateTime       @default(now())
}

enum DocumentType {
  CONTRACT
  ID
  NDA
  TAX_FORM
  OTHER
}

// Attendance synced from external DB (READ-ONLY in our system)
model AttendanceSync {
  id              String    @id @default(cuid())
  employeeId      String
  employee        Employee  @relation(fields: [employeeId], references: [id])
  
  date            DateTime  @db.Date
  
  clockIn         DateTime?
  breakStart      DateTime?
  breakEnd        DateTime?
  clockOut        DateTime?
  
  totalHours      Decimal?  @db.Decimal(5, 2)
  isLate          Boolean   @default(false)
  isAbsent        Boolean   @default(false)
  
  externalId      String?   // ID from the external system
  syncedAt        DateTime  @default(now())
  
  @@unique([employeeId, date])
  @@index([employeeId])
  @@index([date])
}

model Task {
  id              String      @id @default(cuid())
  
  title           String
  description     String?
  
  assigneeId      String
  assignee        Employee    @relation("AssignedTo", fields: [assigneeId], references: [id])
  
  supervisorId    String?
  supervisor      Employee?   @relation("Supervisor", fields: [supervisorId], references: [id])
  
  status          TaskStatus  @default(ASSIGNED)
  priority        TaskPriority @default(NORMAL)
  
  assignedDate    DateTime    @default(now())
  dueDate         DateTime
  completedDate   DateTime?
  
  // Quality review
  qualityRating   Int?        // 1-5
  qualityFeedback String?
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@index([assigneeId])
  @@index([status])
  @@index([dueDate])
}

enum TaskStatus {
  ASSIGNED
  IN_PROGRESS
  DELIVERED
  REVIEWED
  REJECTED
  CANCELLED
}

enum TaskPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

// Computed metrics (snapshot per employee per day)
model MetricSnapshot {
  id              String    @id @default(cuid())
  employeeId      String
  employee        Employee  @relation(fields: [employeeId], references: [id])
  
  date            DateTime  @db.Date
  
  punctualityScore   Decimal  @db.Decimal(5, 2)  // 0-100
  taskOnTimeScore    Decimal  @db.Decimal(5, 2)
  productivityScore  Decimal  @db.Decimal(5, 2)
  qualityScore       Decimal  @db.Decimal(5, 2)
  attendanceScore    Decimal  @db.Decimal(5, 2)
  
  globalScore        Decimal  @db.Decimal(5, 2)  // weighted composite
  grade              Grade
  
  computedAt         DateTime @default(now())
  
  @@unique([employeeId, date])
  @@index([date])
  @@index([globalScore])
}

enum Grade {
  A_PLUS  // 95-100
  A       // 85-94
  B       // 70-84
  C       // 50-69
  D       // <50
}
```

---

## 3. Finance

```prisma
enum Currency {
  USD
  BOB  // Bolivian Boliviano
  PEN  // Peruvian Sol
}

// Virtual wallet per currency (could be split per country if needed)
model Wallet {
  id            String         @id @default(cuid())
  currency      Currency
  countryId     String
  country       Country        @relation(fields: [countryId], references: [id])
  
  name          String         // "USD Main", "BOB La Paz"
  balance       Decimal        @db.Decimal(15, 2) @default(0)
  
  // Audit
  lastReconciledAt DateTime?
  lastReconciledBy String?
  
  // Relations
  fxFromOps     FxOperation[]  @relation("FromWallet")
  fxToOps       FxOperation[]  @relation("ToWallet")
  payments      Payment[]
  
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  
  @@unique([currency, countryId])
}

// FX operation: sell from one wallet to buy another
model FxOperation {
  id              String    @id @default(cuid())
  
  fromWalletId    String
  fromWallet      Wallet    @relation("FromWallet", fields: [fromWalletId], references: [id])
  
  toWalletId      String
  toWallet        Wallet    @relation("ToWallet", fields: [toWalletId], references: [id])
  
  amountFrom      Decimal   @db.Decimal(15, 2)
  amountTo        Decimal   @db.Decimal(15, 2)
  rate            Decimal   @db.Decimal(12, 6)
  fee             Decimal   @db.Decimal(10, 2) @default(0)
  
  exchangeHouse   String?   // "Casa de Cambio Sopocachi"
  receiptUrl      String?
  notes           String?
  
  performedById   String
  performedAt     DateTime  @default(now())
  
  // Reversals
  reversedById    String?   // ID of the reversal operation
  
  createdAt       DateTime  @default(now())
  
  @@index([fromWalletId])
  @@index([toWalletId])
  @@index([performedAt])
}

// Payment to employee/contractor
model Payment {
  id                String        @id @default(cuid())
  
  employeeId        String
  employee          Employee      @relation(fields: [employeeId], references: [id])
  
  walletId          String
  wallet            Wallet        @relation(fields: [walletId], references: [id])
  
  period            String        // "2026-05" or "2026-W19"
  
  amountLocal       Decimal       @db.Decimal(12, 2)
  currencyLocal     Currency
  amountUsdEquiv    Decimal       @db.Decimal(12, 2)
  rateApplied       Decimal       @db.Decimal(12, 6)
  
  status            PaymentStatus @default(PENDING)
  
  scheduledDate     DateTime
  paidDate          DateTime?
  
  proofUrl          String?
  notes             String?
  
  // Append-only: edits create reversals
  reversedById      String?
  
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  
  @@index([employeeId])
  @@index([period])
  @@index([status])
}

enum PaymentStatus {
  PENDING
  SCHEDULED
  PAID
  PARTIAL
  CANCELLED
  REVERSED
}

// Petty cash boxes
model CashBox {
  id            String              @id @default(cuid())
  name          String              @unique  // "Pleasant Grove Box", "Provo Box"
  clinicId      String?
  
  currency      Currency            @default(USD)
  balance       Decimal             @db.Decimal(12, 2) @default(0)
  lowBalanceThreshold Decimal       @db.Decimal(12, 2) @default(100)
  
  responsibleUserId String?
  
  transactions  CashTransaction[]
  
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
}

model CashTransaction {
  id            String              @id @default(cuid())
  cashBoxId     String
  cashBox       CashBox             @relation(fields: [cashBoxId], references: [id])
  
  type          CashTransactionType
  amount        Decimal             @db.Decimal(12, 2)
  
  category      CashCategory
  description   String
  
  receiptUrl    String?
  
  performedById String
  performedAt   DateTime            @default(now())
  
  // Append-only
  reversedById  String?
  
  createdAt     DateTime            @default(now())
  
  @@index([cashBoxId])
  @@index([performedAt])
  @@index([category])
}

enum CashTransactionType {
  DEPOSIT      // money in
  EXPENSE      // money out
}

enum CashCategory {
  MEDICAL_SUPPLIES
  TRANSPORT
  FOOD
  OFFICE
  UTILITIES
  MAINTENANCE
  OTHER
}
```

---

## 4. External relations

```prisma
model Lawyer {
  id              String         @id @default(cuid())
  userId          String?        @unique
  user            User?          @relation(fields: [userId], references: [id])
  
  // Entity type
  entityType      LawyerEntityType
  
  // For individuals
  firstName       String?
  lastName        String?
  
  // For firms
  firmName        String?
  
  // If individual is part of a firm
  parentFirmId    String?
  parentFirm      Lawyer?        @relation("FirmMembers", fields: [parentFirmId], references: [id])
  members         Lawyer[]       @relation("FirmMembers")
  
  email           String         @unique
  phone           String?
  address         String?
  
  status          ExternalStatus @default(ACTIVE)
  
  // Commission configuration
  commissionConfig CommissionConfig?
  
  // Relations
  referrals       Patient[]      @relation("LawyerReferrer")
  commissions     Commission[]   @relation("LawyerCommission")
  
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  deletedAt       DateTime?
}

enum LawyerEntityType {
  FIRM
  INDEPENDENT
  FIRM_MEMBER
}

model Provider {
  id              String         @id @default(cuid())
  userId          String?        @unique
  user            User?          @relation(fields: [userId], references: [id])
  
  firstName       String
  lastName        String
  
  email           String         @unique
  phone           String?
  
  specialty       Specialty
  licenseNumber   String?
  
  status          ExternalStatus @default(ACTIVE)
  
  // Service tariffs
  serviceTariffs  ServiceTariff[]
  
  // Relations
  referrals       Patient[]      @relation("ProviderReferrer")
  commissions     Commission[]   @relation("ProviderCommission")
  appointments    Appointment[]
  
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  deletedAt       DateTime?
}

enum ExternalStatus {
  ACTIVE
  INACTIVE
  PENDING_APPROVAL
  TERMINATED
}

enum Specialty {
  RADIOLOGY
  NEUROLOGY
  ORTHOPEDICS
  PHYSICAL_THERAPY
  CHIROPRACTIC
  PAIN_MANAGEMENT
  PSYCHOLOGY
  GENERAL
  OTHER
}

model ServiceTariff {
  id          String     @id @default(cuid())
  providerId  String
  provider    Provider   @relation(fields: [providerId], references: [id])
  
  serviceName String
  amount      Decimal    @db.Decimal(10, 2)
  currency    Currency   @default(USD)
}

// Patient referred by a lawyer or provider
model Patient {
  id              String          @id @default(cuid())
  
  patientCode     String          @unique  // "P-2026-0001"
  
  firstName       String
  lastName        String
  email           String?
  phone           String?
  dateOfBirth     DateTime?
  
  // Accident info
  accidentDate    DateTime?
  accidentType    AccidentType?
  insuranceCarrier String?
  policyNumber    String?
  
  // Referrer (one of these)
  lawyerReferrerId    String?
  lawyerReferrer      Lawyer?    @relation("LawyerReferrer", fields: [lawyerReferrerId], references: [id])
  
  providerReferrerId  String?
  providerReferrer    Provider?  @relation("ProviderReferrer", fields: [providerReferrerId], references: [id])
  
  status          PatientStatus  @default(NEW)
  
  // Relations
  appointments    Appointment[]
  commissions     Commission[]
  
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  
  @@index([lawyerReferrerId])
  @@index([providerReferrerId])
  @@index([status])
}

enum PatientStatus {
  NEW
  ACTIVE
  COMPLETED
  DISCHARGED
  INACTIVE
}

enum AccidentType {
  AUTO
  MOTORCYCLE
  PEDESTRIAN
  WORKPLACE
  OTHER
}

model Clinic {
  id          String    @id @default(cuid())
  name        String    @unique  // "Pleasant Grove", "Provo"
  address     String?
  phone       String?
  
  appointments Appointment[]
}

model Appointment {
  id              String              @id @default(cuid())
  
  patientId       String
  patient         Patient             @relation(fields: [patientId], references: [id])
  
  clinicId        String
  clinic          Clinic              @relation(fields: [clinicId], references: [id])
  
  providerId      String?
  provider        Provider?           @relation(fields: [providerId], references: [id])
  
  scheduledFor    DateTime
  durationMinutes Int                 @default(30)
  
  type            AppointmentType
  status          AppointmentStatus   @default(SCHEDULED)
  
  notes           String?
  
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  
  @@index([patientId])
  @@index([clinicId])
  @@index([scheduledFor])
  @@index([status])
}

enum AppointmentType {
  AUTO_ACCIDENT
  FAMILY_PRACTICE
  URGENT_CARE
  FOLLOW_UP
  CONSULTATION
}

enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
  PENDING
}
```

---

## 5. Commissions

```prisma
model CommissionConfig {
  id                String          @id @default(cuid())
  lawyerId          String          @unique
  lawyer            Lawyer          @relation(fields: [lawyerId], references: [id])
  
  scheme            CommissionScheme
  
  // For FLAT_PER_REFERRAL
  flatAmount        Decimal?        @db.Decimal(10, 2)
  
  // For PERCENTAGE_OF_BILLING
  percentage        Decimal?        @db.Decimal(5, 2)  // 0-100
  
  // For VOLUME_TIER
  tiers             Json?           // [{min: 1, max: 5, rate: 100}, ...]
  
  // For HYBRID
  hybridConfig      Json?
  
  effectiveFrom     DateTime
  effectiveTo       DateTime?
  
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

enum CommissionScheme {
  FLAT_PER_REFERRAL
  PERCENTAGE_OF_BILLING
  VOLUME_TIER
  HYBRID
}

model Commission {
  id                String              @id @default(cuid())
  
  // Earner (one of these)
  lawyerId          String?
  lawyer            Lawyer?             @relation("LawyerCommission", fields: [lawyerId], references: [id])
  
  providerId        String?
  provider          Provider?           @relation("ProviderCommission", fields: [providerId], references: [id])
  
  // Source
  patientId         String
  patient           Patient             @relation(fields: [patientId], references: [id])
  
  // Amount
  amount            Decimal             @db.Decimal(12, 2)
  currency          Currency            @default(USD)
  
  // Lifecycle
  status            CommissionStatus    @default(EARNED)
  earnedAt          DateTime            @default(now())
  paidAt            DateTime?
  paidProofUrl      String?
  
  // Append-only
  reversedById      String?
  
  notes             String?
  
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  
  @@index([lawyerId])
  @@index([providerId])
  @@index([status])
  @@index([earnedAt])
}

enum CommissionStatus {
  EARNED         // generated but not yet paid
  APPROVED       // approved for payment
  PAID
  CANCELLED
  REVERSED
}
```

---

## 6. AI Agents

```prisma
model Agent {
  id                  String          @id @default(cuid())
  
  name                String          @unique  // "CIFO", "Audit Agent"
  type                AgentType
  description         String
  
  status              AgentStatus     @default(IDLE)
  mode                AgentMode       @default(MANUAL)
  
  schedule            String?         // cron expression for periodic agents
  
  // Capabilities
  permissions         String[]        // ["read:codebase", "write:fixes", ...]
  budgetMonthlyUsd    Decimal         @db.Decimal(10, 2) @default(100)
  
  // LLM config
  llmProvider         LlmProvider     @default(ANTHROPIC)
  llmModel            String          @default("claude-3-5-sonnet")
  
  // Voice config (for CIFO)
  voiceEnabled        Boolean         @default(false)
  voiceProvider       VoiceProvider?
  voiceConfig         Json?           // pitch, rate, voice_id, etc.
  
  // Stats
  totalActions        Int             @default(0)
  totalTokensUsed     BigInt          @default(0)
  totalCostUsd        Decimal         @db.Decimal(10, 4) @default(0)
  
  lastRunAt           DateTime?
  nextRunAt           DateTime?
  
  actions             AgentAction[]
  
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

enum AgentType {
  CONVERSATIONAL    // CIFO
  AUDITOR
  METRICS
  FX_WATCHER
  REFERRAL_OPTIMIZER
  ORCHESTRATOR
}

enum AgentStatus {
  IDLE
  RUNNING
  PAUSED
  ERROR
}

enum AgentMode {
  MANUAL          // every action requires approval
  APPROVAL        // proposes, waits for human approval
  AUTONOMOUS      // executes within defined boundaries
}

enum LlmProvider {
  ANTHROPIC
  OPENAI
  CUSTOM
}

enum VoiceProvider {
  WEB_SPEECH       // browser-native (free)
  ELEVENLABS       // premium
  OPENAI_TTS       // alternative
}

model AgentAction {
  id            String              @id @default(cuid())
  agentId       String
  agent         Agent               @relation(fields: [agentId], references: [id])
  
  type          AgentActionType
  severity      ActionSeverity      @default(INFO)
  status        ActionStatus        @default(PENDING_REVIEW)
  
  // What the agent found / wants to do
  payload       Json                // detail of finding or proposed fix
  summary       String              // human-readable summary
  
  // Execution
  appliedAt     DateTime?
  appliedResult Json?
  
  // Review
  reviewedById  String?
  reviewer      User?               @relation("ReviewedBy", fields: [reviewedById], references: [id])
  reviewedAt    DateTime?
  reviewNotes   String?
  
  // Cost
  tokensUsed    Int                 @default(0)
  costUsd       Decimal             @db.Decimal(10, 6) @default(0)
  
  createdAt     DateTime            @default(now())
  
  @@index([agentId])
  @@index([status])
  @@index([severity])
  @@index([createdAt])
}

enum AgentActionType {
  DETECTION       // found something
  RECOMMENDATION  // suggests an action
  AUTO_FIX        // applied a fix automatically
  CONVERSATION    // chat message (for CIFO)
  TOOL_CALL       // invoked a tool
}

enum ActionSeverity {
  INFO
  WARNING
  ERROR
  CRITICAL
}

enum ActionStatus {
  PENDING_REVIEW
  APPROVED
  REJECTED
  APPLIED
  FAILED
  AUTO_APPLIED
}

// CIFO conversation history
model AgentConversation {
  id            String              @id @default(cuid())
  agentId       String              // typically CIFO
  userId        String
  
  messages      Json                // array of {role, content, timestamp}
  
  startedAt     DateTime            @default(now())
  endedAt       DateTime?
  
  @@index([userId])
  @@index([startedAt])
}
```

---

## 7. System

```prisma
// Immutable audit log of all critical actions
model AuditLog {
  id            String          @id @default(cuid())
  
  actorUserId   String?
  actor         User?           @relation("ActorUser", fields: [actorUserId], references: [id])
  actorRole     UserRole?
  
  // What happened
  action        String          // "user.login", "payment.created", etc.
  entityType    String?         // "Payment", "Employee", etc.
  entityId      String?
  
  // Context
  ipAddress     String?
  userAgent     String?
  
  // Data
  before        Json?           // state before change
  after         Json?           // state after change
  metadata      Json?
  
  createdAt     DateTime        @default(now())
  
  @@index([actorUserId])
  @@index([action])
  @@index([entityType, entityId])
  @@index([createdAt])
}

// In-app notifications
model Notification {
  id            String              @id @default(cuid())
  userId        String
  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  type          NotificationType
  title         String
  body          String?
  
  // Optional link
  linkUrl       String?
  
  readAt        DateTime?
  
  createdAt     DateTime            @default(now())
  
  @@index([userId, readAt])
}

enum NotificationType {
  SYSTEM
  TASK_ASSIGNED
  PAYMENT_PROCESSED
  COMMISSION_EARNED
  PATIENT_REFERRED
  AGENT_ALERT
  PERFORMANCE_REPORT
}

// Application settings (key-value)
model Setting {
  id            String          @id @default(cuid())
  key           String          @unique
  value         Json
  description   String?
  
  updatedById   String?
  updatedAt     DateTime        @updatedAt
}
```

---

## Indexes summary

Critical indexes for performance:

- `User.email` — login lookups
- `User.role` — permission filtering
- `Employee.countryId, .type, .status` — list filters
- `AttendanceSync(employeeId, date)` — composite unique
- `MetricSnapshot(employeeId, date)` — composite unique
- `Payment.period, .status` — payroll queries
- `Patient.lawyerReferrerId, .providerReferrerId` — referral lookups
- `Commission.status, .earnedAt` — payout reports
- `AgentAction.status, .severity, .createdAt` — agent dashboard
- `AuditLog.actorUserId, .action, .createdAt` — audit queries

---

## Row-Level Security (RLS) policies

Implemented in Supabase. Key policies:

| Table | Policy |
|-------|--------|
| `users` | Users can read their own row; admins can read all |
| `employees` | Employees see their own; admins see all in same country |
| `payments` | Employees see their own; admins/finance see all |
| `tasks` | Assignee + supervisor + admins |
| `lawyers` | Lawyers see only their own data; admins see all |
| `providers` | Providers see only their own data; admins see all |
| `patients` | Referrers see only patients they referred (with consent); admins see all |
| `commissions` | Earner sees their own; admins see all |
| `audit_log` | Read: super_admin only; Write: system only |
| `agent_actions` | Read: admins; Write: system + agent |

---

## Migration strategy

Phase 0:
- Initial schema with `User`, `Employee`, `Department`, `Country`, `CashBox`, `CashTransaction`

Phase 1:
- Add `Wallet`, `FxOperation`, `Payment`, `Task`, `AuditLog`, `Notification`

Phase 2:
- Add `AttendanceSync`, `MetricSnapshot`

Phase 3:
- Add `Lawyer`, `Provider`, `Patient`, `Appointment`, `Clinic`, `Commission`, `CommissionConfig`, `ServiceTariff`

Phase 4:
- Add `Agent`, `AgentAction`, `AgentConversation`

---

**Next:** Read `DESIGN_SYSTEM.md` to internalize the visual language.

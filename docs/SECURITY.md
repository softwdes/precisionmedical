# Security & Compliance · LM Super Admin

> Security architecture, regulations, and best practices.

---

## 1. Threat model

LM Super Admin handles:

- **PII** (Personally Identifiable Information) — names, addresses, contact info
- **PHI** (Protected Health Information) — patient medical data, appointment info
- **Financial data** — bank accounts, payment records, FX operations, payroll
- **Legal data** — lawyer commissions, referral records (regulated by US law)
- **Authentication credentials** — passwords, MFA secrets, session tokens

**Key threats:**
1. Unauthorized access to patient data (HIPAA violation)
2. Financial fraud through payment manipulation
3. Anti-kickback violations through improperly logged commissions
4. Account takeover via weak auth
5. Data leakage through poorly scoped queries
6. Insider threats from malicious admin actions

---

## 2. Authentication

### Password requirements

- Minimum 12 characters
- Must contain at least 3 of: uppercase, lowercase, number, symbol
- No common passwords (use `pwned-passwords` API or local list)
- Passwords hashed with **bcrypt** (cost factor 12) via Supabase Auth
- Password history: cannot reuse last 5 passwords

### MFA (Multi-Factor Authentication)

| Role | MFA |
|------|-----|
| `SUPER_ADMIN` | **Mandatory** |
| `ADMIN` (financial) | **Mandatory** |
| `EMPLOYEE` | Optional |
| `LAWYER` | Optional but recommended |
| `PROVIDER` | Optional but recommended |

Implementation: TOTP (Time-based One-Time Password) via Supabase Auth.

### Session management

- Sessions expire after **8 hours** of inactivity
- Sessions remembered for **30 days** if "Remember me" checked
- Active sessions visible in user profile
- Admins can force-revoke any user's sessions
- Concurrent sessions allowed but logged

### Account lockout

- 5 failed login attempts → account locked for 15 minutes
- 10 failed attempts in 24h → admin notification
- Lockout cleared on successful password reset

---

## 3. Authorization

### Role-Based Access Control (RBAC)

Roles defined in `users.role` column. Each role has explicit permissions.

```typescript
const rolePermissions = {
  SUPER_ADMIN: ['*:*'],  // wildcard, everything
  
  ADMIN: [
    'employees:read', 'employees:write',
    'payments:read', 'payments:write',
    'cash:read', 'cash:write',
    'lawyers:read', 'lawyers:write',
    'providers:read', 'providers:write',
    'metrics:read',
    'reports:read',
    // NOT: 'ai:configure', 'users:delete'
  ],
  
  EMPLOYEE: [
    'self:read', 'self:write',
    'tasks:read:own', 'tasks:write:own',
  ],
  
  LAWYER: [
    'self:read', 'self:write',
    'patients:read:referred',
    'patients:write:create',
    'commissions:read:own',
    'calendar:read',
  ],
  
  PROVIDER: [
    // similar to LAWYER but with clinical scope
  ],
  
  AUDITOR_AI: [
    'audit:read',
    'agent_actions:write',
    'audit_log:write',
  ],
};
```

### Enforcement

**Server-side:** Every tRPC procedure checks permissions via middleware.

```typescript
const requirePermission = (permission: string) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    if (!hasPermission(ctx.user, permission)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next();
  });

// Usage
const myProcedure = requirePermission('employees:write')
  .input(z.object({...}))
  .mutation(async ({ input, ctx }) => { ... });
```

**Client-side:** UI hides buttons/views based on role (defense in depth, not security).

**Database-side:** Supabase RLS policies enforce row-level access.

---

## 4. Data encryption

### At rest

- **Database:** Supabase encrypts PostgreSQL at rest (AES-256)
- **File storage:** Supabase Storage encrypts at rest
- **Sensitive fields** (bank accounts, MFA secrets): App-level encryption with `crypto`

```typescript
// packages/auth/src/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY = Buffer.from(process.env.FIELD_ENCRYPTION_KEY!, 'hex');
const ALGORITHM = 'aes-256-gcm';

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decrypt(ciphertext: string): string {
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}
```

### In transit

- All connections use **TLS 1.3**
- HSTS headers enabled
- Certificate pinning not required (handled by Vercel/Supabase)

### Key management

- `FIELD_ENCRYPTION_KEY` stored in Vercel env vars (never in code)
- Rotated annually; old data re-encrypted via background job
- Supabase keys stored in env vars per environment

---

## 5. HIPAA considerations

⚠️ **Important:** Precision Medical is a US clinic handling patient data. While LM Super Admin is primarily an admin tool (not a primary EHR), HIPAA principles still apply.

### Business Associate Agreements (BAAs)

The client is responsible for ensuring BAAs are in place with:
- **Supabase** (BAA available on Pro plan and above)
- **Vercel** (BAA available on Enterprise; consider implications)
- **Resend** (review their HIPAA stance)
- **Anthropic / OpenAI** (PHI must NOT be sent to LLMs without explicit authorization)

### Minimum necessary principle

Only collect, store, and display the minimum patient data needed for the task.

### Audit logging

All access to PHI is logged in `audit_log`:
- Who accessed
- When
- What entity (patient ID, appointment ID)
- What action (read, write, delete)

### Patient consent

When a lawyer or provider views patient data, the system checks for valid consent on file.

### Data retention

- Patient records: retained for 7 years minimum (Utah requirement)
- Audit logs: retained for 6 years (HIPAA minimum)
- Backup retention: 30 days for daily, 1 year for monthly

### PHI in logs

**Never log PHI** in application logs, error tracking, or analytics:
- Sentry: scrub patient names, DOBs, addresses
- PostHog: never include patient identifiers in event properties
- Application logs: redact via middleware

```typescript
const PHI_FIELDS = ['firstName', 'lastName', 'dateOfBirth', 'address', 'phone', 'email'];

export function redactPHI(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const result = { ...obj };
  for (const field of PHI_FIELDS) {
    if (field in result) {
      result[field] = '[REDACTED]';
    }
  }
  return result;
}
```

### PHI to LLMs

When CIFO or Audit Agent need to reason about patient data:
- **Default:** Strip PHI before sending to LLM
- **Aggregated only:** "47 patients this month" is OK; "John Doe's records" is NOT
- **Explicit authorization:** Only super_admin can enable PHI-to-LLM mode for specific tasks
- **Logged:** Every PHI-to-LLM interaction logged in audit_log

---

## 6. Anti-Kickback compliance

### Context

In the US, paying for medical referrals is regulated by:
- **Stark Law** (physician self-referral)
- **Anti-Kickback Statute** (federal)
- State-level laws (Utah)

### Our position

**LM Super Admin supports configurable commission models, but the client is responsible for legal compliance.** The system does not enforce specific terms — it executes whatever the admin configures.

### Documentation requirements

For audit purposes, the system records:
- The commission scheme in use per lawyer/provider
- Effective dates of each scheme
- All changes to commission configurations
- Every commission earned, with the patient and case
- Every commission paid, with proof of payment

This data trail enables the client's legal team to audit compliance.

### Suggested safeguards

- Cap commission values at sane levels (e.g., warn if >$1000/referral)
- Flag unusual patterns (e.g., one lawyer suddenly referring 100 patients in a week)
- Require documentation upload for high-value commissions
- Generate quarterly reports for legal review

---

## 7. Financial controls

### Append-only financial records

`Payment`, `FxOperation`, `CashTransaction`, `Commission` are **immutable**.

To "edit" a record:
1. Create a reversal entry that nullifies the original
2. Create a new entry with corrected values
3. Both records remain in the database forever

### Approval workflows

- Payments above $10,000 USD require dual approval
- FX operations above $5,000 USD require dual approval
- Cash deposits above $1,000 USD require receipt + admin approval
- Commission payouts above $5,000 USD require admin approval

### Reconciliation

- Wallet balances reconciled monthly with bank statements
- Discrepancies flagged for admin review
- Reconciliation status visible in finance dashboard

---

## 8. API security

### Rate limiting

| Endpoint type | Rate limit |
|---------------|-----------|
| Auth (login, register) | 5 / min / IP |
| Mutation endpoints | 60 / min / user |
| Read endpoints | 600 / min / user |
| AI agent calls | Per agent budget |

Implementation: Upstash Redis or Supabase Edge Function.

### Input validation

All inputs validated with **Zod** schemas:

```typescript
const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  type: z.enum(['FULL_TIME', 'EXTERNAL', 'CONTRACTOR']),
  countryId: z.string().cuid(),
  // ...
});
```

### CSRF protection

- Server Actions use Next.js built-in CSRF protection
- tRPC mutations require valid session

### CORS

- Web app: only same origin
- Public APIs (none currently): explicit allowlist

---

## 9. Security headers

Set via `next.config.js`:

```javascript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  // CSP customized per app
];
```

### Content Security Policy

Strict CSP with:
- `script-src`: self + Vercel + (specific CDN if needed)
- `connect-src`: self + Supabase + Sentry + PostHog + Anthropic + OpenAI
- `img-src`: self + Supabase Storage + data:
- No inline scripts (use nonces if needed)

---

## 10. Audit logging

Every critical action logged in `audit_log`:

```typescript
interface AuditLogEntry {
  actorUserId: string;
  actorRole: UserRole;
  action: string;       // "user.login", "payment.created", "employee.deleted"
  entityType?: string;  // "Payment", "Employee"
  entityId?: string;
  ipAddress: string;
  userAgent: string;
  before?: object;      // state before change
  after?: object;       // state after change
  metadata?: object;
  createdAt: Date;
}
```

### What gets logged

- All authentication events (login, logout, MFA, password change)
- All financial transactions (payment, FX, cash, commission)
- All access to patient PHI
- All admin actions (user create/delete, role change)
- All AI agent actions
- All configuration changes

### Audit log access

- **Read:** SUPER_ADMIN only
- **Write:** System only (cannot be modified by users)
- **Retention:** 6 years minimum (HIPAA)
- **Export:** SUPER_ADMIN can export to encrypted ZIP for external audit

---

## 11. Backup & disaster recovery

### Backup strategy

- **Daily automated backups** of PostgreSQL (Supabase native)
- **30 days** of daily snapshots retained
- **Weekly snapshots** retained for 6 months
- **Monthly snapshots** retained for 1 year
- **Yearly snapshots** retained for 7 years (compliance)

### File storage backups

- Supabase Storage replicated across regions
- Cross-region backup to AWS S3 (optional, for redundancy)

### Recovery time/point objectives

| Metric | Target |
|--------|--------|
| RTO (Recovery Time Objective) | 4 hours |
| RPO (Recovery Point Objective) | 24 hours |

### Disaster recovery plan

1. Database restored from latest backup
2. File storage restored from cross-region replica
3. Apps redeployed from Git
4. DNS failover (if available)
5. Notification to all users of incident
6. Post-incident review and report

---

## 12. Vulnerability management

### Automated scanning

- **Dependabot** weekly checks for vulnerable dependencies
- **GitHub Code Scanning** with CodeQL on every PR
- **npm audit** in CI pipeline (fails on high/critical)
- **Snyk** (optional) for deeper analysis

### Patching policy

| Severity | Patch within |
|----------|--------------|
| Critical | 24 hours |
| High | 7 days |
| Medium | 30 days |
| Low | Next release |

### Incident response

If a vulnerability is exploited:

1. **Contain:** Disable affected feature/endpoint
2. **Notify:** SUPER_ADMIN within 1 hour
3. **Assess:** Determine scope of exposure
4. **Remediate:** Patch, deploy, validate
5. **Communicate:** Notify affected users (if applicable)
6. **Review:** Post-mortem within 1 week

---

## 13. Penetration testing

Recommended cadence:
- **Pre-launch:** Full pen test by third party
- **Post-launch:** Annual pen test
- **After major changes:** Targeted pen test of changed areas

---

## 14. User privacy

### Privacy notice

Required for the lawyer and provider portals (they are external users with their own privacy expectations).

### Right to access

Users can download their own data via profile settings.

### Right to deletion

- Employees can request deletion via admin
- Soft-deleted (status=INACTIVE) for 90 days, then hard-deleted
- Some records retained per legal requirements (financial, audit)

### Cookies

- Essential cookies only by default
- Analytics cookies (PostHog) require consent
- Cookie banner shown on first visit

---

## 15. AI-specific security

### Prompt injection

Mitigation:
- Validate user input before sending to LLM
- Use system prompts to constrain LLM behavior
- Escape user content in prompts
- Run output through validators before executing tool calls

### Tool use safeguards

CIFO can call tools, but:
- Each tool call is validated against permissions
- Destructive tools (delete, modify) require explicit confirmation
- All tool calls logged in audit_log
- Rate limits per tool

### LLM data exposure

- **Never send** to LLMs: passwords, MFA secrets, bank accounts, payment proofs
- **Sometimes send** (with admin authorization): aggregated patient stats
- **Always send** (OK): employee names, public data, system metadata

### Audit Agent safeguards

When in AUTONOMOUS mode:
- Action must be in pre-approved category
- Risk score must be below threshold
- Total actions per hour must not exceed limit
- Each action still logged with full reproducibility info

---

## 16. Compliance checklist

Before going to production:

- [ ] BAAs in place with all third-party processors
- [ ] HIPAA risk assessment completed
- [ ] Privacy policy published
- [ ] Cookie consent implemented
- [ ] All env vars stored securely (no hardcoded secrets)
- [ ] MFA enforced for SUPER_ADMIN and ADMIN
- [ ] All connections use TLS 1.3
- [ ] Sensitive fields encrypted at app level
- [ ] Audit log functional and immutable
- [ ] Backup strategy implemented and tested
- [ ] Incident response plan documented
- [ ] Pen test completed and findings remediated
- [ ] Security headers verified (use securityheaders.com)
- [ ] CSP enforced and tested
- [ ] Rate limiting active
- [ ] Anti-kickback documentation reviewed by client's legal team
- [ ] Employee data flow documented (especially Bolivia/Peru cross-border)
- [ ] CIFO/Audit Agent boundaries reviewed and approved

---

## 17. Cross-border data considerations

Precision Medical has employees in Bolivia and Peru. Their personal/payment data is stored in our US-based database.

### Considerations

- **GDPR-like laws** in Latin America (Peru's Ley 29733, Bolivia's progress)
- **Data localization** requirements (verify if any apply)
- **Cross-border transfer agreements** may be required
- **Employee consent** to data transfer must be documented

### Action

The client's legal team must validate compliance with:
- Bolivian data protection laws
- Peruvian data protection laws (Ley 29733)
- US laws governing data of foreign nationals

---

**Documentation continues in `tasks/` folder. Start with `tasks/phase-0-setup.md`.**

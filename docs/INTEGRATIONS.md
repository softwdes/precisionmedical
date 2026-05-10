# Integrations · External services & APIs

> All third-party services and how to integrate them.

---

## 1. Supabase

### Purpose
- PostgreSQL database
- Authentication
- File storage
- Real-time subscriptions
- Row-Level Security

### Setup steps

1. Create project at [supabase.com](https://supabase.com)
2. Get connection string (Settings → Database → Connection string)
3. Get anon key + service role key (Settings → API)
4. Add to `.env`:
   ```
   DATABASE_URL=postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # server-only
   ```

### Auth integration

```typescript
// packages/auth/src/supabase.ts
import { createServerClient } from '@supabase/ssr';

export const createSupabaseServerClient = (cookieStore: CookieStore) => {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options),
        remove: (name, options) => cookieStore.set(name, '', { ...options, maxAge: 0 }),
      },
    }
  );
};
```

### Storage buckets to create

| Bucket | Public | RLS |
|--------|--------|-----|
| `avatars` | Public read | Auth required to write |
| `receipts` | Private | Owner + admin |
| `contracts` | Private | HR + admin |
| `medical-docs` | Private | Strict (patient + clinic + admin) |
| `fx-proofs` | Private | Finance + admin |

### RLS strategy

Enable RLS on every table. Default policy: deny all. Then add explicit policies.

```sql
-- Example: employees table
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees see their own record"
  ON employees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins see all"
  ON employees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );
```

---

## 2. Resend (email)

### Purpose
Transactional email delivery.

### Setup

1. Create account at [resend.com](https://resend.com)
2. Verify a sending domain (e.g., `precisionmedical.com`)
3. Generate API key
4. Add to `.env`:
   ```
   RESEND_API_KEY=re_xxxxx
   RESEND_FROM_EMAIL="Precision Medical <noreply@precisionmedical.com>"
   ```

### Implementation

```typescript
// packages/notifications/src/resend.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
}) {
  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    subject,
    react,
  });
}
```

### Email templates (React Email)

Located at `packages/notifications/src/templates/`:

- `UserInvitation.tsx`
- `PasswordReset.tsx`
- `NewReferral.tsx`
- `CommissionEarned.tsx`
- `CommissionPaid.tsx`
- `WeeklyPerformance.tsx`
- `PaymentConfirmation.tsx`
- `AgentReport.tsx`

All templates support both ES and EN.

### Example template structure

```typescript
import { Html, Body, Container, Heading, Text, Button } from '@react-email/components';

interface UserInvitationProps {
  recipientName: string;
  inviteUrl: string;
  locale: 'es' | 'en';
}

export function UserInvitationEmail({ recipientName, inviteUrl, locale }: UserInvitationProps) {
  const t = locale === 'es' ? esTranslations : enTranslations;
  
  return (
    <Html>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading>{t.title}</Heading>
          <Text>{t.greeting(recipientName)}</Text>
          <Button href={inviteUrl} style={buttonStyle}>
            {t.cta}
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
```

---

## 3. Anthropic Claude (LLM primary)

### Purpose
Powers CIFO and Audit Agent reasoning.

### Setup

1. Get API key from [console.anthropic.com](https://console.anthropic.com)
2. Add to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxx
   ```

### Implementation via Vercel AI SDK

```typescript
// packages/ai-agents/src/providers/anthropic.ts
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';

export async function chatWithClaude({
  systemPrompt,
  messages,
  tools,
}: ChatParams) {
  return streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    system: systemPrompt,
    messages,
    tools,
    maxTokens: 1024,
  });
}
```

### Model selection

| Use case | Model |
|----------|-------|
| CIFO conversations | `claude-3-5-sonnet` (fast + capable) |
| Audit Agent code analysis | `claude-3-5-sonnet` |
| Quick classifications | `claude-3-haiku` (cheaper, faster) |
| Complex multi-step reasoning | `claude-3-opus` (most capable) |

### Pricing (as of 2026, verify current rates)

| Model | Input ($/MTok) | Output ($/MTok) |
|-------|----------------|------------------|
| Claude 3.5 Sonnet | $3 | $15 |
| Claude 3 Haiku | $0.25 | $1.25 |
| Claude 3 Opus | $15 | $75 |

---

## 4. OpenAI (LLM fallback)

### Purpose
Backup provider; used for specific tasks where GPT-4 performs better.

### Setup

```
OPENAI_API_KEY=sk-xxxxx
```

### Implementation

```typescript
// packages/ai-agents/src/providers/openai.ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function chatWithGPT({ systemPrompt, messages, tools }: ChatParams) {
  return generateText({
    model: openai('gpt-4o'),
    system: systemPrompt,
    messages,
    tools,
  });
}
```

### Provider abstraction

```typescript
// packages/ai-agents/src/llm.ts
export async function chat(params: ChatParams & { provider?: 'anthropic' | 'openai' }) {
  const provider = params.provider ?? 'anthropic';
  
  try {
    if (provider === 'anthropic') {
      return await chatWithClaude(params);
    }
    return await chatWithGPT(params);
  } catch (error) {
    // Auto-fallback to other provider
    console.warn(`Provider ${provider} failed, falling back...`);
    return provider === 'anthropic' 
      ? await chatWithGPT(params)
      : await chatWithClaude(params);
  }
}
```

---

## 5. ElevenLabs (premium voice, optional)

### Purpose
Premium TTS for CIFO when budget allows.

### Setup

1. Account at [elevenlabs.io](https://elevenlabs.io)
2. Choose or clone a child-male voice
3. Get voice ID and API key
4. Add to `.env`:
   ```
   ELEVENLABS_API_KEY=xxxxx
   ELEVENLABS_VOICE_ID=xxxxx
   ELEVENLABS_ENABLED=false  # toggle on when ready
   ```

### When to enable

- Demo to high-stakes stakeholders
- Production rollout where premium UX is desired
- When `ELEVENLABS_ENABLED=true` AND user has not opted out

### Cost considerations

- Free tier: 10,000 chars/month
- Starter: $5/month for 30,000 chars
- Creator: $22/month for 100,000 chars

For an admin team using CIFO heavily, plan ~$20-50/month.

---

## 6. Web Speech API (default voice + recognition)

### Purpose
Browser-native voice synthesis and recognition. **Always enabled** as fallback.

### Browser support

| Browser | Synthesis | Recognition |
|---------|-----------|-------------|
| Chrome | ✅ | ✅ |
| Edge | ✅ | ✅ |
| Safari | ✅ | ⚠️ (limited) |
| Firefox | ✅ | ❌ |

### Implementation
See `docs/AI_AGENTS.md` Section 2.5.

### Voices that work well

- **Spanish:** "Google español", "Microsoft Sabina", "Diego"
- **English:** "Google US English", "Aaron", "Microsoft David"

The voice selector tries these in order and falls back to any locale-matching voice.

---

## 7. External attendance database

### Context
Precision Medical uses an existing system to track employee attendance (clock-in, breaks, clock-out). We have read-only access to its database.

### Connection

Add to `.env`:
```
EXTERNAL_ATTENDANCE_DB_URL=postgresql://readonly:xxx@external-host:5432/attendance
```

### Sync strategy

**Daily sync at 2am** via Vercel Cron or Supabase Edge Function:

```typescript
// packages/database/src/sync/attendance.ts
export async function syncAttendance() {
  const externalDb = new Pool({ connectionString: process.env.EXTERNAL_ATTENDANCE_DB_URL });
  
  // Get yesterday's records
  const yesterday = startOfYesterday();
  const todayStart = startOfDay();
  
  const result = await externalDb.query(`
    SELECT employee_id, clock_in, break_start, break_end, clock_out
    FROM attendance
    WHERE clock_in >= $1 AND clock_in < $2
  `, [yesterday, todayStart]);
  
  for (const row of result.rows) {
    // Match external employee_id to our Employee
    const employee = await db.employee.findFirst({
      where: { externalId: row.employee_id }
    });
    
    if (!employee) continue;
    
    await db.attendanceSync.upsert({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: yesterday,
        }
      },
      create: { /* ... */ },
      update: { /* ... */ },
    });
  }
}
```

### Critical: read-only

Never write to the external DB. Treat it as a source of truth that we can only read.

### Handling sync failures

- Retry up to 3 times with exponential backoff
- If still failing, alert admin via Resend
- Last successful sync timestamp is visible in admin UI

---

## 8. Exchange rate API

### Purpose
Reference rates for FX operations (the actual rate applied is manual based on the exchange house used).

### Provider: exchangerate-api.com (free tier)

```
EXCHANGERATE_API_KEY=xxxxx
```

### Implementation

```typescript
// packages/currency/src/rates.ts
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

export async function getReferenceRates(base: 'USD' = 'USD') {
  const response = await fetch(
    `${BASE_URL}/${process.env.EXCHANGERATE_API_KEY}/latest/${base}`
  );
  const data = await response.json();
  
  return {
    USD: 1,
    BOB: data.conversion_rates.BOB,
    PEN: data.conversion_rates.PEN,
  };
}
```

### Caching

Cache rates for 1 hour in Redis or in-memory. No need for real-time precision.

### Display rules

- **Reference rates** are shown in UI as approximations
- **Applied rates** in actual FX operations are user-entered
- Always show the difference between reference and applied (transparency for accounting)

---

## 9. Sentry (error tracking)

### Setup

```
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_AUTH_TOKEN=xxxxx
```

### Initialization (Next.js)

```typescript
// instrumentation.ts (Next.js native instrumentation)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
```

### Privacy

- Filter out PHI (patient health info) before sending
- Filter out payment proofs and bank details
- User context: only `userId` and `role`, never email/name

---

## 10. PostHog (product analytics)

### Setup

```
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

### Events to track

| Event | When |
|-------|------|
| `user.login` | Successful login |
| `user.logout` | Logout |
| `module.viewed` | Any module page view |
| `employee.created` | New employee added |
| `payment.created` | New payment record |
| `referral.created` | Lawyer/Provider referred patient |
| `cifo.opened` | CIFO panel opened |
| `cifo.message.sent` | User sent message to CIFO |
| `agent.action.approved` | Admin approved agent action |
| `report.generated` | Report exported |

### Privacy

- No PHI in event properties
- User identification by `userId` only
- Respect Do Not Track header

---

## 11. Vercel (hosting)

### Apps deploy independently

Each app in `apps/` deploys as its own Vercel project:
- `web` → `app.precisionmedical.com`
- `portal-lawyers` → `lawyers.precisionmedical.com`
- `portal-providers` → `providers.precisionmedical.com`

### Build settings

```
Framework: Next.js
Build command: pnpm turbo run build --filter=<app>
Output directory: apps/<app>/.next
```

### Environment variables

Set per environment (development, preview, production) in Vercel dashboard.

### Cron jobs

```typescript
// apps/web/vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync-attendance",
      "schedule": "0 2 * * *"   // daily at 2am
    },
    {
      "path": "/api/cron/compute-metrics",
      "schedule": "0 3 * * *"   // daily at 3am
    },
    {
      "path": "/api/cron/audit-agent-run",
      "schedule": "0 8 * * *"   // daily at 8am
    }
  ]
}
```

---

## 12. GitHub

### Repository structure

```
github.com/precision-medical/lm-super-admin
```

### Branch protection

- `main`: Protected, requires PR + review + green CI
- `develop`: Optional staging branch
- Feature branches: `feat/<scope>-<description>`

### GitHub Actions

Workflows:
- `ci.yml` — typecheck, lint, test, build (on every PR)
- `deploy-staging.yml` — auto-deploy to staging on `develop` push
- `deploy-prod.yml` — manual trigger, deploy to production
- `dependabot.yml` — weekly dependency updates

### Secrets to configure

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | Deploys |
| `SENTRY_AUTH_TOKEN` | Sourcemaps upload |
| `DATABASE_URL` | Migrations in CI |

---

## 13. Twilio (SMS, future)

Not in Phase 1-4 but architecture supports it.

```typescript
// packages/notifications/src/sms.ts (future)
import { Twilio } from 'twilio';

const twilio = new Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function sendSms(to: string, body: string) {
  return twilio.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
}
```

---

## 14. Environment variables checklist

Complete list of env vars across all environments:

```bash
# Database
DATABASE_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# AI / LLM
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Voice (premium)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_ENABLED=false

# External integrations
EXTERNAL_ATTENDANCE_DB_URL=
EXCHANGERATE_API_KEY=

# Observability
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# App
NEXT_PUBLIC_APP_URL=
NODE_ENV=
```

---

**Next:** Read `SECURITY.md` for security and compliance specifics.

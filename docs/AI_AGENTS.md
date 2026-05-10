# AI Agents · CIFO & Audit Agent

> Specifications for the AI agents that ship with LM Super Admin.

---

## 1. Philosophy

AI is not a "feature" — it is a **first-class citizen** of this product. The architecture supports agents from day one. The first two agents we ship are:

1. **CIFO** — the conversational assistant (with voice)
2. **Audit Agent** — the autonomous code/data quality monitor

The framework is designed so that adding new agents is a matter of configuration, not architecture changes.

---

## 2. CIFO — The conversational assistant

### 2.1 Identity

- **Name:** CIFO (legacy from Precision Medical's previous robot mascot)
- **Personality:** Friendly, helpful, professional but warm
- **Voice:** Masculine, child-like, energetic
- **Languages:** Spanish (default) + English (auto-switches with system locale)

### 2.2 Always-visible FAB (Floating Action Button)

```
Position: fixed bottom-right
Size: 56x56px
Border-radius: 18px
Background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)
Z-index: 50

States:
- Idle: gentle pulse animation (3s loop)
- Hover: scale(1.05) + slight rotation(-6deg)
- Active (panel open): glow intensifies
- Speaking: outer ring pulses with audio amplitude
- Listening: red glow + vibrating particles
```

### 2.3 Side panel (when activated)

```
Position: slides in from right
Width: 400px (desktop), 100vw (mobile)
Height: 100vh - 32px (with margin)
Background: var(--surface) with backdrop-blur
Border: 1px solid var(--border)
Border-radius: var(--radius-lg)

Sections (top to bottom):
1. Header: CIFO orb + name + close button + mute button + lang button
2. Welcome message (first time) or last conversation
3. Suggestion chips (context-aware)
4. Message thread (scrollable)
5. Input bar: text input + mic button + send button
```

### 2.4 First-load welcome

When a user first loads the app:

1. Boot animation completes (1.5s)
2. CIFO orb pulses once
3. After 0.5s, CIFO speaks: 
   - ES: *"Hola Erick, soy CIFO. Estoy listo para ayudarte."*
   - EN: *"Hi Erick, I'm CIFO. I'm ready to help you."*
4. The greeting is **toggleable** in user settings (default: on)
5. After the greeting, panel may show a brief "What can I do?" tooltip

### 2.5 Voice implementation

#### Phase 1: Web Speech API (free, immediate)

```typescript
// packages/ai-agents/src/voice/web-speech.ts
export class WebSpeechVoice {
  private synthesis: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;
  
  constructor(locale: 'es' | 'en' = 'es') {
    this.synthesis = window.speechSynthesis;
    this.selectVoice(locale);
  }
  
  private selectVoice(locale: string) {
    const voices = this.synthesis.getVoices();
    
    // Prefer male voices that sound young
    const preferred = locale === 'es' 
      ? ['Google español', 'Diego', 'Jorge'] 
      : ['Google US English', 'Aaron', 'Alex'];
    
    for (const name of preferred) {
      const found = voices.find(v => v.name.includes(name));
      if (found) { this.voice = found; return; }
    }
    
    // Fallback: any voice in the locale
    this.voice = voices.find(v => v.lang.startsWith(locale)) || voices[0];
  }
  
  speak(text: string, options: VoiceOptions = {}) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = this.voice;
    utterance.pitch = options.pitch ?? 1.4;  // higher = younger sound
    utterance.rate = options.rate ?? 1.05;
    utterance.volume = options.volume ?? 1.0;
    
    this.synthesis.speak(utterance);
    
    return new Promise(resolve => {
      utterance.onend = resolve;
    });
  }
  
  cancel() {
    this.synthesis.cancel();
  }
  
  isSpeaking() {
    return this.synthesis.speaking;
  }
}
```

#### Phase 2: ElevenLabs (premium, ready to plug in)

```typescript
// packages/ai-agents/src/voice/elevenlabs.ts
export class ElevenLabsVoice {
  constructor(
    private apiKey: string,
    private voiceId: string  // child-male voice ID
  ) {}
  
  async speak(text: string): Promise<void> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      }
    );
    
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    return new Promise(resolve => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.play();
    });
  }
}
```

#### Provider abstraction

```typescript
// packages/ai-agents/src/voice/index.ts
export interface VoiceProvider {
  speak(text: string, options?: VoiceOptions): Promise<void>;
  cancel(): void;
  isSpeaking(): boolean;
}

export function getVoiceProvider(config: VoiceConfig): VoiceProvider {
  if (config.provider === 'elevenlabs' && config.apiKey) {
    return new ElevenLabsVoice(config.apiKey, config.voiceId);
  }
  return new WebSpeechVoice(config.locale);
}
```

### 2.6 Voice input (microphone)

```typescript
// packages/ai-agents/src/voice/recognition.ts
export class VoiceRecognition {
  private recognition: SpeechRecognition;
  
  constructor(locale: 'es' | 'en' = 'es') {
    const SpeechRecognition = 
      window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported');
    }
    
    this.recognition = new SpeechRecognition();
    this.recognition.lang = locale === 'es' ? 'es-ES' : 'en-US';
    this.recognition.interimResults = true;
    this.recognition.continuous = false;
  }
  
  start(callbacks: {
    onResult: (text: string, isFinal: boolean) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
  }) {
    this.recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      callbacks.onResult(last[0].transcript, last.isFinal);
    };
    
    this.recognition.onerror = (event) => {
      callbacks.onError?.(event.error);
    };
    
    this.recognition.onend = () => {
      callbacks.onEnd?.();
    };
    
    this.recognition.start();
  }
  
  stop() {
    this.recognition.stop();
  }
}
```

### 2.7 Conversation flow

```
User clicks FAB or types
  ↓
Panel opens with welcome
  ↓
User types or speaks input
  ↓
Send to /api/cifo (tRPC)
  ↓
CIFO router:
  1. Check user permissions
  2. Build context (current module, user data)
  3. Call LLM with tools
  4. If LLM calls a tool:
     - Validate tool params
     - Execute tool
     - Return result to LLM
  5. Stream response back
  ↓
Panel displays response (typewriter effect)
  ↓
Voice (if not muted): speak the response
```

### 2.8 Available tools (function calling)

CIFO can invoke these tools to take action:

```typescript
const cifoTools = [
  {
    name: 'get_employee_summary',
    description: 'Get summary stats for employees',
    parameters: { 
      country?: 'US' | 'BO' | 'PE',
      type?: 'full_time' | 'external' | 'contractor',
    }
  },
  {
    name: 'get_top_performers',
    description: 'Get top N performing employees',
    parameters: { 
      n: number,
      period: 'this_week' | 'this_month' | 'this_quarter',
    }
  },
  {
    name: 'get_appointments_today',
    description: 'Get all appointments scheduled today',
    parameters: { clinicName?: string }
  },
  {
    name: 'create_patient',
    description: 'Open the form to create a new patient',
    parameters: {} // no params, just opens UI
  },
  {
    name: 'get_revenue_summary',
    description: 'Get revenue summary for a period',
    parameters: { period: string }
  },
  {
    name: 'get_pending_commissions',
    description: 'Get pending commissions for lawyers/providers',
    parameters: {}
  },
  {
    name: 'get_cash_balance',
    description: 'Get current cash box balance',
    parameters: { clinic?: string }
  },
  {
    name: 'navigate_to',
    description: 'Navigate to a specific module/page',
    parameters: { module: string, view?: string }
  },
  {
    name: 'generate_report',
    description: 'Generate a report (PDF or Excel)',
    parameters: { type: string, period: string }
  },
];
```

### 2.9 Context-aware suggestions

The suggestion chips change based on the current module:

```typescript
const moduleSuggestions: Record<string, string[]> = {
  dashboard: [
    'Resume mi día',
    'Top empleados del mes',
    '¿Cuánto pagué este mes?',
  ],
  employees: [
    'Top 3 mejores este mes',
    '¿Quién faltó esta semana?',
    'Calcular bono trimestral',
  ],
  finance: [
    'Balance actual de wallets',
    'Última operación FX',
    'Gastos por categoría',
  ],
  lawyers: [
    'Top referentes del mes',
    'Comisiones pendientes',
    'Crear nuevo abogado',
  ],
  ai_agents: [
    'Estado del Audit Agent',
    'Acciones pendientes de aprobar',
    'Cuánto he gastado en IA',
  ],
};
```

### 2.10 Fallback simulated responses (for demo / no API key)

When `AGENT_API_URL` is not configured:

```typescript
const fallbackResponses: { keywords: string[]; response: string }[] = [
  {
    keywords: ['hola', 'hi', 'hello', 'hey'],
    response: '¡Hola! Soy CIFO, tu asistente. ¿En qué te ayudo hoy?',
  },
  {
    keywords: ['empleados', 'employees', 'team'],
    response: 'Tienes 47 empleados activos: 32 fijos, 8 externos y 7 contractors distribuidos en USA, Bolivia y Perú.',
  },
  {
    keywords: ['pagos', 'pay', 'payment'],
    response: 'Este mes has procesado $124,850 USD en pagos. Hay 3 pagos pendientes por aprobación.',
  },
  // ... more
];
```

If a keyword matches → return that response. Otherwise → return a generic helpful message: "Estoy aprendiendo sobre eso. ¿Puedes preguntarme de otra forma?"

### 2.11 Animations checklist

| Trigger | Animation |
|---------|-----------|
| FAB idle | 3s breathing pulse |
| FAB hover | scale(1.05) + rotate(-6deg) over 250ms |
| FAB click | particles burst out, panel slides in |
| Welcome message | Typewriter effect (~30ms/char) |
| Suggestions appear | Stagger from bottom (60ms apart) |
| User sends message | Slide up from bottom into thread |
| Thinking | Three dots pulse + orb partick orbit |
| Response streaming | Typewriter with voice sync |
| Listening | Red glow + vibrating particles |
| Mute toggle | Quick X over speaker icon |
| Panel close | Collapse to FAB position + particle trail |

---

## 3. Audit Agent

### 3.1 Purpose

Continuously monitors the system for:
- Code quality issues
- Production errors (via Sentry)
- Data inconsistencies
- Security concerns
- Performance regressions

### 3.2 Operating modes

| Mode | Behavior |
|------|----------|
| **Manual** | Findings logged, no actions taken until manual trigger |
| **Approval** | Proposes fixes, waits for admin approval before applying |
| **Autonomous** | Applies fixes within defined boundaries; logs everything |

Each mode is **per-category** — admin can have approval mode for code, autonomous for data cleanup.

### 3.3 Capabilities

#### Code analysis
- Read repository (via GitHub API or local file access)
- Detect anti-patterns
- Find duplicated code
- Check for outdated dependencies
- Scan for security vulnerabilities (npm audit)

#### Error monitoring
- Connect to Sentry API
- Detect error spikes
- Identify regressions (errors that just appeared)
- Categorize by severity

#### Data audit
- Find payments without proof URLs
- Find employees without metric snapshots
- Find FX operations that don't balance
- Find orphaned records
- Find suspicious patterns (e.g., unusual cash transactions)

#### Reporting
- Daily executive report at 8am
- Weekly deep-dive on Mondays
- Real-time alerts for critical issues

### 3.4 Schedule

```typescript
{
  realtime: ['error_monitoring'],  // continuous
  hourly:   ['data_audit'],        // every hour
  daily:    ['code_quality'],      // 2am
  weekly:   ['deep_review'],       // Monday 6am
}
```

### 3.5 Data model alignment

The Audit Agent uses the `agents` and `agent_actions` tables. See `DATA_MODEL.md`.

```sql
-- An action by the Audit Agent
INSERT INTO agent_actions (agent_id, type, severity, status, payload, summary)
VALUES (
  '...',
  'DETECTION',
  'WARNING',
  'PENDING_REVIEW',
  '{"issue": "duplicate_code", "files": [...], "lines": [...], "suggested_fix": "..."}',
  'Found duplicate logic in EmployeeForm and LawyerForm. Suggest extracting to shared hook.'
);
```

### 3.6 Approval flow

```
Audit Agent runs
  ↓
Creates AgentAction with status=PENDING_REVIEW
  ↓
Notification sent to super_admin
  ↓
Admin opens "Pending Actions" inbox
  ↓
For each action:
  - View details
  - Approve → AgentAction.status=APPROVED, agent applies fix
  - Reject → AgentAction.status=REJECTED with reason
  - Defer → no change, stays in inbox
  ↓
After applied:
  - AgentAction.status=APPLIED
  - appliedResult populated
  - Audit log records the change
```

### 3.7 Autonomous mode safeguards

When in autonomous mode:

1. Action must be in an **allowed category** (configured per agent)
2. Action's risk score must be **below threshold**
3. Total actions per hour **must not exceed limit**
4. Each autonomous action is **still logged** with full reproducibility info

If any safeguard fails, action falls back to approval mode automatically.

---

## 4. AI Agents Module (UI)

The dedicated module in the admin app. Located at `/admin/ai-agents`.

### 4.1 Sub-tabs

1. **Dashboard** — overview of all agents
2. **CIFO** — config + conversation history
3. **Audit Agent** — config + findings
4. **Pending Actions** — approval inbox
5. **History** — all actions ever taken
6. **Costs** — token usage + USD cost breakdown

### 4.2 Dashboard view

KPI cards:
- Total actions today
- Pending approval
- Auto-applied today
- Cost this month (USD)

Active agents grid (one card per agent):
- Status indicator (idle/running/paused/error)
- Mode (manual/approval/autonomous)
- Last run timestamp
- Next run timestamp
- Quick actions (run now, pause, edit config)

Recent actions feed (last 20).

### 4.3 Agent detail view

Tabs:
- **Configuration** (mode, schedule, permissions, budget)
- **Permissions** (granular)
- **History** (all past actions by this agent)
- **Logs** (raw execution logs)

### 4.4 Pending Actions inbox

Filterable table:
- Severity filter
- Type filter
- Date range
- Search

Each row expands to show:
- Full payload
- Proposed fix (if applicable)
- Buttons: Approve / Reject / Defer

Bulk operations: select multiple → approve all / reject all.

### 4.5 Costs view

Metrics:
- Tokens consumed (this month vs last month)
- Cost in USD (this month vs last month)
- Cost per agent (pie chart)
- Cost over time (line chart)
- Budget remaining per agent (progress bars)

Alerts when an agent reaches:
- 80% of monthly budget → warning
- 100% of monthly budget → agent paused automatically

---

## 5. Adding new agents

The framework is generic. To add a new agent:

1. Create config in DB (new `Agent` row)
2. Implement agent logic in `packages/ai-agents/src/agents/<name>.ts`
3. Register in agent registry
4. Add UI tab in AI Agents module

```typescript
// packages/ai-agents/src/agents/registry.ts
import { auditAgent } from './audit';
import { cifoAgent } from './cifo';

export const agentRegistry = {
  CIFO: cifoAgent,
  AUDIT: auditAgent,
  // future: METRICS, FX_WATCHER, REFERRAL_OPTIMIZER
};
```

---

## 6. Security & permissions for agents

Each agent has a system user with role `AUDITOR_AI`. Permissions:

- **Read:** Can read most tables
- **Write:** Limited to specific tables (e.g., `agent_actions`, `notifications`)
- **Sensitive data:** Patient PHI, payment proofs, encrypted fields → redacted before LLM
- **Audit:** Every agent action is logged in `audit_log`

Example: CIFO querying patient data must:
1. Check that the user's role can access patient data
2. Filter sensitive fields before returning to LLM
3. Never include PHI in LLM context unless explicitly authorized

---

## 7. Cost management

### Per-agent monthly budget (USD)

| Agent | Default budget |
|-------|----------------|
| CIFO | $50/month |
| Audit Agent | $30/month |

### Cost calculation

```typescript
function calculateCost(provider: string, model: string, tokensIn: number, tokensOut: number): number {
  const pricing = {
    'anthropic-claude-3-5-sonnet': { in: 3, out: 15 },  // per 1M tokens
    'openai-gpt-4o': { in: 5, out: 15 },
    // ...
  };
  
  const rates = pricing[`${provider}-${model}`];
  return (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
}
```

### Auto-pause when budget hit

```typescript
async function beforeAgentRun(agentId: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  const monthlyCost = await getMonthlyAgentCost(agentId);
  
  if (monthlyCost >= agent.budgetMonthlyUsd) {
    await db.agent.update({ 
      where: { id: agentId }, 
      data: { status: 'PAUSED' }
    });
    await notifyAdmin(`Agent ${agent.name} reached budget. Paused.`);
    throw new Error('Budget exceeded');
  }
}
```

---

## 8. Future agents (planned, not in scope for Phase 4)

| Agent | Purpose |
|-------|---------|
| **Metrics Agent** | Detect performance trends, suggest interventions |
| **FX Watcher** | Monitor exchange rates, alert on optimal trade timing |
| **Referral Optimizer** | Analyze patterns, suggest growth opportunities |
| **Compliance Agent** | Continuously check anti-kickback, HIPAA compliance |
| **Onboarding Agent** | Guide new employees through onboarding |
| **Translator Agent** | Real-time translation support |

---

**Next:** Read `INTEGRATIONS.md` for external service details.

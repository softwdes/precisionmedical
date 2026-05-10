# Design System · LM Super Admin

> Visual language, tokens, and component patterns. **This is locked — do not deviate.**

---

## 1. Brand identity

**Personality:** Professional, modern, trustworthy, with a touch of energy. Medical-grade serious, but never boring.

**Visual references:**
- Linear (clean structure)
- Stripe Dashboard (data clarity)
- Vercel Dashboard (modern aesthetics)
- Notion (information hierarchy)

---

## 2. Color tokens

### Dark theme (default)

```css
:root, [data-theme="dark"] {
  /* Backgrounds */
  --bg-0: #0A0E1A;        /* Page bg */
  --bg-1: #0F1524;        /* Sidebar */
  --bg-2: #141B2D;        /* Cards (lower) */
  --bg-3: #1A2238;        /* Elevated */
  --surface: #161D31;     /* Card surface */
  --surface-2: #1E2740;   /* Surface hover */
  
  /* Borders */
  --border: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.10);
  
  /* Text */
  --text-1: #F5F7FB;      /* Primary */
  --text-2: #A8B2CC;      /* Secondary */
  --text-3: #6B7592;      /* Tertiary */
  --text-muted: #4A5474;  /* Muted */
}
```

### Light theme

```css
[data-theme="light"] {
  /* Backgrounds */
  --bg-0: #F8FAFC;
  --bg-1: #FFFFFF;
  --bg-2: #F1F5F9;
  --bg-3: #E2E8F0;
  --surface: #FFFFFF;
  --surface-2: #F8FAFC;
  
  /* Borders */
  --border: rgba(15, 23, 42, 0.08);
  --border-strong: rgba(15, 23, 42, 0.14);
  
  /* Text */
  --text-1: #0F172A;
  --text-2: #475569;
  --text-3: #64748B;
  --text-muted: #94A3B8;
}
```

### Brand & accents (same in both themes)

```css
--brand: #6366F1;        /* indigo — primary action */
--brand-2: #8B5CF6;      /* violet — secondary brand */
--cyan: #06B6D4;         /* data, info */
--teal: #14B8A6;         /* secondary positive */
--emerald: #10B981;      /* success, positive */
--amber: #F59E0B;        /* warning, attention */
--rose: #F43F5E;         /* error, critical */
--sky: #0EA5E9;          /* alt info */
--pink: #EC4899;         /* highlight */
```

### Semantic mapping

| Use | Color |
|-----|-------|
| Primary actions | `--brand` |
| Success states | `--emerald` |
| Warning states | `--amber` |
| Error states | `--rose` |
| Info / data | `--cyan` |
| Highlight | `--pink` |
| Disabled | `--text-muted` |

---

## 3. Typography

### Font families

```css
--font-sans: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Loading

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type scale

| Element | Size | Weight | Tracking | Use |
|---------|------|--------|----------|-----|
| Display | 30px | 800 | -0.03em | Hero titles |
| H1 | 24px | 700 | -0.02em | Page titles |
| H2 | 18px | 700 | -0.01em | Section titles |
| H3 | 15px | 700 | -0.01em | Card titles |
| Body | 14px | 500 | normal | Default text |
| Small | 12.5px | 500 | normal | Helper text |
| Tiny | 10.5px | 700 | 0.06em | Labels, badges (uppercase) |
| Mono | 14-28px | 700 | 0.02em | Numbers, codes, IDs |

### Rules

- **Numbers always use mono** (creates the "technical/medical" feel)
- **Uppercase labels** are tiny + tracked (0.06em-0.12em)
- **Headings use letter-spacing -0.01 to -0.03em** for tightness
- **Body text uses letter-spacing -0.01em** for slight tightness

---

## 4. Spacing scale

Based on 4px:

```
space-1: 4px
space-2: 8px
space-3: 12px
space-4: 14px
space-5: 18px
space-6: 20px
space-7: 24px
space-8: 30px
```

**Most used:** 8, 12, 14, 18, 20, 24px.

---

## 5. Border radius

```css
--radius-sm: 8px;     /* Buttons, badges */
--radius:    14px;    /* Cards, inputs */
--radius-lg: 20px;    /* Large containers */
--radius-pill: 999px; /* Pills, avatars */
```

---

## 6. Shadows & glows

```css
/* Subtle elevation */
--shadow-soft: 0 1px 0 rgba(255,255,255,0.04) inset, 
               0 8px 24px rgba(0,0,0,0.25);

/* Brand glow */
--shadow-glow: 0 0 0 1px rgba(99,102,241,0.25), 
               0 12px 40px rgba(99,102,241,0.18);

/* Card hover */
--shadow-card-hover: 0 12px 32px rgba(0,0,0,0.2);
```

In light theme, swap to softer shadows:
```css
--shadow-soft: 0 1px 2px rgba(15,23,42,0.04), 
               0 4px 16px rgba(15,23,42,0.06);
```

---

## 7. Gradients

### Brand gradient (use sparingly, for impact)
```css
background: linear-gradient(135deg, #6366F1 0%, #06B6D4 100%);
```

### Multi-stop hero gradient (for accent text)
```css
background: linear-gradient(135deg, #6366F1 0%, #06B6D4 60%, #14B8A6 100%);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
```

### Card surface gradient
```css
background: linear-gradient(180deg, var(--surface) 0%, var(--bg-2) 100%);
```

### Background ambiance (page-level)
```css
background:
  radial-gradient(1200px 600px at 80% -10%, rgba(99,102,241,0.10), transparent 60%),
  radial-gradient(900px 500px at -10% 30%, rgba(6,182,212,0.06), transparent 60%),
  var(--bg-0);
```

---

## 8. Component patterns

### Button (primary)

```css
.btn-primary {
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
  border: none;
  color: #fff;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 12.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all .2s;
  box-shadow: 0 6px 20px rgba(99,102,241,0.35);
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(99,102,241,0.45);
}
```

### Button (secondary)

```css
.btn-secondary {
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  color: var(--text-1);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
}
.btn-secondary:hover {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.25);
  transform: translateY(-1px);
}
```

### Card (default)

```css
.card {
  background: linear-gradient(180deg, var(--surface) 0%, var(--bg-2) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  position: relative;
  transition: all .3s ease;
}
```

### KPI Card with sparkline

Pattern:
- Card surface
- Top row: icon + label + trend indicator
- Large mono number
- Subtitle text
- Bottom: sparkline (36px height)

See `design/lm-dashboard.html` for working example.

### Input

```css
.input {
  width: 100%;
  height: 40px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0 14px;
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  transition: all .2s;
}
.input:focus {
  outline: none;
  border-color: rgba(99,102,241,0.5);
  background: rgba(99,102,241,0.04);
  box-shadow: 0 0 0 4px rgba(99,102,241,0.08);
}
```

### Badge

```css
.badge {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 5px;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.badge-cyan {
  background: rgba(6,182,212,0.14);
  color: var(--cyan);
  border: 1px solid rgba(6,182,212,0.25);
}
/* same pattern for purple, green, amber, rose, violet, pink */
```

### Pill toggle (theme/language)

```css
.pill-group {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 12px;
  height: 40px;
}
.pill-btn {
  width: 32px;
  height: 30px;
  border-radius: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  transition: all .2s;
}
.pill-btn.active {
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  color: #fff;
  box-shadow: 0 4px 12px rgba(99,102,241,0.3);
}
```

### Avatar

```css
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--brand-2), var(--brand));
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  position: relative;
}
.avatar.online::after {
  content: "";
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--emerald);
  border: 2px solid var(--bg-1);
  box-shadow: 0 0 6px var(--emerald);
}
```

---

## 9. Layout patterns

### Sidebar

```
- Width: 264px (desktop), drawer on mobile
- Background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%)
- Padding: 18px 12px
- Sticky position
- 100vh height
- Brand block at top with bottom border
- Nav groups separated by labels (uppercase, tiny)
- Active item: gradient background + left accent bar with glow
- Submenu: indented 30px with dashed border-left
- Recent items at bottom (above settings)
```

### Topbar

```
- Height: 56px (40px + padding)
- Search left (max 480px, flex-1)
- Right group (margin-left: auto):
  - Clock pill (cyan accent)
  - Notification icon button
  - Theme toggle pill
  - Language toggle pill
  - Avatar with name + role
```

### KPI grid

```
- 4 columns desktop (1280px+)
- 2 columns tablet (768-1280px)
- 1 column mobile (<768px)
- Gap: 14px
```

### Main content grid

```
.grid {
  grid-template-columns: 1.55fr 1fr;
  gap: 18px;
}
```

Mobile: stacks vertically.

---

## 10. Animation guidelines

### Timing functions

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);     /* default */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1); /* transitions */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* playful */
```

### Durations

| Speed | Duration | Use |
|-------|----------|-----|
| Fast | 150ms | Hover states, color changes |
| Normal | 250ms | UI transitions, opening modals |
| Slow | 400ms | Theme changes, language switches |
| Boot | 1500ms | Initial app load |

### Hover patterns

```css
/* Cards */
.card:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-card-hover);
}

/* Buttons */
.btn:hover {
  transform: translateY(-1px);
}

/* List items */
.list-item:hover {
  background: rgba(99,102,241,0.06);
  transform: translateX(3px);
}
```

### Page entrance (boot sequence)

1. Logo appears with glow pulse (0-500ms)
2. Layout slides in (sidebar from left, topbar from top) (300-700ms)
3. Cards appear with stagger (each 80ms delay) (700-1200ms)
4. Numbers count up from 0 (1000-1500ms)
5. Charts draw progressively (1200-1800ms)
6. CIFO orb pulses once as greeting (1800ms)

### CIFO interactions

- **Open:** FAB explodes into particles, panel emerges with blur
- **Listening:** Red pulsing glow, vibrating particles
- **Thinking:** Animated dots + orbiting particles + cycling status text
- **Speaking:** Waveform reactive to audio amplitude
- **Close:** Panel collapses to FAB position, particle burst

### Reduced motion

Always respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 11. Iconography

### Library: Lucide React

Use Lucide for all icons. Reasons:
- Consistent stroke width
- Customizable
- Tree-shakeable
- Matches the design language

### Sizing

| Context | Size |
|---------|------|
| Sidebar nav | 17px |
| Topbar | 17px |
| Buttons | 14-16px |
| Stat cards | 16-20px |
| Hero icons | 24-32px |

### Stroke width: **1.8px** (default for our system)

### Common icons used

```
Dashboard:   layout-dashboard
Employees:   users
Finance:     wallet, dollar-sign
Lawyers:     scale, briefcase
Providers:   stethoscope, heart-pulse
Patients:    user-circle
AI Agents:   sparkles, bot
Settings:    settings
Search:      search
Notifications: bell
Theme:       moon, sun
Calendar:    calendar
Clock:       clock
Add:         plus
```

---

## 12. Charts

### Library: Chart.js (for static dashboards) + Recharts (for React-native)

### Color palette for charts

```js
const chartColors = [
  '#6366F1',  // brand
  '#06B6D4',  // cyan
  '#10B981',  // emerald
  '#F59E0B',  // amber
  '#F43F5E',  // rose
  '#8B5CF6',  // violet
  '#EC4899',  // pink
];
```

### Standard configs

- **Sparklines:** No axes, no labels, gradient fill (color → transparent)
- **Line charts:** Smooth curves (`tension: 0.4`), gradient fill, point hover only
- **Donuts:** 72% cutout, 2px spacing, no border, custom legend
- **Bars:** Rounded top corners, no border

---

## 13. Empty states

Every list/table needs an empty state:

```
[Icon - large, muted]
[Title - "No data yet"]
[Subtitle - explanation]
[Action button - "Create the first..."]
```

Empty states are **never** just blank — always guide the user to the next action.

---

## 14. Loading states

### Skeletons (preferred)

For cards and lists:
```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-2) 0%,
    var(--bg-3) 50%,
    var(--bg-2) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius);
}

@keyframes shimmer {
  to { background-position: -200% 0; }
}
```

### Spinners (only for short waits < 2s)

Brand-colored circular spinner.

---

## 15. Toasts / notifications

Position: top-right.
Stack: vertical.
Auto-dismiss: 4 seconds (info), 6 seconds (success), manual (errors).
Animation: slide in from right + fade.

```
Success: emerald accent
Info:    cyan accent
Warning: amber accent
Error:   rose accent
```

---

## 16. Modals / dialogs

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 26, 0.7);
  backdrop-filter: blur(8px);
  z-index: 100;
  animation: fadeIn 200ms ease-out;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  max-width: 540px;
  width: 90%;
  padding: 28px;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: slideUp 250ms ease-out;
}
```

Always include a close button (X) in top-right and ESC key handler.

---

## 17. Forms

### Field structure

```
[Label - 11px, uppercase, tracked, muted]
[Input/Select/Textarea]
[Helper text or error - 11.5px, muted]
```

### Validation

- Real-time on blur (not on every keystroke)
- Error border: `--rose`
- Error message below field
- Use `react-hook-form` + `zod`

### Submit buttons

- Primary action right-aligned
- Cancel/back left-aligned
- Disabled state during submission with spinner

---

## 18. Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table th {
  text-align: left;
  padding: 14px 18px;
  background: var(--bg-2);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--border);
}
.table td {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  color: var(--text-2);
  vertical-align: top;
}
.table tr:hover td {
  background: rgba(255,255,255,0.02);
}
```

### Mobile tables

Convert to cards on mobile (`<768px`):
- Each row becomes a card
- Column headers become labels within the card
- Better for touch and small screens

---

## 19. Responsive breakpoints

```css
/* Mobile-first */
/* Default: <768px */

@media (min-width: 768px) {
  /* Tablet */
}

@media (min-width: 1024px) {
  /* Small desktop */
}

@media (min-width: 1280px) {
  /* Desktop */
}

@media (min-width: 1536px) {
  /* Large desktop */
}
```

### Touch targets

Minimum 44x44px on mobile for all interactive elements.

### Sidebar behavior

| Width | Behavior |
|-------|----------|
| ≥1024px | Always visible |
| 768-1024px | Visible, can be collapsed to icon-only |
| <768px | Hidden, opens as drawer with hamburger button |

---

## 20. Dark/Light theme rules

### What stays the same in both themes
- Brand colors (indigo, cyan, emerald, etc.)
- Component shapes (radius, padding)
- Typography
- Animations

### What changes
- Background colors
- Surface colors
- Text colors
- Border colors
- Shadow intensity (lighter shadows in light theme)

### Switching

Use `data-theme` attribute on `<html>`:
```js
document.documentElement.dataset.theme = 'light' | 'dark';
```

Persist preference:
```js
localStorage.setItem('theme', theme);
// Also: save to user profile in DB
```

Smooth transition:
```css
body {
  transition: background-color 400ms ease, color 400ms ease;
}
```

---

## 21. Reference: working mockup

The canonical visual reference is at:

**`design/lm-dashboard.html`**

Open this file in a browser. Match this exactly. When in doubt about a visual decision, refer to this file before improvising.

---

## 22. Components inventory

These are the components that need to exist in `packages/ui/`:

### Atoms
- Button (primary, secondary, ghost, icon)
- Input
- Select
- Textarea
- Checkbox
- Radio
- Switch
- Badge
- Avatar
- Icon wrapper
- Spinner
- Skeleton

### Molecules
- Card (with head, body, actions)
- StatCard (KPI with sparkline)
- FormField (label + input + error)
- PillToggle (segmented control)
- SearchInput
- Tabs (horizontal)
- Breadcrumb
- DropdownMenu
- Tooltip
- Popover
- Dialog (modal)
- Toast
- ProgressBar

### Organisms
- Sidebar (with submenu support)
- Topbar
- DataTable
- AppointmentList
- ActivityFeed
- DonutChart
- LineChart
- BarChart
- AgentChatPanel (CIFO)
- NotificationDrawer
- CommandPalette (⌘K)

### Templates
- AppLayout (sidebar + topbar + main)
- AuthLayout (centered card)
- ModuleLayout (with module tabs)

---

**Next:** Read `AI_AGENTS.md` for CIFO and Audit Agent details.

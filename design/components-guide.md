# Components Guide

> **Purpose:** Canonical implementations of every UI component used in LM Super Admin. When in doubt, follow these patterns exactly.
>
> **Stack:** React 19 + TypeScript + Tailwind + shadcn/ui + Lucide icons
>
> **See also:** `docs/DESIGN_SYSTEM.md` for design philosophy. This file shows the *code*.

---

## 1. Buttons

### 1.1 Primary button
```tsx
<Button variant="primary" size="md">
  Save changes
</Button>
```
- Background: `bg-brand` → hover `bg-brand/90`
- Text: white, `font-semibold`
- Padding: `px-4 py-2` (md), `px-3 py-1.5` (sm), `px-6 py-3` (lg)
- Radius: `rounded-md`
- Transition: `transition-all duration-150`
- With icon: `<Icon className="h-4 w-4 mr-2" />`

### 1.2 Secondary (ghost) button
- Background: `bg-bg-elev-2` → hover `bg-bg-elev-3`
- Border: `border border-border`
- Text: `text-fg`
- Same padding/radius as primary

### 1.3 Destructive button
- Background: `bg-rose` → hover `bg-rose/90`
- Used only for irreversible actions (delete, ban, etc.)
- Always paired with confirm dialog

### 1.4 Icon-only button
- Square: `h-9 w-9`
- Same variants as above
- Tooltip required for accessibility

---

## 2. Cards

### 2.1 Default card
```tsx
<div className="bg-bg-elev-1 border border-border rounded-lg p-6 shadow-sm">
  <h3 className="text-lg font-semibold text-fg mb-2">Title</h3>
  <p className="text-sm text-fg-muted">Description</p>
</div>
```
- Hover: `hover:border-border-strong hover:shadow-md transition-all`
- Padding: `p-6` (default), `p-4` (compact), `p-8` (spacious)

### 2.2 KPI Card (most common — see section 3 for full impl)

### 2.3 Action card (clickable)
- Add `cursor-pointer`
- Add `hover:bg-bg-elev-2`
- Wrap in `<button>` or `<Link>` for keyboard accessibility

---

## 3. KPI Card (canonical pattern)

> **This is THE most-used component.** Follow this pattern exactly.

```tsx
<KPICard
  label="Revenue this month"
  value="$48,329"
  delta={{ value: 12.4, direction: 'up' }}
  sparkline={[20, 24, 22, 28, 31, 35, 38, 42, 48]}
  accent="brand"  // or "cyan" | "emerald" | "amber" | "rose"
  icon={DollarSign}
/>
```

### Visual structure
- Top row: icon + label
- Middle: large value (`text-3xl font-bold`)
- Bottom row: delta badge + sparkline
- Sparkline in `accent` color
- Delta arrow: ↑ (up = emerald), ↓ (down = rose)

### Tailwind classes
```
bg-bg-elev-1
border border-border
rounded-lg
p-5
flex flex-col gap-3
hover:border-border-strong
transition-colors
```

### Icon container
```
h-9 w-9
rounded-md
bg-{accent}/10
text-{accent}
flex items-center justify-center
```

---

## 4. Inputs

### 4.1 Text input
```tsx
<Input placeholder="Enter email..." />
```
- Background: `bg-bg-elev-2`
- Border: `border border-border` → focus `border-brand`
- Text: `text-fg`, placeholder: `text-fg-subtle`
- Padding: `px-3 py-2`
- Radius: `rounded-md`
- Focus ring: `focus:ring-2 focus:ring-brand/30`

### 4.2 Select / dropdown
- Use shadcn/ui `<Select>`
- Same styling as text input
- Chevron icon on right

### 4.3 Textarea
- Same as text input
- `min-h-24` default
- Optional autosize via `react-textarea-autosize`

### 4.4 Search input
- Add search icon left, `pl-10`
- Optional clear button right when value present

---

## 5. Badges & Pills

### 5.1 Status badge
```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Failed</Badge>
<Badge variant="info">New</Badge>
```
- Padding: `px-2 py-0.5`
- Text size: `text-xs font-medium`
- Radius: `rounded-full`
- Color variants:
  - success: `bg-emerald/15 text-emerald`
  - warning: `bg-amber/15 text-amber`
  - error: `bg-rose/15 text-rose`
  - info: `bg-cyan/15 text-cyan`
  - default: `bg-bg-elev-2 text-fg-muted`

### 5.2 Pill toggle (theme/lang)
- Container: `bg-bg-elev-2 rounded-full p-1 flex gap-1`
- Each option: `px-3 py-1 rounded-full text-xs font-medium`
- Active: `bg-brand text-white shadow-sm`
- Inactive: `text-fg-muted hover:text-fg`

---

## 6. Avatar

```tsx
<Avatar size="md" name="Erick Salinas" src={imageUrl} />
```
- Sizes: sm (h-8 w-8), md (h-10 w-10), lg (h-12 w-12)
- Fallback: initials on gradient background
- Border: `ring-2 ring-bg-elev-1`
- Status dot (optional): bottom-right, colored dot

---

## 7. Sidebar

### 7.1 Structure
```
Sidebar (260px wide, collapsible to 72px)
├── Logo header (h-16)
├── Search/command palette trigger (⌘K)
├── Nav items (groups with section headers)
│   ├── Item (icon + label + chevron if expandable)
│   └── Sub-items (indented when expanded)
├── Recent items section
└── User profile footer (avatar + name + role)
```

### 7.2 Nav item
- Padding: `px-3 py-2`
- Radius: `rounded-md`
- Default: `text-fg-muted hover:bg-bg-elev-2 hover:text-fg`
- Active: `bg-brand-soft text-brand` (brand identity per module)
- Icon: `h-4 w-4 mr-3`

### 7.3 Active module color identity
> When user is in Finance module, sidebar active uses cyan instead of brand.
- Dashboard: `brand`
- Users: `brand-2`
- Employees: `brand`
- Finance: `cyan`
- Performance: `emerald`
- Lawyers: `amber`
- Providers: `brand-2`
- AI Agents: `cyan` (gradient brand→cyan)
- Settings: `fg-muted`

---

## 8. Topbar

### 8.1 Structure
```
Topbar (h-16, sticky top-0, z-sticky)
├── Page title / breadcrumb (left)
├── Spacer (flex-1)
├── Theme toggle (pill)
├── Language toggle (pill)
├── Notifications bell (with badge)
└── User menu (avatar + name + role + chevron)
```

### 8.2 Notifications bell
- Icon button
- Red dot if unread (use rose)
- Click → dropdown panel
- Panel: `w-96`, max-h-96, scrollable

---

## 9. Charts (Recharts)

### 9.1 Sparkline (in KPI cards)
```tsx
<ResponsiveContainer width="100%" height={32}>
  <LineChart data={data}>
    <Line
      type="monotone"
      dataKey="value"
      stroke="var(--brand)"
      strokeWidth={2}
      dot={false}
    />
  </LineChart>
</ResponsiveContainer>
```
- No axes, no grid, no tooltip
- Color matches accent prop

### 9.2 Donut chart (clinic distribution)
```tsx
<PieChart>
  <Pie
    data={data}
    innerRadius={60}
    outerRadius={80}
    paddingAngle={2}
    dataKey="value"
  >
    {data.map((entry, i) => (
      <Cell key={i} fill={colors[i]} />
    ))}
  </Pie>
</PieChart>
```
- Colors from palette: brand, brand-2, cyan, emerald
- Center label shows total

### 9.3 Area chart (performance over time)
- Gradient fill from accent → transparent
- Smooth curves (`type="monotone"`)
- Light grid (`strokeDasharray="3 3"`, `stroke="var(--border-subtle)"`)
- Tooltip on hover with custom content

### 9.4 Bar chart (comparison)
- Rounded top corners (`radius={[4, 4, 0, 0]}`)
- Solid color or gradient
- Y-axis hidden, values on hover

---

## 10. Empty states

```tsx
<EmptyState
  icon={InboxIcon}
  title="No referrals yet"
  description="When lawyers submit referrals, they'll appear here."
  action={<Button>Send invite</Button>}
/>
```
- Icon: 48px, `text-fg-subtle`
- Title: `text-lg font-semibold`
- Description: `text-sm text-fg-muted max-w-md text-center`
- Padding: `py-12`
- Centered

---

## 11. Loading states

### 11.1 Skeleton
```tsx
<Skeleton className="h-4 w-32" />
```
- Background: `bg-bg-elev-2`
- Animation: `animate-pulse`
- Shapes: rect (default), circle (`rounded-full`)

### 11.2 Spinner
```tsx
<Loader2 className="h-4 w-4 animate-spin text-brand" />
```
- Use Lucide `Loader2` icon
- Always spin

### 11.3 Page loading
- Full-page spinner centered
- Or skeleton layout matching the destination page

---

## 12. Toasts (Sonner)

```tsx
toast.success("Changes saved");
toast.error("Failed to save");
toast.info("New version available");
```
- Position: top-right
- Duration: 4s default
- Stack on multiple
- Color matches type

---

## 13. Modals & Drawers

### 13.1 Modal (centered, for confirmations and forms)
- Use shadcn `<Dialog>`
- Max width: `max-w-md` (small), `max-w-lg` (default), `max-w-2xl` (large)
- Padding: `p-6`
- Header: title + close button
- Footer: action buttons (right-aligned)

### 13.2 Drawer (right slide-in, for details)
- Use shadcn `<Sheet>` with `side="right"`
- Width: `w-96` (default), `w-[640px]` (wide)
- Used for: viewing details, edit forms, agent action details

---

## 14. Forms

### 14.1 Form structure
```tsx
<form className="space-y-6">
  <div>
    <Label htmlFor="email">Email</Label>
    <Input id="email" />
    <p className="text-xs text-fg-subtle mt-1">Helper text</p>
  </div>
  ...
  <div className="flex justify-end gap-2">
    <Button variant="secondary">Cancel</Button>
    <Button variant="primary">Save</Button>
  </div>
</form>
```

### 14.2 Validation
- Use `react-hook-form` + `zod`
- Show error below field: `text-xs text-rose mt-1`
- Border on error: `border-rose`

---

## 15. Tables

### 15.1 Default table
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      ...
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Erick Salinas</TableCell>
      ...
    </TableRow>
  </TableBody>
</Table>
```
- Header: `text-xs uppercase text-fg-subtle font-medium`
- Rows: `border-b border-border-subtle`
- Hover: `hover:bg-bg-elev-2`
- Padding: `py-3 px-4`

### 15.2 Sortable columns
- Click header → sorts
- Show arrow icon on active sort
- Use `@tanstack/react-table`

### 15.3 Pagination
- Show "1–10 of 245" + page selector + prev/next
- Or infinite scroll for large datasets

---

## 16. Responsive rules

### 16.1 Breakpoints
- Mobile: `< 768px`
- Tablet: `768px – 1024px`
- Desktop: `> 1024px`

### 16.2 Mobile adaptations
- Sidebar → hamburger drawer
- KPI cards → 1 column (stack)
- Tables → cards (each row becomes a card) or horizontal scroll
- Topbar → simplified (hide some toggles in menu)
- CIFO panel → full-width

### 16.3 Use Tailwind responsive prefixes
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {kpis.map(...)}
</div>
```

---

## 17. Icons (Lucide)

- Always use `lucide-react`
- Default size: `h-4 w-4` (16px)
- Larger contexts: `h-5 w-5` or `h-6 w-6`
- Color: inherit from parent (`text-fg`, `text-brand`, etc.)
- Always include `aria-label` on icon-only buttons

```tsx
import { DollarSign, Users, Calendar, Settings } from 'lucide-react';
```

---

## 18. Accessibility checklist

- [ ] All interactive elements have keyboard support (Tab, Enter, Esc)
- [ ] All icons-only buttons have `aria-label` or tooltip
- [ ] All inputs have associated `<label>`
- [ ] Color contrast ratio ≥ 4.5:1 for text
- [ ] Focus states visible (ring or border change)
- [ ] Modals trap focus
- [ ] Screen reader friendly (semantic HTML)
- [ ] Loading states announced (`aria-live`)

---

> **When you build a new component, ask:**
> 1. Does it follow these patterns?
> 2. Does it use design tokens (no hardcoded colors)?
> 3. Is it responsive?
> 4. Is it accessible?
>
> If yes to all → ship it.

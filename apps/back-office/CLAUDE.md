# Back-office · Reglas para construir vistas

> Este documento se lee al iniciar cada sesión sobre el back-office. Las reglas
> aquí escritas son **vinculantes** — no son sugerencias.

---

## Regla #0 · Estilo visual del sistema (CRÍTICA)

**Todo módulo, vista, modal o pantalla nueva DEBE usar exclusivamente los
primitivos de `@/components/ui-phoenix`.**

El estilo visual de referencia es **`apps/web` (admin de producción)**. No hay
estilos alternativos — todas las pantallas del back-office deben verse de la
misma familia. Cuando construyas algo nuevo:

1. **Antes de escribir CSS**: revisá si hay un primitivo en `components/ui-phoenix/` que
   ya resuelve lo que necesitás (`PageHeader`, `KpiCard`, `DataTable`, `IconAction`,
   `StatusPill`, `TagPill`, `Skeleton`, `EmptyState`, `EntityAvatar`, `PersonAvatar`).
2. **Si necesitás algo nuevo que pueda repetirse**: agregalo a `ui-phoenix/` con su
   doc + tipo exportado. **No inline en la pantalla**.
3. **Si necesitás un átomo único de esa pantalla** (ej. un wrapper de dominio): hacelo
   chiquito y consistente con los tokens (ver tabla abajo).

### Anti-patrones prohibidos

| ❌ NO | ✅ SÍ |
|---|---|
| `border-2 border-rose/40` (bordes gruesos saturados) | `border border-border` o `border border-rose/30` |
| `bg-gradient-to-br from-rose/10 to-rose/5 p-4` (gradients en cada section) | `rounded-lg border border-border bg-bg-1 p-5` |
| Crear `<Section>`, `<Field>`, `<Card>` locales en cada pantalla | Usar primitivos de `ui-phoenix` o agregar uno nuevo ahí |
| Pills grandes con `text-sm px-3 py-1.5` | `TagPill` o `StatusPill` (`text-[10px] px-2 py-0.5`) |
| Avatars con `w-12 h-12 rounded-lg bg-gradient-cyan` inline | `<EntityAvatar size={12} />` o `<PersonAvatar size={12} />` |
| Iconos `w-5 h-5` o `w-6 h-6` en headers de sección | `w-4 h-4` para headers, `w-3.5 h-3.5` para acciones, `w-3 h-3` para inline |
| `text-white` | `text-text-1` |
| `from-bg-1 via-bg-1 to-brand/5` (gradients de fondo en cards) | Background plano + accents puntuales |

### Design tokens canónicos

| Uso | Token / clase |
|---|---|
| Texto label (KPI / th / sección uppercase) | `text-[10px] uppercase tracking-wider font-semibold text-text-muted` |
| Título de sección | `text-text-1 font-semibold text-sm uppercase tracking-wider` + icon `w-4 h-4 text-brand` |
| H1 page | `text-2xl font-bold text-text-1` (usar `PageHeader`) |
| Card container | `rounded-lg border border-border bg-bg-1 p-5` |
| Sub-card / inner box | `rounded-md bg-bg-2/40 border border-border/40 p-3` |
| Body cell (default) | `text-sm` |
| Body cell para texto largo | `text-[12.5px]` |
| Hover row | `hover:bg-white/[0.02]` |
| Inactive row | `opacity-50` |
| Highlighted row (favorito) | `bg-brand/[0.04]` |
| Dots de status | `w-1.5 h-1.5 rounded-full` |
| Quote (cita citable) | `text-[11px] italic text-text-muted` |
| Note de info | `rounded-md border border-{tone}/30 bg-{tone}/10 px-3 py-2 text-[11px] text-{tone}` |
| Color tokens | `brand`, `cyan`, `emerald`, `amber`, `rose`, `violet`, `pink` (NUNCA inventar nuevos) |

### Color por intención (no por gusto)

- **brand** (indigo) — acciones primarias, links, foco
- **cyan** — info / contextual
- **emerald** — success / activo / confirmado
- **amber** — warning / atención
- **rose** — danger / delete / alerta
- **violet** — variantes secundarias (Med Pay, etc)
- **pink** — variantes terciarias (rara vez)

### Patrón canónico de pantalla

Ver `components/ui-phoenix/README.md` para el ejemplo completo. Cualquier pantalla
de catálogo debe verse como Specialties (B.36), Lawyers (B.30), Insurances (B.32).
Cualquier dashboard debe verse como B.29. Cualquier detalle debe verse como
`/front-office/[id]`.

---

## Regla #1 · Loading states

Toda navegación que dispare `router.refresh()` o un `useTransition` debe llamar
`useTransitionProgress(isPending)` para activar la **NavigationProgress** global
(barra superior).

Toda ruta server-component pesada debe tener su propio `loading.tsx` con
`Skeleton` primitives — o herede del `(admin)/loading.tsx` genérico.

---

## Regla #2 · i18n

Todo string visible al usuario debe pasar por `useTranslations()` con namespace
`phoenix.*`. Las strings en ambos idiomas (es/en) están en
`packages/i18n/messages/{es,en}.json`. **No hardcodear strings en español**
en componentes nuevos.

Excepción temporal: los modales de B.2/B.3/B.4 que se construyeron en español
quedan como deuda técnica documentada — migrar cuando se toquen.

---

## Regla #3 · HIPAA / PHI

- Phase 1A: cero PHI real. Solo mock data en `phoenix-dev` Supabase.
- Audit log obligatorio (`writeAuditLog`) en cualquier mutación de Case, Patient,
  Appointment, etc.
- `actorType` siempre presente (HUMAN_USER / AI_AGENT / SYSTEM).
- NO commitear secrets · `.env` files gitignored.

---

## Regla #4 · Mobile-first (OBLIGATORIA)

**Toda vista, modal o módulo nuevo debe verse y funcionar bien en mobile (320px+)
sin scroll horizontal, sin botones cortados, sin texto cortado.**

Recepción usa iPad y teléfono · doctores usan iPad · attorney portal se ve en
teléfono. Si una pantalla se ve mal en mobile, **no está terminada**.

### Patrones obligatorios

**Grids:** nunca uses `grid-cols-2` o `grid-cols-3` directos. Siempre con breakpoint:
```tsx
// ❌ NO
<div className="grid grid-cols-2 gap-3">

// ✅ SÍ
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
```

**Headers con varios elementos:** siempre `flex-wrap`:
```tsx
<div className="flex items-center gap-2 flex-wrap">
```

**Footers de modales:** stack en mobile, fila en desktop:
```tsx
<DialogFooter className="flex-col sm:flex-row gap-2">
  <Button className="w-full sm:w-auto">Cancelar</Button>
  <Button className="w-full sm:w-auto">Guardar</Button>
</DialogFooter>
```

**Modals grandes:** ya tenés `max-h-[92vh]` pero también usá padding responsivo:
```tsx
<DialogContent className="max-w-5xl p-0 sm:p-0">
  <div className="px-4 sm:px-6 py-3 sm:py-4">...</div>
</DialogContent>
```

**Texto largo en pills/labels:** truncar o esconder en mobile:
```tsx
<span className="hidden sm:inline">{textoLargo}</span>
<span className="sm:hidden">{textoCorto}</span>
```

**Cards seleccionables / segmented controls de 3+ opciones:** en mobile, 1 columna
(no apretar):
```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
```

**Iconos:** mismos tamaños en todos los breakpoints · no shrinkear demasiado.

**Tablas anchas:** envolver en `overflow-x-auto` (ya lo hace `DataTable.Scroll`),
pero en mobile preferir layout de cards (ver `apps/web/dashboard/users` desktop vs
mobile cards).

### Breakpoints estándar (Tailwind)

| Breakpoint | Tamaño mínimo | Uso típico |
|---|---|---|
| `sm:` | 640px | Tablet portrait · cambio de 1-col a 2-col en forms |
| `md:` | 768px | Tablet landscape · aparece sidebar fijo |
| `lg:` | 1024px | Desktop · grids de 3-4 columnas |
| `xl:` | 1280px | Desktop wide · grids de 4+ columnas |

### Checklist antes de commitear una vista nueva

- [ ] Sin scroll horizontal en 375px (iPhone SE)
- [ ] Todos los botones se ven completos · footer stacks
- [ ] Grids responsive (`grid-cols-1 sm:grid-cols-X` en lugar de `grid-cols-X`)
- [ ] Headers con `flex-wrap` cuando tienen 3+ items
- [ ] Texto largo truncado o escondido en mobile
- [ ] Modal content scrollable internamente · footer fijo abajo
- [ ] Tested mentalmente en mobile (375px) y tablet (768px)

---

## Cuando dudes

1. Buscá si existe el patrón en `apps/web/components/` o `apps/web/app/(admin)/`
2. Buscá si existe primitivo en `apps/back-office/components/ui-phoenix/`
3. Si no existe, agregalo al primitivo · no inline

**Nunca crees una "alternativa propia" del estilo.** Si ves que estás escribiendo
muchas clases custom, parate y preguntate qué primitivo te falta.

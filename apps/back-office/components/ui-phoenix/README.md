# ui-phoenix — primitivos compartidos del back-office

Fuente de verdad para el estilo visual de **todas** las pantallas del back-office.
Origen: B.36 Specialties (la primera que pulimos al estilo del admin).

## ⚠ Regla #0 · ESTILO DEL ADMIN ES OBLIGATORIO

> **Todo módulo, vista o pantalla nueva DEBE usar el estilo de `apps/web` (admin).**
> No hay alternativas. Si necesitás algo nuevo, agregalo a este módulo — nunca
> inline en la pantalla.

Cuando construyas algo nuevo:
1. Buscá primero en `apps/web/components/` o `apps/web/app/(admin)/` el patrón equivalente
2. Buscá si existe ya en este módulo (`ui-phoenix/`)
3. Si no existe, **agregalo a `ui-phoenix/`** con doc + tipo · no inline

**Anti-patrones explícitamente prohibidos** (ver `apps/back-office/CLAUDE.md` para la
tabla completa):
- `border-2` (los bordes son siempre `border` simple)
- `bg-gradient-to-*` en cards/sections (gradients solo en `bg-gradient-brand` para CTAs)
- `<Section>`, `<Field>`, `<Card>` locales (usar los primitivos)
- `text-white` (usar `text-text-1`)
- Iconos `w-5 h-5` en lugares donde corresponde `w-4 h-4` o `w-3.5 h-3.5`

## Regla #1

> Si vas a hacer una pantalla nueva, importá desde `@/components/ui-phoenix`.
> Si necesitás un componente nuevo que pueda repetirse, AGREGALO ACÁ — no inline.

Cada vez que se copia-pega un átomo en una pantalla, aparece drift sutil que rompe la consistencia visual.

## Catálogo

| Componente       | Propósito                                                          | Tamaños fijos              |
| ---------------- | ------------------------------------------------------------------ | -------------------------- |
| `PageHeader`     | h1 + subtitle + action button al tope de cada pantalla             | h1 `text-2xl font-bold`    |
| `KpiCard`        | Tarjeta de métrica con label + número grande + sub                 | value `text-3xl`           |
| `FilterPill`     | Toggle de filtro con gradient brand activo                         | `text-xs px-3 py-1.5`      |
| `IconAction`     | Botón 32x32 con icono lucide 14px (acciones de fila)               | `w-8 h-8` · icon `w-3.5`   |
| `StatusPill`     | Pill chiquito con dot + label (6 estados predefinidos)             | `text-[10px] px-2 py-0.5`  |
| `TagPill`        | Pill con color libre (para tipos de dominio, no estados)           | `text-[10px]`              |
| `DataTable.*`    | Wrapper tipado para `<table>` con header consistente               | th `text-[10px] uppercase` |
| `TableFooter`    | Pie de tabla con contadores y branding                             | `text-xs`                  |
| `EmptyState.*`   | Inline (en tabla) y Rich (vista vacía con icono)                   | icon Rich `w-12 h-12`      |
| `EntityAvatar`   | Avatar `rounded-lg` para bufetes, aseguradoras, clínicas           | default `w-9 h-9`          |
| `PersonAvatar`   | Avatar `rounded-full` para pacientes, users, attorneys, employees  | default `w-9 h-9`          |

## Convenciones canónicas

| Token                    | Valor                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| Texto label (KPI / th)   | `text-[10px] uppercase tracking-wider font-semibold text-text-muted`             |
| Número grande KPI        | `text-3xl font-bold` + color custom (`text-emerald`, `text-rose`, etc.)          |
| Sub-texto KPI            | `text-[11px] text-text-muted`                                                    |
| Pills (status/type)      | `text-[10px] font-semibold px-2 py-0.5 rounded-md border`                        |
| Dot en pill              | `w-1.5 h-1.5 rounded-full`                                                       |
| Body cell (default)      | `text-sm` con `px-5 py-3.5`                                                      |
| Body cell descripción    | `text-[12.5px]` (más legible para texto largo)                                   |
| Card container           | `rounded-lg border border-border bg-bg-1`                                        |
| Row hover                | `hover:bg-white/[0.02]`                                                          |
| Row inactivo             | `opacity-50`                                                                     |
| Row destacado (favorito) | `bg-brand/[0.04]`                                                                |
| Avatar persona           | `rounded-full bg-gradient-brand`                                                 |
| Avatar entidad           | `rounded-lg bg-gradient-cyan` (o color sólido por brand)                         |

## Patrón de pantalla canónica

```tsx
import {
  PageHeader, KpiCard, FilterPill, IconAction,
  StatusPill, DataTable, TableFooter, EmptyState,
} from '@/components/ui-phoenix';
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@precision/ui';

export function MyCatalogClient({ items, stats }: Props) {
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const filtered = items.filter(/* ... */);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi Catálogo"
        subtitle={`${stats.active} activos · ${stats.total} totales`}
        action={
          <Button onClick={onNew}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total"    value={stats.total}    sub="Catálogo"   />
        <KpiCard label="Activos"  value={stats.active}   sub="Live"       color="text-emerald" />
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <FilterPill active={filter === 'all'}    onClick={() => setFilter('all')}    label="Todos"    count={stats.total} />
        <FilterPill active={filter === 'active'} onClick={() => setFilter('active')} label="Activos"  count={stats.active} />
      </div>

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>Nombre</DataTable.Th>
              <DataTable.Th align="center">Estado</DataTable.Th>
              <DataTable.Th align="right">Acciones</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr><DataTable.Td colSpan={3}><EmptyState.Inline message="Sin registros" /></DataTable.Td></tr>
              ) : filtered.map((x) => (
                <DataTable.Row key={x.id} muted={!x.isActive}>
                  <DataTable.Td>{x.name}</DataTable.Td>
                  <DataTable.Td align="center">
                    <StatusPill state={x.isActive ? 'active' : 'inactive'} label={x.isActive ? 'Activo' : 'Inactivo'} />
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <IconAction onClick={() => onView(x)}   icon={Eye}    label="Ver" />
                      <IconAction onClick={() => onEdit(x)}   icon={Pencil} label="Editar" />
                      <IconAction onClick={() => onDelete(x)} icon={Trash2} label="Eliminar" variant="danger" />
                    </div>
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter
          left={`${filtered.length} de ${stats.total}`}
          right={<span className="font-mono">phoenix-dev · local</span>}
        />
      </DataTable.Card>
    </div>
  );
}
```

## Futuro

Cuando 2+ apps del workspace (clinical, portal, attorney) usen estos primitivos,
mover el módulo a `packages/ui-phoenix/` para compartirlos sin duplicar código.

**Nunca** tocar `@precision/ui` (paquete shared con admin/timeclock prod) sin coordinación.

# PROMPT — Reporte de Horas · LM Super Admin
> **Para:** Antigravity  
> **Módulo:** Empleados → Tab "Reporte de Horas"  
> **Proyecto:** LM Super Admin · Precision Medical  
> **Fecha:** Mayo 2026

---

## ⚠️ INSTRUCCIONES PARA ANTIGRAVITY — LEER PRIMERO

```
ANTES DE ESCRIBIR UNA SOLA LÍNEA DE CÓDIGO:

1. Lee este prompt COMPLETO de principio a fin.
2. No implementes parte por parte — entiende el todo primero.
3. Sigue el orden exacto de las partes (1 → 12).
4. NO modifiques ningún tab existente:
   Lista · Pagos · Freelancers · Horarios · Asistencia
5. NO toques el PM Time Clock app.
6. NO modifiques attendance_records ni ninguna
   tabla existente (solo agrega employment_type).
7. Cuando termines, confirma los 12 puntos
   del checklist al final de este documento.
```

---

## DESCRIPCIÓN GENERAL

Crear el tab **"Reporte de Horas"** dentro del módulo Empleados de LM Super Admin. Este tab es el quinto tab al lado de Asistencia y está diseñado para el área contable de Precision Medical — permite generar reportes de horas regulares y extras por empleado para procesar la nómina.

**Stack:** Next.js 15 App Router · TypeScript · Tailwind · shadcn/ui · Supabase · tRPC/Prisma

---

## PARTE 1 — Agregar el tab

Encontrar la barra de tabs del módulo Empleados.

**Tabs actuales:**
```
Lista · Pagos · Freelancers · Horarios · Asistencia
```

**Nuevo orden:**
```
Lista · Pagos · Freelancers · Horarios · Asistencia · Reporte de Horas
```

El tab "Reporte de Horas" se agrega al final. No mover ni renombrar los tabs existentes.

---

## PARTE 2 — Reglas de overtime por país

El sistema aplica reglas diferentes según el país y tipo de contrato del empleado.

### EEUU — Utah (FLSA)

| Tipo | Overtime | Período de pago |
|------|----------|-----------------|
| Non-exempt (por hora) | Horas sobre 40h/semana = overtime | Quincenal o bi-semanal |
| Exempt (asalariado) | Sin overtime — salario fijo | Mensual (pago hasta día 7 siguiente mes) |

### Bolivia y Perú

- Overtime = horas sobre 40h/semana (misma regla para simplificar)
- El reporte muestra las horas — contabilidad aplica la tarifa local externamente

### Campo en la BD

Si no existe, agregar a la tabla `employees`:

```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_type text
  DEFAULT 'non_exempt'
  CHECK (employment_type IN ('exempt', 'non_exempt'));
```

---

## PARTE 3 — Períodos de pago disponibles

El selector de período ofrece estas opciones:

| Opción en UI | Rango de fechas |
|---|---|
| Esta semana | Lunes al domingo de la semana actual |
| Semana pasada | Lunes al domingo de la semana anterior |
| Quincena actual (1–15) | Del 1 al 15 del mes actual |
| Quincena actual (16–fin) | Del 16 al último día del mes actual |
| Quincena pasada (1–15) | Del 1 al 15 del mes anterior |
| Quincena pasada (16–fin) | Del 16 al último día del mes anterior |
| Este mes | Del 1 al último día del mes actual |
| Mes pasado | Del 1 al último día del mes anterior |
| Rango personalizado | El usuario elige `from_date` y `to_date` |

Cuando se selecciona **"Rango personalizado"**, mostrar dos date inputs: Desde / Hasta.

---

## PARTE 4 — Lógica de cálculo de overtime

### Función principal

```typescript
interface WeekBlock {
  weekStart: Date
  weekEnd: Date
  totalHours: number
  regularHours: number
  overtimeHours: number
  days: DayRecord[]
}

interface EmployeeHoursSummary {
  totalRegular: number
  totalOvertime: number
  totalHours: number
  totalBreaks: number
  totalDaysWorked: number
  weekBlocks: WeekBlock[]
}

const calculateOvertimeForPeriod = (
  records: AttendanceRecord[],
  fromDate: Date,
  toDate: Date,
  employmentType: 'exempt' | 'non_exempt'
): EmployeeHoursSummary => {

  // 1. Dividir en semanas calendarias (Lunes–Domingo)
  const weeks = splitIntoCalendarWeeks(records, fromDate, toDate)

  let totalRegular = 0
  let totalOvertime = 0
  let totalBreaks = 0
  let totalDaysWorked = 0
  const weekBlocks: WeekBlock[] = []

  for (const week of weeks) {
    const weekHours = week.records
      .reduce((sum, r) => sum + (r.hours_worked || 0), 0)

    const breakHours = week.records
      .reduce((sum, r) => sum + ((r.break_minutes || 0) / 60), 0)

    let regularH: number
    let overtimeH: number

    if (employmentType === 'exempt') {
      // Asalariados: sin overtime, todo regular
      regularH = weekHours
      overtimeH = 0
    } else {
      // Por hora: overtime sobre 40h/semana
      regularH = Math.min(weekHours, 40)
      overtimeH = Math.max(0, weekHours - 40)
    }

    totalRegular += regularH
    totalOvertime += overtimeH
    totalBreaks += breakHours
    totalDaysWorked += week.records
      .filter(r => (r.hours_worked || 0) > 0).length

    weekBlocks.push({
      weekStart: week.start,
      weekEnd: week.end,
      totalHours: round2(weekHours),
      regularHours: round2(regularH),
      overtimeHours: round2(overtimeH),
      days: week.records
    })
  }

  return {
    totalRegular: round2(totalRegular),
    totalOvertime: round2(totalOvertime),
    totalHours: round2(totalRegular + totalOvertime),
    totalBreaks: round2(totalBreaks),
    totalDaysWorked,
    weekBlocks
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
```

### Helper — dividir en semanas calendarias

```typescript
const splitIntoCalendarWeeks = (
  records: AttendanceRecord[],
  fromDate: Date,
  toDate: Date
) => {
  // Semana = Lunes 00:00 → Domingo 23:59
  // Las semanas parciales en los bordes del período
  // se incluyen pero solo con los días dentro del rango
  const weeks = []
  let current = getMondayOf(fromDate)

  while (current <= toDate) {
    const weekEnd = new Date(current)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const weekRecords = records.filter(r => {
      const d = new Date(r.date)
      return d >= current && d <= weekEnd
              && d >= fromDate && d <= toDate
    })

    if (weekRecords.length > 0) {
      weeks.push({ start: current, end: weekEnd, records: weekRecords })
    }

    current = new Date(current)
    current.setDate(current.getDate() + 7)
  }

  return weeks
}

const getMondayOf = (date: Date) => {
  const d = new Date(date)
  const day = d.getDay() // 0=Dom, 1=Lun...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
```

> **⚠️ Error común a evitar:** NO sumar todas las horas del período y aplicar el límite de 40h una sola vez. El overtime se calcula **por semana calendaria**, luego se suman los resultados.

---

## PARTE 5 — API route

### `GET /api/reports/hours`

**Query params:**
- `from_date` (date, requerido)
- `to_date` (date, requerido)
- `employee_id?` (uuid, opcional)
- `country?` ('EEUU' | 'Bolivia' | 'Peru')
- `employment_type?` ('exempt' | 'non_exempt')

**Query SQL:**

```sql
SELECT
  e.id,
  e.full_name,
  e.employee_code,
  e.employment_type,
  e.country,
  e.department,
  ar.id        AS record_id,
  ar.date,
  ar.check_in,
  ar.check_out,
  ar.hours_worked,
  ar.break_minutes,
  ar.clinic_name,
  ar.status,
  ar.late_minutes
FROM employees e
LEFT JOIN attendance_records ar
  ON  ar.employee_id = e.id
  AND ar.date BETWEEN $from_date AND $to_date
  AND ar.check_out IS NOT NULL
WHERE e.is_active = true
  AND ($employee_id IS NULL OR e.id = $employee_id)
  AND ($country IS NULL OR e.country = $country)
ORDER BY e.full_name, ar.date
```

**Procesamiento server-side:**
- Agrupar registros por empleado
- Para cada empleado llamar `calculateOvertimeForPeriod()`
- Devolver el resumen agregado + detalle por semana

**Forma de la respuesta:**

```typescript
{
  period: { from: string, to: string, type: string },
  summary: {
    totalRegularHours: number,
    totalOvertimeHours: number,
    totalHours: number,
    totalBreakHours: number,
    totalEmployees: number,
    employeesWithOvertime: number
  },
  employees: Array<{
    id: string,
    full_name: string,
    employee_code: string,
    employment_type: 'exempt' | 'non_exempt',
    country: string,
    department: string,
    totalRegular: number,
    totalOvertime: number,
    totalHours: number,
    totalBreaks: number,
    totalDaysWorked: number,
    weekBlocks: WeekBlock[],
    dailyRecords: AttendanceRecord[]
  }>
}
```

---

## PARTE 6 — Layout de la página

### Header

```
[Título: "Reporte de horas"]     [Filtros →] [Generar] [PDF] [Excel]
[Subtítulo: período · N empleados]
```

**Filtros en el header (flex row, flex-wrap, gap 8px):**

1. **Selector de período** — dropdown con las opciones de Parte 3
   - Al elegir "Rango personalizado" → mostrar 2 date inputs
2. **País** — Todos los países / 🇺🇸 EEUU / 🇧🇴 Bolivia / 🇵🇪 Perú
3. **Tipo** — Todos / Por hora (Non-exempt) / Asalariado (Exempt)
4. **Empleado** — dropdown buscable, opcional
5. **Botón "Generar reporte"** — color indigo primario — dispara el fetch
6. **Botón PDF** — icono `ti-file-type-pdf`
7. **Botón Excel** — icono `ti-table-export`

### Estado inicial (antes de generar)

```
[Icono ti-report-analytics grande, muted]
"Selecciona un período y genera el reporte"
"Los datos se calcularán desde attendance_records"
[Botón: Generar reporte]
```

### Después de generar — orden de secciones

1. Alerta de overtime (solo si totalOvertimeHours > 0)
2. 4 KPI cards
3. Tabla expandible de empleados

---

## PARTE 7 — KPI cards

Mostrar solo después de hacer clic en "Generar reporte". Mostrar skeleton mientras carga.

| Card | Border-left | Valor | Sub-texto |
|------|-------------|-------|-----------|
| Horas regulares | `#10B981` | Suma regulares | "N empleados" |
| Horas extras | `#F43F5E` | Suma overtime | "N con overtime" — muted si es 0 |
| Total horas | `#6366F1` | Regular + overtime | "del período" |
| Breaks no pagados | `#F59E0B` | Total breaks en horas | "descontados" |

**Mobile:** grid 2×2

### Alerta de overtime

Mostrar solo cuando `totalOvertimeHours > 0`:

```
[ti-alert-triangle rose]
"N empleados tienen horas extras este período"
"Revisa el detalle antes de procesar la nómina" [muted]
```

Estilo:
```css
background: rgba(244,63,94,0.05);
border: 1px solid rgba(244,63,94,0.18);
border-radius: var(--border-radius-md);
padding: 10px 14px;
```

---

## PARTE 8 — Tabla expandible

### Controles sobre la tabla

Alineados a la derecha:
- `[Expandir todo]` `[Colapsar todo]` — botones pequeños secundarios

### Columnas

| Columna | Ancho | Notas |
|---------|-------|-------|
| EMPLEADO | flex 1 | Avatar + nombre + código + flag del país |
| TIPO | 110px | Badge: "Por hora" amber · "Asalariado" indigo |
| REGULARES | 90px | Right-align · monospace · color `#10B981` si > 0 |
| EXTRAS | 90px | Right-align · monospace · color `#F43F5E` si > 0 · `—` si es 0 · `N/A` italic si Exempt |
| TOTAL | 90px | Right-align · monospace · font-weight 500 |
| BREAKS | 70px | Right-align · monospace · muted |
| DÍAS | 60px | Right-align · muted |
| ▼ | 36px | Toggle expandir/colapsar |

### Estilo de filas

**Empleado CON overtime** (`overtimeHours > 0`):
```css
border-left: 3px solid #F43F5E;
background: rgba(244,63,94,0.025);
```

**Empleado asalariado (Exempt):**
- Columna EXTRAS: mostrar `N/A` en color muted, font-style italic

**Empleado SIN overtime:**
- Sin estilo especial

### Fila expandida — dos secciones lado a lado

#### Sección izquierda: Breakdown por semana

Para cada semana calendaria dentro del período:

```
Sem 1 · 01–07 May          38.5h
[████████████████████░░░░] — barra verde
38.5h regulares             / 40h

Sem 2 · 05–11 May          40.77h  ← color rose si overtime
[████████████████████████▓] — barra verde + rojo para overtime
40h regulares               +0.77h extras
```

**Lógica de la barra de progreso:**
- Ancho total de la barra = 100% representa 40h
- Porción verde = `min(weekHours, 40) / 40 * 100`%
- Si hay overtime: la porción roja se extiende más allá del 100%
  - Implementar como dos `<div>` en un contenedor `position: relative; overflow: visible`

#### Sección derecha: Detalle diario

Tabla con columnas: FECHA · CLÍNICA · ENTRADA · SALIDA · HORAS · ESTADO

**Badge de ESTADO:**
- `on_time` → "A tiempo" — emerald
- `late` → "Tardanza Xm" — amber
- `absent` → "Ausente" — rose

**Color de HORAS:**
- Emerald → día normal
- Rose → día que contribuye al overtime de esa semana

---

## PARTE 9 — Export PDF

### Estructura del PDF

**Header (cada página):**
```
PM · Precision Medical                    Reporte de Horas — Nómina
                                          Del [from_date] al [to_date]
                                          Generado el [fecha] por [admin]
────────────────────────────────────────────────────────────────────────
```

**Sección resumen:**
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ REGULARES   │ │ EXTRAS      │ │ TOTAL       │ │ BREAKS      │
│ 479.95 h    │ │ 9.77 h      │ │ 489.72 h    │ │ 8.63 h      │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**Tabla por empleado:**
- Una fila por empleado con: Nombre · Código · País · Tipo · Regular · Extra · Total · Breaks · Días
- Filas con overtime: fondo rose claro
- Asalariados: columna Extra muestra "N/A"

**Detalle semanal por empleado (indentado):**
- Debajo de cada empleado: semana · horas · regular · overtime

**Footer (cada página):**
```
Precision Medical · Confidencial · Página X de Y
```

**Nota al final del PDF:**
```
* Horas extras calculadas sobre 40h/semana según FLSA
  (empleados Non-exempt, EEUU Utah).
  Bolivia y Perú: horas sobre 40h/semana para referencia
  contable — la tarifa local la aplica contabilidad externamente.
```

> Usar el mismo enfoque de ReportLab/generación de PDF que ya existe en el sistema para el reporte ejecutivo.

---

## PARTE 10 — Export Excel

### Sheet 1: "Resumen"

Columnas:
```
Empleado | Código | País | Tipo | Días Trabajados |
Horas Regulares | Horas Extras | Total Horas | Breaks (h)
```

- Fila de encabezado: negrita, fondo indigo, texto blanco
- Filas con overtime: fondo rose claro
- Fila total al final: negrita

### Sheet 2: "Detalle diario"

Columnas:
```
Empleado | Código | Fecha | Clínica | Entrada | Salida |
Horas | Break (min) | Estado | Tardanza (min)
```

- Una fila por registro de `attendance_records`
- Ordenado por: nombre empleado ASC, fecha ASC

### Nombre del archivo
```
reporte-horas-[from_date]-[to_date].xlsx
```

---

## PARTE 11 — Estados vacíos y carga

### Estado de carga (skeleton)

Mientras el API responde:
- 4 KPI cards en gris con animación pulse
- Tabla: 5 filas placeholder con pulse

### Sin registros en el período

```
[Icono ti-calendar-off, muted]
"Sin registros para este período"
"No hay fichajes registrados entre [from] y [to]"
```

### Advertencia de registros incompletos

Si hay registros con `check_in` pero sin `check_out` en el período:

```
[Alerta amber]
"X registros incompletos no incluidos (sin hora de salida).
 Ve a Asistencia para corregirlos."
```

> Solo se incluyen registros donde `check_out IS NOT NULL`.

---

## PARTE 12 — Responsive mobile

### Breakpoints

| Elemento | Desktop | Mobile (< 768px) |
|----------|---------|-----------------|
| KPI cards | 4 columnas | 2×2 grid |
| Filtros | flex row | 2×2 grid |
| Tabla | tabla con columnas | cards por empleado |
| Modal/Export buttons | side by side | grid 2 columnas |

### Card de empleado en mobile

```
┌─────────────────────────────────────────┐
│ [Avatar] Nombre Apellido    [Tipo badge] │
│ EMP-0001 · 🇧🇴                          │
│                                         │
│ ┌───────────┐ ┌───────────┐ ┌─────────┐│
│ │ Regular   │ │ Extras    │ │ Total   ││
│ │ 81.68h    │ │ 0.77h     │ │ 82.45h ││
│ └───────────┘ └───────────┘ └─────────┘│
│                                         │
│ [█████████████████████▓] barra progreso │
│ 81.68h regulares          +0.77h extras │
└─────────────────────────────────────────┘
```

- Tap en card → expande detalle diario como lista scrollable dentro de la card
- Asalariados: sin barra de progreso, columna Extras muestra "N/A"
- Touch targets: mínimo 44×44px en todos los elementos interactivos

---

## PARTE 13 — Campo employment_type en UI

En **Empleados → Lista**, al editar un empleado (modal de edición existente), agregar un nuevo campo:

**"Tipo de contrato"**
- Toggle o select: `Por hora (Non-exempt)` / `Asalariado (Exempt)`
- Default: `Por hora (Non-exempt)`
- Este campo determina si se calculan horas extras o no

---

## RESUMEN DE REGLAS DE OVERTIME

```
EEUU Utah — Non-exempt (por hora):
  > 40h/semana = overtime
  Período: quincenal o bi-semanal

EEUU Utah — Exempt (asalariado):
  Sin overtime
  Período: mensual

Bolivia y Perú:
  > 40h/semana = mostrar como overtime referencial
  Contabilidad aplica tarifa local externamente

CÁLCULO (mismo para todos los países):
  1. Dividir en semanas calendarias (Lun–Dom)
  2. Sumar horas por semana separadamente
  3. Non-exempt: regular = min(horas, 40)
                 overtime = max(0, horas - 40)
  4. Exempt: regular = horas, overtime = 0
  5. Sumar resultados de todas las semanas
```

---

## ❌ NO TOCAR

- Tabs existentes: Lista · Pagos · Freelancers · Horarios · Asistencia
- App PM Time Clock (`apps/timeclock`)
- Datos en `attendance_records`
- Cualquier otro módulo del sistema
- Auth o permisos existentes

---

## ✅ CHECKLIST DE CONFIRMACIÓN

Cuando termines, confirma que todos estos puntos funcionan:

```
[ ] 1. Tab "Reporte de Horas" aparece en Empleados
[ ] 2. Selector de período cambia el rango de fechas
[ ] 3. "Generar reporte" llama al API y muestra resultados
[ ] 4. KPI cards muestran totales correctos
[ ] 5. Empleados non-exempt muestran overtime
        cuando sus horas semanales superan 40
[ ] 6. Empleados exempt muestran "N/A" en la columna Extras
[ ] 7. Bolivia y Perú calculan overtime igual que EEUU non-exempt
[ ] 8. Filas expandidas muestran breakdown semanal
        con barras de progreso verde/rojo
[ ] 9. Detalle diario muestra entrada/salida/horas/estado
[ ] 10. PDF descarga con layout correcto y nota de overtime
[ ] 11. Excel tiene 2 sheets: Resumen + Detalle diario
[ ] 12. employment_type es editable en el modal de empleado
[ ] 13. Mobile: cards por empleado debajo de 768px
[ ] 14. Advertencia de registros incompletos funciona
[ ] 15. Estado vacío aparece cuando no hay registros
```

---

*Generado para Antigravity · LM Super Admin v2.6 · Precision Medical*

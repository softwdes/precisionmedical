# Propuesta Ejecutiva — LienMaster Clínico

Documentos de presentación para alta gerencia de Clanton Enterprises Series LLC.

## 📄 Documentos disponibles

### 1. `lienmaster-propuesta-ejecutiva.html` (~17 páginas)

Documento principal de **estrategia, arquitectura y cumplimiento**. Sin mockups visuales — esos están en el documento complementario.

**Contenido:**
- Portada + Índice
- Parte A — Arquitectura y Roadmap
  - 1. Resumen ejecutivo
  - 2. Diagnóstico actual
  - 3. Modelo de dominio
  - 4. Estructura modular
  - 5. Subsistemas base
  - 6. Roadmap por fases (Gantt)
  - 7. MVP end-to-end
  - 8. Decisiones aprobadas
  - 9. Riesgos y mitigaciones
  - 10. Métricas de éxito
- 🛡️ **Seguridad &amp; HIPAA** — 45+ controles con check verde · incluye sección dedicada a **integración DAW EPCS** (prescripciones controladas)
- 💼 **¿Cómo cumplimos HIPAA en práctica?** — BAAs, consultor legal, training, costos reales (~$15-25K año 1)
- 11. Próximos pasos

### 2. `mockups-flujo-completo.html` (~30 páginas · 26 mockups)

Documento complementario con **TODOS los mockups visuales del flujo end-to-end**, en orden cronológico.

#### 📐 Aclaración conceptual (léase primero)
- Modelo Patient + Case — por qué "referido" y "paciente" son la misma persona en estados distintos

#### Front Office (Recepción · Asistentes Médicas)
- B.1 — Dashboard de Recepción
- B.2 — Nuevo caso desde referido entrante (crea paciente automáticamente)
- B.3 — Editar paciente + Re-enviar formulario
- B.4 — Ficha del paciente (con todos sus casos)

#### Portal del Paciente (módulo público aparte)
- **B.5 — Landing del formulario** (SMS + email + QR + Mobile + Tablet walk-in)
- B.6 — Wizard adaptativo paso a paso
- B.7 — Captura de identificación con cámara
- B.8 — Firma legal del Lien
- B.9 — Pantalla de confirmación

#### Calendario rediseñado
- B.10 — Vista semana con filtros avanzados
- B.11 — Modal "Crear cita" mejorado

#### Intake &amp; Verification (Edson)
- B.12 — Bandeja de Edson
- B.13 — Detalle de verificación de caso

#### Admisión del día
- B.14 — Check-in del paciente
- B.15 — Admisión "Pagos y Cobros"

#### 🩺 Vista del Doctor (Clinical Visit)
- B.16 — Dashboard del Doctor "Mi día"
- B.17 — Visita en sala (Split view)
- **B.18 — Prescripción + DAW EPCS** ⚡ (integración API · controladas)
- B.19 — Órdenes de laboratorio
- B.20 — Servicios CPT + Firma de nota

#### ⚖️ Portal del Abogado (módulo dedicado)
- **B.21 — Portal del Abogado** · dashboard tiempo real + detalle de caso + firma del Lien en 1 clic

#### Billing &amp; Finance (Brunella)
- B.22 — Bandeja de notas pendientes + Notas internas con timeline
- B.23 — HCFA / CMS-1500 generación
- **B.24 — Ledger del caso** · vista digital + PDF "Account Overview" + Reporte mensual consolidado

#### Cierre + Inteligencia
- B.25 — Workflow de Settlement
- B.26 — Dashboard ejecutivo de Gerencia

## 🖨️ Cómo convertirlos a PDF

Para cada archivo HTML:

1. Abre el HTML en **Google Chrome** (recomendado) o Edge
2. Presiona `Ctrl + P` (Windows) / `Cmd + P` (Mac)
3. En "Destino" elige **"Guardar como PDF"**
4. Configuración importante:
   - **Tamaño:** A4 o Letter
   - **Márgenes:** Predeterminados
   - **Escala:** Predeterminada
   - ✅ **Activar "Gráficos de fondo"** ← crítico, sin esto se pierden los colores brand
5. **Guardar** → tienes el PDF presentable

## 💼 Orden sugerido de presentación a gerencia

### Opción A — Presentación corta (45-60 min)
Abrir `lienmaster-propuesta-ejecutiva.html` y mostrar:
1. **Portada → Resumen ejecutivo → Diagnóstico** (5 min)
2. **Modelo de dominio + Estructura modular** (5 min, alto nivel)
3. **Gantt de fases + decisiones aprobadas** (10 min)
4. **🛡️ Seguridad &amp; HIPAA + DAW EPCS** (10 min · diferenciador legal)
5. **💼 ¿Cómo cumplimos HIPAA en práctica?** (10 min · costos reales)
6. **Métricas + Próximos pasos** (5 min)

### Opción B — Presentación extendida (90-120 min)
Después de la corta, abrir `mockups-flujo-completo.html`:
1. **Aclaración Patient + Case** (5 min · entendimiento del modelo)
2. **Front Office + Portal del Paciente** (incluye tablet walk-in en B.5) (15 min)
3. **Calendario + Intake + Admisión** (15 min)
4. **Vista del Doctor con DAW** (20 min · destacar integración)
5. **Portal del Abogado** (10 min · diferenciador legal)
6. **Billing + Settlement + Dashboard ejecutivo** (15 min)

## 📊 Cifras totales

| Documento | Páginas | Mockups visuales |
|---|---|---|
| `lienmaster-propuesta-ejecutiva.html` | ~17 | 0 (solo estrategia + cumplimiento) |
| `mockups-flujo-completo.html` | ~30 | **26 mockups end-to-end** |
| **Total combinado** | **~47 páginas** | **26 mockups** |

**Estructura limpia:** el documento principal es solo texto/tablas/diagramas de estrategia. Los mockups visuales están consolidados en un solo archivo complementario. Sin duplicación.

## 🎯 Diferenciadores clave a destacar

Cuando presentes, enfatiza estos 5 puntos:

1. **🛡️ HIPAA-first** — 45+ controles desde Fase 0, no agregados después
2. **💊 DAW EPCS** — prescripción electrónica de controladas, cumplimiento Utah HB 28 + DEA federal
3. **⚖️ Attorney Signing Portal** — el abogado firma sin tener cuenta, reduce tiempo de lien de 1-2 semanas a &lt;48 hrs
4. **📐 Modelo Patient + Case** — 1 persona con N casos consolidados, vs. legacy fragmentado en 3 sistemas
5. **🤖 Automatización** — reduce trabajo manual de Edson y Brunella en ~60%

## 📱 Para presentar en vivo (no PDF)

Si prefieres mostrar en pantalla en lugar de imprimir PDF:
- `F11` para pantalla completa
- Scroll vertical va página por página
- `Ctrl + +` / `Ctrl + -` para ajustar zoom
- Cada sección está separada con page-break, ideal para presentar de a una

## 🎨 Notas de diseño

- Paleta consistente con la identidad visual de LienMaster (cyan/indigo/violeta sobre fondo oscuro)
- Mockups con frame estilo navegador (top bar + dots)
- Mobile mockups con frame de celular y safe-area
- Tablet mockups para mostrar el formulario en pantalla más grande
- Sección de Seguridad/HIPAA en paleta verde para diferenciarla visualmente
- Sección de DAW EPCS en paleta roja/rosa para destacarla como diferenciador crítico
- Sección de "Cómo cumplimos HIPAA en práctica" en paleta cyan para indicar lo operativo
- Page-breaks automáticos al imprimir (cada sección = 1 página)
- Sin dependencias externas (todo el CSS está inline)

## ✅ Decisiones técnicas ya tomadas con gerencia

| # | Decisión | Estado |
|---|---|---|
| 1 | Medusa y PHI son distintos → eliminar ambos | ✓ Aprobado |
| 2 | LienMaster v2.1.0 → reemplazo completo | ✓ Aprobado |
| 3 | Weave → canal propio (Twilio + Resend) | ✓ Aprobado |
| 4 | HCFA → PDF propio (sin clearinghouse) | ✓ Aprobado |
| 5 | Migración SQL desde 3 fuentes legacy | ✓ Aprobado |
| 6 | Firma electrónica → librería libre (canvas + PDF) | ✓ Aprobado |
| 7 | Wizard interno → paciente firma digital + abogado en su parte | ✓ Aprobado |
| 8 | **Prescripción de controladas → integración DAW EPCS** | ✓ Nueva decisión incorporada |

## 💰 Inversión adicional requerida (cumplimiento HIPAA)

Además del costo de construcción del sistema, **antes del go-live** se requiere ~$15-25K en cumplimiento legal:

| Concepto | Costo | Frecuencia |
|---|---|---|
| BAAs con vendors (Supabase, Twilio, Resend, Vercel, DAW) | ~$700/mes | Recurrente |
| Consultor HIPAA legal · setup inicial | $3,000–$8,000 | Una vez |
| HIPAA training online por empleado | $30 × 20 = $600 | Anual |
| Plantillas + dashboard de cumplimiento (opcional) | ~$300/mes | Opcional |
| **Total estimado año 1** | **~$15-25K** | — |

## 🚀 Próximos pasos (post-aprobación)

1. **Kick-off técnico** (semana 1)
2. **Auditoría de legacy + acceso SQL** (semana 1-2)
3. **Inicio Fase 0 — Foundations** (semana 2)
4. **Contratar consultor HIPAA + firmar BAAs** (en paralelo a Fase 0)
5. **Revisión mensual con gerencia**
6. **MVP-Beta funcional** (mes 4 · flujo GM end-to-end)
7. **Go-live gradual** (mes 8-9)

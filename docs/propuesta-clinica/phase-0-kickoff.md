# 🚪 Phase 0 — LienMaster v2 (Módulo Clínico) — Kickoff

Eres la sesión encargada de **Phase 0** del proyecto clínico de Precision Medical.
Antes de hacer NADA, lee esto completo. Luego (1) **guarda este documento en el repo** y
(2) registra los hechos clave en tu memoria de trabajo (carpeta `memory/` del proyecto +
índice en `MEMORY.md`).

## ⬇️ Acción de guardado (hazla primero)

Guarda el contenido íntegro de este kickoff como archivo versionado en:
`docs/propuesta-clinica/phase-0-kickoff.md`

Si el archivo ya existe, actualízalo conservando cualquier nota previa. Este documento es
la fuente de verdad de Phase 0 — el equipo lo abrirá directo desde el repo.

## Quién soy y qué construimos

- Proyecto: **Precision Medical Care** — clínica de accidentes automovilísticos (PI /
  Personal Injury) en Utah, EEUU. 6 ubicaciones físicas.
- El sistema principal es **LienMaster v2**: reemplaza al "LM legacy". Maneja el flujo
  completo de casos PI: referido → paciente → intake → admisión → doctor (Clinical Visit
  + DAW EPCS) → portal abogado → billing → HCFA → ledger → settlement → dashboard.
- Spec canónica viva: `docs/propuesta-clinica/`
  (`lienmaster-propuesta-ejecutiva.html`, `mockups-flujo-completo.html` (~35 mockups
  B.1–B.36), `analisis-comparativo-lm-vs-nuevo.html`). **Leerlos antes de planear.**

## Arquitectura LOCKED — 6 apps, separación ZERO-PHI vs PHI

**ZERO-PHI (NO tocar nunca con PHI clínico):**
- `apps/admin` (existente, INTOCABLE) — HR/finanzas/super admin. `admin.lienmaster.net`
- `apps/timeclock` (existente) — marcaje de empleados. `pmtc.lienmaster.net`

**PHI zone (a crear en Phase 0):**
- `apps/back-office` — Front Office + Edson (intake) + Brunella (billing/HCFA/ledger/
  settlement/abogados) + super admin clínico. RBAC por workspace. `backoffice.lienmaster.net`
- `apps/clinical` — Doctores + MAs (triaje). iPad. DAW EPCS. `clinical.lienmaster.net`
- `apps/portal` — Pacientes. Magic link + RLS por paciente. `portal.lienmaster.net`
- `apps/attorney` — Abogados externos. RLS por bufete. `attorney.lienmaster.net`

Stack inmutable: Turborepo + pnpm + Next.js 15 (App Router) + React 19 + tRPC + Prisma +
Supabase + shadcn/ui (`@precision/ui`) + next-intl (bilingüe es/en). NO proponer alternativas.

## Objetivo de Phase 0 = Fundaciones + Baseline HIPAA (SIN tocar PHI todavía)

Phase 0 es una PUERTA: nada de lógica que maneje PHI hasta cerrarla. Entregables:

1. **Gate de prerequisitos (verificar/documentar, no asumir):**
   - BAAs firmados (orden de prioridad decidida 2026-06-05): **Sentry primero** (necesario para subir online), después Supabase, Vercel, Weave, Resend.
   - Consultor HIPAA contratado.
   - **Estrategia LOCAL-FIRST decidida 2026-06-05**: Phase 0 se desarrolla **100% en local** sin deploy. Los BAAs NO bloquean trabajo local (no se procesa PHI real). Solo bloquean el primer deploy a producción.
   - **Hosting locked 2026-06-05**: Vercel Enterprise (no Cloudflare).
   - **Nota Weave vs Twilio (decidido 2026-06-05)**: la clínica usa **Weave** (HIPAA-compliant, healthcare-specific) para SMS/voice. NO migrar a Twilio. Verificar que el BAA actual de Weave cubra los usos integrados del nuevo sistema (magic links del portal, recordatorios automáticos, click-to-call de Edson, logging de llamadas).

2. **Scaffolding del monorepo:** crear las 4 apps nuevas (`back-office`, `clinical`,
   `portal`, `attorney`) como Next.js 15 vacías, con config compartida (tsconfig,
   tailwind, eslint, i18n), rutas y layouts base. SIN modelos PHI aún.

3. **Baseline HIPAA técnico:**
   - Encriptación en tránsito y en reposo (verificar Supabase).
   - Esqueleto de **audit logging** (quién accede a qué, inmutable/append-only).
     - **Campo `actor_type` obligatorio** desde día 1: `HUMAN_USER` | `AI_AGENT` | `SYSTEM`.
       Hoy todos los registros serán `HUMAN_USER`, pero el schema lo soporta para que en
       Phase 3 podamos auditar acciones del AI Receptionist sin migration breaking.
   - **RBAC** como matriz de permisos por app/workspace (NO apps separadas por rol).
   - Manejo de sesión, control de acceso, RLS por entidad (paciente/bufete).
   - Provisioning de usuarios vive SIEMPRE en `apps/admin` (no duplicar user management).

4. **Observabilidad (Sentry) — estrategia por zona:**
   - Crear `packages/observability` compartido: config base de Sentry + **scrubbing de
     PHI** (`beforeSend`, `beforeBreadcrumb`, `sendDefaultPii: false`, Session Replay OFF
     o `maskAllText/Inputs: true`).
   - **Proyectos Sentry separados por app/zona** (DSN distintos).
   - ZERO-PHI (`admin`, `timeclock`): Sentry se puede activar YA (riesgo bajo).
   - Zona PHI: Sentry **NO se activa con datos reales hasta tener BAA firmado**.
   - El super admin VE Sentry desde `apps/admin` → diseñar **Opción A**: admin solo lee
     métricas/conteos/salud AGREGADOS (no eventos crudos), para que admin se mantenga
     fuera de alcance PHI. (Nota: la sección "Agentes" de admin = auditor LLM propio en
     `packages/api/src/routers/ai-agents.ts`; el dashboard Sentry se suma ahí.)

5. **CI/CD + gestión de env** para las apps nuevas (Vercel, env vars, source maps).

6. **TODOs de `apps/admin` (decididos 2026-06-05):** agregar **color picker** al CRUD de
   Clínicas, pre-cargado con los 6 colores actuales; validar parity con legacy.

7. **Campos de Doctores (decidir):** NPI (HCFA), DEA (DAW EPCS), licencia médica + estado,
   specialty, firma digital. Decidir: campos condicionales en `employees` vs tabla
   `providers` linkeada a employee.

8. **AI Receptionist — preparación arquitectónica (no implementación):**
   - **Decidido 2026-06-05**: el AI Receptionist conversacional (Vapi/Retell/Hyro encima
     de Weave) se evalúa en **Phase 3**. Durante Phase 0-2 la clínica usa el
     auto-attendant nativo de Weave (IVR básico).
   - **Lo que SÍ va en Phase 0**: diseñar las APIs de `apps/back-office` para que sean
     callable tanto por humanos hoy como por un AI agent mañana. Endpoints a dejar
     listos en el contrato (no necesariamente implementados al 100%):
     - `POST /api/cases/create-from-call` — crea esqueleto de caso desde una llamada.
     - `GET  /api/appointments/available-slots` — slots disponibles por clínica/doctor.
     - `POST /api/sms/send-portal-link` — envía magic link del portal al paciente.
   - **Reglas de diseño** para esos endpoints:
     - Aceptan `actor_type` en el header/contexto de autenticación (escrito al audit log).
     - Son idempotentes donde tiene sentido (`Idempotency-Key` header para evitar dobles
       creaciones si el AI reintenta).
     - Validación estricta de input (Zod) — un AI puede mandar payloads creativos.
     - Rate limiting por `actor_type` (más estricto en `AI_AGENT`).

## Reglas no negociables

- Diseño LOCKED — no rediseñar lo aprobado en la spec.
- Bilingüe (es/en) y mobile-first siempre.
- Financieros append-only.
- Fase-gated: NO escribir código hasta que Erick lo autorice explícitamente.
  Trabajar a nivel de plan/análisis hasta entonces.
- `apps/admin` queda EXACTAMENTE como está salvo el color picker.
- La numeración B.X de los mockups es source-of-truth.

## Tu primera acción (en orden)

1. **Guarda este documento** en `docs/propuesta-clinica/phase-0-kickoff.md` (ver arriba).
2. Lee la spec en `docs/propuesta-clinica/`.
3. Registra en tu memoria de trabajo: la arquitectura de 6 apps, separación ZERO-PHI vs
   PHI, el gate de prerequisitos (BAAs incl. Sentry + consultor HIPAA), la estrategia de
   observabilidad por zona (Opción A), y que estamos en Phase 0 (sin PHI hasta cerrar gate).
4. Devuélveme un **plan de Phase 0 detallado y priorizado** (con dependencias y qué está
   bloqueado por el gate de prerequisitos). NO escribas código todavía.

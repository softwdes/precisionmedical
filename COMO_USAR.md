# 🚀 Cómo usar este paquete con Antigravity

> **Para:** Erick Salinas
> **Proyecto:** Precision Medical — LM Super Admin
> **Tiempo estimado de lectura:** 15 minutos
> **Tiempo estimado del proyecto completo:** 12–16 semanas

---

## 📦 Qué hay en este paquete

Esta carpeta contiene **TODO** lo que Antigravity necesita para construir tu proyecto sin que tengas que pensar en decisiones técnicas. Está organizada así:

```
precision-medical/
├── README.md                    👈 Punto de entrada (leer primero)
├── ANTIGRAVITY_INSTRUCTIONS.md  👈 Las instrucciones para Antigravity
├── PRD.md                       Requisitos del producto
├── COMO_USAR.md                 👈 Esta guía (estás aquí)
│
├── docs/                        Documentación técnica
│   ├── ARCHITECTURE.md          Arquitectura del sistema
│   ├── DATA_MODEL.md            Modelo de datos (Prisma)
│   ├── DESIGN_SYSTEM.md         Sistema de diseño
│   ├── AI_AGENTS.md             Especificación de CIFO
│   ├── INTEGRATIONS.md          Integraciones (Supabase, Resend, etc.)
│   └── SECURITY.md              Seguridad y compliance
│
├── tasks/                       Tareas por fase (5 fases)
│   ├── phase-0-setup.md         Setup inicial
│   ├── phase-1-core.md          Módulos básicos
│   ├── phase-2-finance.md       Finanzas y métricas
│   ├── phase-3-portals.md       Portales de abogados/proveedores
│   └── phase-4-ai.md            Agentes IA (CIFO + Audit)
│
├── design/                      Referencias visuales
│   ├── lm-dashboard.html        Mockup aprobado del dashboard
│   ├── design-tokens.css        Variables CSS (colores, etc.)
│   └── components-guide.md      Guía de componentes UI
│
└── examples/                    Código de ejemplo (patrones a seguir)
    ├── prisma/schema.prisma     Schema completo de la base de datos
    ├── components/              Componentes canónicos (Button, Card, KPI)
    ├── api/                     Ejemplo de router tRPC
    └── config/                  Configs (turbo, package.json, tailwind)
```

---

## 🎯 Estrategia general (lee esto primero)

### El concepto clave: "Patrones, no copia-pega"

Antigravity no es un copiador. Es un **agente que lee documentación y construye**. Por eso este paquete está diseñado con estos principios:

1. **Documentos `.md` describen QUÉ construir y POR QUÉ**
2. **Archivos `examples/` muestran CÓMO** (1 ejemplo de cada tipo)
3. **`tasks/` divide el trabajo en fases pequeñas** (no le pidas todo de una)

**Regla de oro:** No le pidas a Antigravity que construya todo el proyecto en un solo prompt. **Le das una fase a la vez**. Cuando termine la Fase 0, validas, y ahí pasas a la Fase 1. Y así sucesivamente.

Esto evita 3 problemas:
- ❌ Que Antigravity se confunda con tantas decisiones simultáneas
- ❌ Que el proyecto se desvíe sin que te des cuenta
- ❌ Que pierdas control de calidad

---

## ✅ Antes de empezar — Checklist de cuentas

Necesitas tener creadas estas cuentas **ANTES** de abrir Antigravity. Si no las tienes, créalas primero:

| Servicio | Para qué | URL | Plan |
|----------|----------|-----|------|
| 🟢 **GitHub** | Repositorio | github.com | Free |
| 🟢 **Vercel** | Hosting | vercel.com | Pro recomendado ($20/mes) |
| 🟢 **Supabase** | Base de datos + Auth + Storage | supabase.com | Pro ($25/mes) |
| 🟢 **Resend** | Envío de emails | resend.com | Free para empezar |
| 🟢 **Anthropic** | API de Claude (para CIFO) | console.anthropic.com | Pay-as-you-go |
| 🟡 **OpenAI** (opcional) | Fallback de IA | platform.openai.com | Pay-as-you-go |
| 🟡 **ElevenLabs** (opcional) | Voz premium para CIFO | elevenlabs.io | Free para empezar |
| 🟡 **Sentry** (opcional) | Monitoreo de errores | sentry.io | Free |
| 🟡 **PostHog** (opcional) | Analytics | posthog.com | Free |

> 💡 **Tip:** Las marcadas con 🟢 son OBLIGATORIAS. Las 🟡 son opcionales (puedes agregarlas después). En `docs/INTEGRATIONS.md` están los pasos detallados para configurar cada una.

---

## 📋 Pasos uno por uno (sigue este orden EXACTO)

### Paso 1 — Sube el paquete a GitHub (15 minutos)

1. Crea un repo nuevo en GitHub: **`precision-medical`** (privado)
2. Descarga este ZIP en tu computadora
3. Descomprime
4. Abre la terminal en la carpeta `precision-medical/`
5. Ejecuta:
   ```bash
   git init
   git add .
   git commit -m "feat: initial documentation package"
   git branch -M main
   git remote add origin git@github.com:TU_USUARIO/precision-medical.git
   git push -u origin main
   ```

✅ **Resultado:** Tienes el repo en GitHub con toda la documentación.

---

### Paso 2 — Abre Antigravity y conecta el repo (5 minutos)

1. Abre Antigravity
2. Conecta tu cuenta de GitHub (si no lo has hecho)
3. Importa el repo `precision-medical`
4. Antigravity automáticamente detectará los archivos `.md` y los leerá

✅ **Resultado:** Antigravity tiene contexto completo del proyecto.

---

### Paso 3 — Dale el "prompt inicial" a Antigravity (5 minutos)

> ⚠️ **IMPORTANTE:** Este es el prompt MÁS IMPORTANTE de todo el proyecto. Cópialo y pégalo TAL CUAL:

```
Hola Antigravity. Vamos a construir un proyecto llamado "Precision Medical"
(LM Super Admin), una plataforma de operaciones para una clínica especialista
en accidentes automovilísticos en Utah, USA.

ANTES DE HACER NADA:

1. Lee el archivo ANTIGRAVITY_INSTRUCTIONS.md completo
2. Lee README.md completo
3. Lee PRD.md completo
4. Confirma que entiendes:
   - Las 5 fases del proyecto (0, 1, 2, 3, 4)
   - El stack técnico (Turborepo + Next.js 15 + React 19 + TypeScript +
     Tailwind + shadcn/ui + tRPC + Prisma + Supabase + Resend + Vercel)
   - Que NO debes empezar a construir hasta que yo te indique la fase

NO ESCRIBAS CÓDIGO TODAVÍA. Solo confirma que has leído todo y resúmeme:
- Qué entendiste del proyecto (3-5 puntos)
- Qué dudas tienes (si hay)
- Qué fase recomiendas empezar primero
```

**Lo que debe responder Antigravity:**
- Un resumen del proyecto
- Confirmación de que leyó las instrucciones
- Una recomendación de empezar por la **Fase 0**

> 🚨 **Si Antigravity empieza a escribir código sin haber leído los docs, DETÉNLO** y vuelve a darle el prompt. La disciplina inicial es crítica.

---

### Paso 4 — Empieza la Fase 0 (Setup) (1–2 días)

Cuando Antigravity esté listo, dale este prompt:

```
Perfecto. Ahora vamos a empezar la Fase 0 (Setup).

Lee tasks/phase-0-setup.md y ejecuta TODAS las tareas en orden.

Reglas:
1. Usa EXACTAMENTE el stack definido en docs/ARCHITECTURE.md
2. Sigue el modelo de datos de docs/DATA_MODEL.md (no inventes campos)
3. Aplica los design tokens de design/design-tokens.css
4. Cuando llegues al schema de Prisma, copia el de examples/prisma/schema.prisma
5. Después de cada tarea, haz un commit en git con mensaje descriptivo
6. Al terminar, dame un resumen de TODO lo que hiciste

Si tienes dudas, PREGUNTA antes de asumir.
```

**Qué debe entregar Antigravity al final de Fase 0:**
- ✅ Repo con estructura Turborepo
- ✅ Apps Next.js 15 funcionando en `apps/web`
- ✅ Conexión a Supabase configurada
- ✅ Schema de Prisma migrado
- ✅ Diseño base aplicado (tema dark, fonts, design tokens)
- ✅ Pantalla de login funcional
- ✅ CI/CD configurado en Vercel
- ✅ Deploy en producción visible en una URL `.vercel.app`

**Cómo validar:**
1. Abre la URL de Vercel
2. Verifica que cargue sin errores
3. Verifica que el login se vea como el mockup
4. Haz `git pull` localmente y revisa la estructura
5. Si todo OK → pasa a Fase 1

---

### Paso 5 — Fase 1 (Core Modules) (2–3 semanas)

Prompt:
```
Excelente, Fase 0 completa. Ahora vamos a la Fase 1.

Lee tasks/phase-1-core.md y ejecuta todas las tareas.

Recordatorios:
1. Usa los componentes canónicos de examples/components/* como patrón
2. Usa el router de ejemplo en examples/api/employees-router.ts como patrón
   para todos los demás routers
3. Sigue design/components-guide.md al pie de la letra
4. Cada feature debe tener tests
5. Después de cada módulo (Users, Employees, Dashboard, etc.), haz commit

Empieza por el módulo de Users & Access. Cuando termines, valida conmigo
ANTES de pasar al siguiente módulo.
```

**Validación de cada módulo en Fase 1:**
- Funciona el CRUD básico
- Se ve igual al mockup (`design/lm-dashboard.html`)
- Tiene tests unitarios
- Está deployado en Vercel

> 💡 **Tip:** En Fase 1 NO pases al siguiente módulo hasta que el actual esté 100% funcional. Es tentador acelerar, pero los bugs acumulados se vuelven impagables después.

---

### Paso 6 — Fases 2, 3 y 4 (mismo patrón)

Repite el patrón:
```
Fase X completa. Ahora vamos a Fase Y.

Lee tasks/phase-Y-NOMBRE.md y ejecuta todas las tareas.

[Recordatorios específicos de la fase]
```

**Tiempos esperados:**
- Fase 2 (Finance + Métricas): 3–4 semanas
- Fase 3 (Portales): 4–5 semanas
- Fase 4 (CIFO + Audit Agent): 3–4 semanas

---

## 🎁 La presentación al cliente (CIFO el momento WOW)

Cuando termines Fase 4, prepara una **demo para tu cliente** siguiendo el script en `tasks/phase-4-ai.md` sección 4.7.

El momento mágico es:
1. Cargas el dashboard
2. CIFO te saluda con voz: *"Hola Erick, soy CIFO. Estoy listo para ayudarte"*
3. Le hablas: *"Convierte 5000 dólares a Bolivianos"*
4. CIFO ejecuta la conversión, te responde con voz, y muestra el resultado en pantalla

Eso es lo que los va a impactar. **Practica esta demo varias veces antes de la reunión.**

---

## ⚠️ Errores comunes que debes evitar

### 1. ❌ Saltarte fases
**Mal:** "Antigravity, construye todo el proyecto"
**Bien:** "Antigravity, construye la Fase 0 y avísame cuando termines"

### 2. ❌ No validar entre fases
Si pasas de Fase 1 a Fase 2 sin validar, los bugs se acumulan. **Cada fase debe estar 100% funcional antes de continuar.**

### 3. ❌ Cambiar el stack a mitad del camino
Si Antigravity sugiere "mejor usemos otra librería", **dile que NO**. El stack está decidido. Cambios = caos.

### 4. ❌ No hacer commits frecuentes
Cada feature debe ser un commit. Si Antigravity hace 50 cosas y no hace commits, no podrás hacer rollback si algo se rompe.

### 5. ❌ No probar la demo de CIFO
La voz puede sonar rara la primera vez. **Pruébala varias veces** y ajusta el pitch en `apps/web/lib/cifo/voice.ts` hasta que suene como quieres.

### 6. ❌ Desplegar sin variables de entorno
Vercel necesita TODAS las API keys configuradas. Revisa `docs/INTEGRATIONS.md` para el checklist completo de env vars.

### 7. ❌ Olvidar el compliance legal
**Anti-kickback es responsabilidad TUYA y de tus abogados**, no de Antigravity. El sistema da flexibilidad, pero las reglas de comisiones DEBEN ser revisadas por un abogado en Utah.

---

## 🆘 Si algo sale mal

### Antigravity no entiende algo
→ Ábrelo en chat conmigo (Claude). Dame el contexto y te ayudo a redactar un mejor prompt.

### El build falla en Vercel
1. Revisa logs en Vercel
2. Verifica todas las env vars
3. Verifica que `pnpm build` funcione localmente

### CIFO no habla
1. Verifica `ANTHROPIC_API_KEY` en Vercel
2. Abre DevTools y revisa errores de Web Speech API
3. Activa "demo mode" temporalmente para probar el flujo sin API

### El cliente pide cambios de diseño
→ Actualiza primero `design/lm-dashboard.html` y `docs/DESIGN_SYSTEM.md`. Luego dile a Antigravity que actualice los componentes según los nuevos docs. **Nunca cambies código sin actualizar docs primero.**

---

## 💰 Estimación de costos mensuales (operativos)

Una vez en producción, tus costos mensuales aproximados serán:

| Servicio | Costo |
|----------|-------|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Resend (10K emails) | $20 |
| Anthropic (CIFO, ~500 conversaciones/mes) | $50–150 |
| ElevenLabs (voz premium, opcional) | $5–22 |
| Sentry (errores) | $0 (free tier) |
| PostHog (analytics) | $0 (free tier) |
| **TOTAL** | **~$120–250/mes** |

> 💡 Estos costos escalan con uso. Empieza ligero, sube cuando necesites.

---

## 📞 Contacto y soporte

Si en cualquier punto te atascas, abre un chat conmigo (Claude) y comparte:
1. El prompt que le diste a Antigravity
2. La respuesta de Antigravity
3. El error o resultado inesperado

Te ayudo a desbloquearte.

---

## 🎉 ¡Mucho éxito!

Tienes en tus manos un **paquete profesional de documentación** que cualquier equipo de desarrollo serio aceptaría sin chistar. Antigravity, siendo un agente de IA bien diseñado, debería seguir estas instrucciones casi sin desviarse.

**Recuerda:**
- 🚦 Una fase a la vez
- ✅ Valida antes de avanzar
- 💾 Commits frecuentes
- 📖 Documenta cambios en los `.md` antes que en código
- 🎯 La demo de CIFO es el momento WOW — practícala

**Vamos a impresionar a Precision Medical.** 🚀

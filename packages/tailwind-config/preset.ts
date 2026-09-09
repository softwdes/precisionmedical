import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
import tailwindcssAnimate from 'tailwindcss-animate';
import tailwindcssForms from '@tailwindcss/forms';

/**
 * Token de color que ACEPTA el modificador de opacidad (`bg-bg-2/40`).
 *
 * Sin modificador, Tailwind reemplaza `<alpha-value>` por `1` y el color queda
 * idéntico al de la variable — incluida la alfa que algunas ya traen.
 */
const alfa = (v: string): string =>
  `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`;

const config: Omit<Config, 'content'> = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /**
         * Tokens con `<alpha-value>` — NO uses `var(--x)` a secas acá.
         *
         * Con el color declarado como una `var()` suelta, Tailwind no puede
         * aplicar el modificador de opacidad y **directamente no genera la
         * clase**. El resultado no era "un poco menos opaco": era otra cosa.
         *  · `border-border/40` → la clase no existía y el borde caía al gris
         *    claro OPACO de Tailwind (#E5E7EB). Se pedía 2% de alfa y salía
         *    100% — de ahí las "líneas gruesas" en todo el sistema.
         *  · `bg-bg-2/40` → sin clase, sin fondo: las sub-tarjetas quedaban
         *    transparentes.
         *  · `text-text-muted/70` → el texto heredaba el color del padre.
         * Eran 445 usos en 67 archivos, todos silenciosos.
         *
         * `color-mix` lo resuelve sin tocar las variables CSS: sin modificador
         * Tailwind sustituye `<alpha-value>` por 1 y queda el color tal cual,
         * así que los valores por defecto —incluida la alfa que ya traen
         * `--border` y `--row-sep`— no cambian.
         */
        'bg-0': alfa('--bg-0'),
        'bg-1': alfa('--bg-1'),
        'bg-2': alfa('--bg-2'),
        'bg-3': alfa('--bg-3'),
        surface: alfa('--surface'),
        'surface-2': alfa('--surface-2'),
        border: alfa('--border'),
        'border-strong': alfa('--border-strong'),
        'row-sep': alfa('--row-sep'),
        'text-1': alfa('--text-1'),
        'text-2': alfa('--text-2'),
        'text-3': alfa('--text-3'),
        'text-muted': alfa('--text-muted'),
        /**
         * Azul y violeta PARA TEXTO, variables por tema.
         *
         * `brand`/`violet` son la identidad (mockups aprobados) y se quedan en
         * fondos y bordes, donde el minimo de contraste es 3:1 y lo pasan. Pero
         * como TEXTO chico no llegan a 4.5:1 en ningun tema, y no existe un hex
         * unico que sirva en oscuro y en claro a la vez.
         */
        'brand-text': alfa('--brand-text'),
        'violet-text': alfa('--violet-text'),
        /**
         * Lo mismo para los colores de ESTADO, agregado el 2026-09-09.
         *
         * Al destapar la escala (ver el bloque de abajo) 114 clases `text-*` de
         * `apps/web` empezaron a pintar de verdad, y en tema claro no se leían:
         * `amber-400` da **1.42:1** sobre blanco, `emerald-500` 2.12, `rose-500`
         * 2.96. Antes no emitían nada y el texto heredaba un color legible, así
         * que el arreglo de la escala habría cambiado un bug por otro.
         *
         * Medido tono por tono contra el PEOR fondo de cada tema —incluido el
         * tinte `/10` del propio color, que es donde vive el texto de los
         * avisos— no existe un solo hex que pase 4.5:1 en los dos:
         *
         *   amber-400 → oscuro 7.48 ✓ / claro 1.42 ✗
         *   amber-800 → oscuro 1.76 ✗ / claro 6.02 ✓
         *
         * Por eso el tono vive en una variable y cada tema pone el suyo, igual
         * que `--brand-text`. En oscuro va el `-400`; en claro el `-700`/`-800`.
         *
         * `bg-amber/10` y `border-rose/30` NO se tocan: ahí el mínimo es 3:1 y
         * lo pasan de sobra. Esto es SOLO para texto.
         */
        'amber-text': alfa('--amber-text'),
        'emerald-text': alfa('--emerald-text'),
        'rose-text': alfa('--rose-text'),
        'sky-text': alfa('--sky-text'),
        /**
         * `cyan`, `teal` y `pink` no tienen NINGÚN uso como texto hoy — van
         * igual, de forma preventiva.
         *
         * Los otros cuatro se agregaron corriendo, cuando destapar la escala
         * dejó texto ilegible en producción. Estos tres tienen exactamente el
         * mismo problema esperando: `text-cyan-500` da 2.04:1 sobre blanco. La
         * diferencia es que acá llegamos antes, y `cyan` está en la lista de
         * tokens canónicos del CLAUDE.md del back-office ("info"), así que su
         * primer uso como texto es cuestión de tiempo.
         */
        'cyan-text': alfa('--cyan-text'),
        'teal-text': alfa('--teal-text'),
        'pink-text': alfa('--pink-text'),
        brand: '#6366F1',
        'brand-2': '#8B5CF6',
        /**
         * `violet` es la identidad del módulo Provider (Regla #5: B.17-B.18) y
         * FALTABA acá. No fallaba: `bg-violet/10` y `border-violet/30` no
         * generaban ninguna regla, así que el fondo no se pintaba y el borde
         * caía al gris opaco de Tailwind — el mismo síntoma que documenta el
         * comentario de arriba, en 142 usos del back-office (33 `bg-violet/10`,
         * 26 `border-violet/30`, 22 `bg-violet/15`...).
         *
         * ⚠️ **Va con la escala Y un `DEFAULT`, NO como string pelado.** Una
         * clave plana en `extend.colors` REEMPLAZA la escala entera de Tailwind,
         * y ahí `violet-500` deja de resolver. Medido con `resolveConfig`:
         *
         *   violet: '#8B5CF6'                      -> violet-500 NO resuelve
         *   violet: { ...colors.violet, DEFAULT }  -> las dos formas resuelven
         *
         * Con el string pelado esto habría APAGADO **93 clases `violet-NNN` de
         * `apps/web`** (empleados, freelancers, usuarios) para encender las del
         * back-office: cambiar un agujero por otro más grande. Lo encontró pm-08
         * antes del push.
         *
         * El `DEFAULT` es violet-500, el tono de los mockups aprobados — el
         * mismo hex que `brand-2`, pero con nombre propio porque el módulo lo
         * usa como identidad y no como "el segundo brand".
         *
         * ✅ **Los demás se corrigieron igual el 2026-09-09** (Erick aprobó el
         * arreglo de raíz). Antes eran strings pelados y arrastraban el mismo
         * problema en producción: 263 clases de escala que no emitían **ni una
         * línea de CSS** (94 `rose-NNN`, 85 `amber-NNN`, 82 `emerald-NNN`, 2
         * `sky-NNN`), casi todas en `apps/web`.
         *
         * El cambio es seguro por un motivo concreto y verificado: **los siete
         * hexes planos eran EXACTAMENTE el tono `-500` de Tailwind** (medido
         * contra `tailwindcss/colors`, los siete idénticos). Poniéndolo como
         * `DEFAULT`:
         *
         *   · `bg-emerald/10`, `text-amber`, `border-rose/30`… pintan el MISMO
         *     color que venían pintando. Cero cambio en lo que ya funcionaba.
         *   · `text-emerald-500` empieza a pintar el mismo tono que `text-emerald`
         *     — el que ya usa el resto de la UI, no un color nuevo.
         *   · Solo `-300/-400/-600/-700` estrenan tonos, que es lo que quiso
         *     quien escribió esas clases.
         *
         * `cyan`, `teal` y `pink` no tenían ni un uso de escala: van con el mismo
         * tratamiento para que nadie vuelva a pisar la trampa al usarlos.
         *
         * ⚠️ La REGLA que hay que respetar al agregar un color acá: si el nombre
         * coincide con una paleta de Tailwind, va **con la escala Y un DEFAULT**.
         * Un string pelado la reemplaza entera y apaga las clases numeradas sin
         * que `tsc` ni `next build` digan nada.
         */
        violet: { ...colors.violet, DEFAULT: '#8B5CF6' },
        cyan: { ...colors.cyan, DEFAULT: '#06B6D4' },
        teal: { ...colors.teal, DEFAULT: '#14B8A6' },
        emerald: { ...colors.emerald, DEFAULT: '#10B981' },
        amber: { ...colors.amber, DEFAULT: '#F59E0B' },
        rose: { ...colors.rose, DEFAULT: '#F43F5E' },
        sky: { ...colors.sky, DEFAULT: '#0EA5E9' },
        pink: { ...colors.pink, DEFAULT: '#EC4899' },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        tiny: ['10.5px', { lineHeight: '1.4' }],
        small: ['12.5px', { lineHeight: '1.5' }],
      },
      letterSpacing: {
        tightest: '-0.03em',
        tight: '-0.02em',
        snug: '-0.01em',
        wider: '0.06em',
        widest: '0.12em',
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '14px',
        lg: '20px',
        pill: '999px',
      },
      zIndex: {
        dropdown: '10',
        sticky: '20',
        overlay: '30',
        drawer: '40',
        modal: '50',
        toast: '60',
        tooltip: '70',
        'cifo-fab': '80',
        'cifo-panel': '90',
      },
      spacing: {
        '4.5': '18px',
        '7.5': '30px',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        glow: 'var(--shadow-glow)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
        'gradient-cyan': 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
        'gradient-tri': 'linear-gradient(135deg, #6366F1 0%, #06B6D4 60%, #14B8A6 100%)',
        'gradient-cifo': 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)',
        'gradient-card': 'linear-gradient(180deg, var(--surface) 0%, var(--bg-2) 100%)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-circ': 'cubic-bezier(0.65, 0, 0.35, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        '250': '250ms',
        '400': '400ms',
        '1500': '1500ms',
      },
      animation: {
        'fade-in': 'fadeIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        shimmer: 'shimmer 1.5s linear infinite',
        'boot-glow': 'bootGlow 1500ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(99,102,241,0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(99,102,241,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bootGlow: {
          '0%': { opacity: '0', filter: 'blur(20px)' },
          '60%': { opacity: '1', filter: 'blur(0px)' },
          '100%': { opacity: '1', filter: 'blur(0px)' },
        },
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    tailwindcssForms({ strategy: 'class' }),
  ],
};

export default config;

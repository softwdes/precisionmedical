import type { Config } from 'tailwindcss';
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
        brand: '#6366F1',
        'brand-2': '#8B5CF6',
        cyan: '#06B6D4',
        teal: '#14B8A6',
        emerald: '#10B981',
        amber: '#F59E0B',
        rose: '#F43F5E',
        sky: '#0EA5E9',
        pink: '#EC4899',
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

import type { Config } from 'tailwindcss';

const config: Omit<Config, 'content'> = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'bg-0': 'var(--bg-0)',
        'bg-1': 'var(--bg-1)',
        'bg-2': 'var(--bg-2)',
        'bg-3': 'var(--bg-3)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        'text-1': 'var(--text-1)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        'text-muted': 'var(--text-muted)',
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
    require('tailwindcss-animate'),
    require('@tailwindcss/forms')({ strategy: 'class' }),
  ],
};

export default config;

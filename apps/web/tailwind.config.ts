import type { Config } from 'tailwindcss';
import preset from '@precision-medical/tailwind-config/preset';

const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    // Ver el comentario gemelo en `apps/back-office/tailwind.config.ts`: sin
    // este glob, las clases que solo viven en `packages/agente` no se emiten y
    // el saludo de CIFO se rompe sin un solo error. Acá faltaban doce.
    '../../packages/agente/src/**/*.{js,ts,jsx,tsx}',
    // Y lo mismo para `release`, que desde 2026-09-23 tiene la cortina de
    // version (`cortina-version.tsx`). Se cayo en la MISMA trampa el dia que
    // se escribio: sin este glob la cortina salia con el fondo transparente y
    // el numero en 14px — el tamano por defecto— en vez de ocupar la pantalla.
    '../../packages/release/src/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;

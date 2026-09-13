import type { Config } from 'tailwindcss';
import preset from '@precision-medical/tailwind-config/preset';

const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    // Tailwind solo emite las clases que ENCUENTRA leyendo archivos. Cuando el
    // saludo de CIFO se mudó a `packages/agente` (a07abf24) dejó de ser leído
    // por nadie, y las diez clases que solo existían ahí adentro se dejaron de
    // generar EN SILENCIO: ni `tsc` ni `next build` miran esto. Se notó porque
    // `z-[90]` desapareció y el saludo quedó DETRÁS de la tarjeta de la cola.
    // Cualquier componente nuevo en un paquete compartido necesita su glob acá.
    '../../packages/agente/src/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;

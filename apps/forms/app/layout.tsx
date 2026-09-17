import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SWRegister } from '@/components/SWRegister';
import './globals.css';

/**
 * Portal del Paciente — Layout
 *
 * El portal maneja bilingüe (ES/EN) localmente via useState en cada componente.
 * NO usa next-intl routing: los pacientes llegan via magic link,
 * no hay rutas i18n que resolver.
 */

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'Precision Medical · Portal del Paciente',
  description: 'Precision Medical — Portal del paciente (magic link)',
  manifest: '/manifest.json',
};

/**
 * Mobile-first: el paciente entra desde su celular.
 *
 * ── Se quitó el bloqueo del zoom (2026-09-17) ──────────────────────────────
 *
 * Tenía `maximumScale: 1` y `userScalable: false`, que es pedirle al navegador
 * que NO deje agrandar la pantalla con los dedos.
 *
 * Eso está mal acá por una razón que no tiene nada que ver con lo técnico: es
 * un formulario médico y buena parte de quien lo llena es gente grande. La
 * paciente del 17-sep que se fue sin terminar nació en 1950. Si la letra le
 * queda chica, con ese bloqueo no tenía ninguna salida.
 *
 * En la práctica Safari de iOS ignora estas dos propiedades desde iOS 10,
 * justamente por accesibilidad, así que quitarlas probablemente no cambie nada
 * visible. Pero dejamos de pedir algo que no queremos, y en cualquier navegador
 * que sí las respete el paciente recupera el gesto.
 *
 * Salió mientras se buscaba por qué una iPad no respondía a los toques. No es
 * la causa de aquello —hasta donde se pudo ver— pero se encontró ahí.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#06B6D4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" suppressHydrationWarning>
      <body className={font.className} suppressHydrationWarning>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}

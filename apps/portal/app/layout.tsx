import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
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
};

// Mobile-first: el paciente entra desde su celular.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#06B6D4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={font.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

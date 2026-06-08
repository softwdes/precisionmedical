import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * Clinical — Layout
 * iPad-first. next-intl NO se usa aquí: el módulo clínico opera solo en español.
 */

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'LM v3 · Clinical',
  description: 'Precision Medical — Clinical (Doctores + MAs · iPad-optimizado)',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#8B5CF6',
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

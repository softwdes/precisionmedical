import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@precision/ui/globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Neural Trainer Gym — Mi Entrenamiento',
  description: 'Tu espacio personal de entrenamiento',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

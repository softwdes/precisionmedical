import type { Metadata } from 'next';
import '@precision/ui/globals.css';

export const metadata: Metadata = {
  title: 'Precision Trainer — Panel Master',
  description: 'Panel de administración SaaS de Precision Trainer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import '@precision/ui/globals.css';

export const metadata: Metadata = {
  title: 'Precision Trainer — Mi Entrenamiento',
  description: 'Tu espacio personal de entrenamiento con Precision Trainer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  );
}

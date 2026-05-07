import type { Metadata } from 'next';
import '@precision/ui/globals.css';
import './master.css';

export const metadata: Metadata = {
  title: 'Neural Trainer Gym — Panel Master',
  description: 'Panel de administración SaaS de Neural Trainer Gym',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  );
}

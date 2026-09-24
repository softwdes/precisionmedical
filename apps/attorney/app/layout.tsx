import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SWRegister } from '@/components/SWRegister';
import './globals.css';

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('attorney.meta');
  return {
    title: t('title'),
    description: t('description'),
    manifest: '/manifest.json',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F43F5E',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // El idioma del documento sale de la cookie: con "en-US" en duro, la
    // página en castellano le mentía al lector de pantalla y el navegador
    // ofrecía traducir algo ya traducido.
    <html lang={`${locale}-US`} suppressHydrationWarning>
      <body className={font.className} suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <SWRegister />
      </body>
    </html>
  );
}

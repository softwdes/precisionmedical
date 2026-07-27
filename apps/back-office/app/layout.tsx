import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SWRegister } from '@/components/SWRegister';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import './globals.css';

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'LM v3 · Back Office',
  description: 'Precision Medical — Back Office (Front Office + Edson + Brunella + Super Admin clínico)',
  manifest: '/manifest.json',
  robots: 'noindex,nofollow',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'PM Clínica' },
  other: { 'mobile-web-app-capable': 'yes' },
  icons: {
    apple: [
      { url: '/icons/icon-152.png', sizes: '152x152' },
      { url: '/icons/icon-192.png', sizes: '192x192' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#2563EB',
};

// Inline script anti-FOUC: aplica el tema guardado en localStorage ANTES
// del primer render del DOM. Si no hay nada guardado, default = 'dark'.
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('pm_theme');
    if (!t) t = 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  // Capture beforeinstallprompt before React hydrates
  window.__pwaPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    window.__pwaPrompt = e;
  });
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang="en-US" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={font.className}>
        <PWAInstallBanner />
        <SWRegister />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  /**
   * El sufijo va UNA vez acá, no copiado en cada página.
   *
   * Antes cada `page.tsx` lo escribía a mano y convivían seis convenciones
   * distintas (`· LienMaster`, `· Portal Médico`, `· Back-office`,
   * `— Precision Medical`, `| Precision Medical`, y varias sin nada). Con el
   * template cada página declara solo su nombre —traducido— y el sufijo sale
   * solo, igual en todas y también en la próxima que se agregue.
   *
   * `default` es el título de las rutas que no declaran ninguno (login,
   * activación, sin-acceso): esas van SIEMPRE en inglés por regla, y así lo
   * quedan sin tener que declararlo. Las rutas de impresión (`doctor-print`,
   * el settlement) se salen del template con `title: { absolute }`, porque su
   * título ES el nombre del PDF y no debe llevar sufijo.
   */
  title: {
    template: '%s · Precision Medical',
    default: 'Precision Medical · Clinical Management',
  },
  description: 'Precision Medical — Clinical management & operations platform',
  manifest: '/manifest.json',
  robots: 'noindex,nofollow',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'PM Clinical' },
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

// Inline script: tema anti-FOUC + captura beforeinstallprompt
// El SW lo registra @ducanh2912/next-pwa automáticamente (register: true).
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('pm_theme');
    document.documentElement.setAttribute('data-theme', t || 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  // Captura beforeinstallprompt antes de que React hidrate
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
    /* `lang` con el locale real: estaba clavado en "en-US" con la app en
       español. No es cosmético — un lector de pantalla usa ese atributo para
       elegir la pronunciación, y leía el español con fonética inglesa. */
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Manifest link explícito — @ducanh2912/next-pwa puede interferir con metadata.manifest */}
        <link rel="manifest" href="/manifest.json" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={font.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

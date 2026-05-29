import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { TRPCProvider } from '@/components/providers/trpc-provider';
import { Toaster } from 'sonner';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { SWRegister } from '@/components/SWRegister';
import './globals.css';

const fontSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    template: '%s | LM Super Admin',
    default: 'LM Super Admin · Precision Medical',
  },
  description: 'Sistema de gestión operativa Precision Medical',
  manifest: '/manifest.json',
  robots: 'noindex,nofollow',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LM Admin',
  },
  icons: {
    icon: [{ url: '/icon', type: 'image/png', sizes: '32x32' }],
    apple: [
      { url: '/icons/icon-152.png', sizes: '152x152' },
      { url: '/icons/icon-192.png', sizes: '192x192' },
    ],
    shortcut: '/icon',
  },
};

export const viewport: Viewport = {
  themeColor: '#6366F1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const messages = await getMessages();
  const cookieStore = await cookies();
  const theme = (cookieStore.get('theme')?.value ?? 'dark') as 'dark' | 'light';
  const locale = (cookieStore.get('locale')?.value ?? 'es') as 'es' | 'en';

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      data-theme={theme}
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        {/*
          Explicit manifest link.
          metadata.manifest from `export const metadata` SHOULD emit
          this automatically, but in production we observed Chrome
          reporting "no manifest detected" — likely a Next.js bug or
          conflict with @serwist/next + next-intl in this combo.
          Hard-coding the link in the head guarantees Chrome can
          discover the PWA, which unblocks beforeinstallprompt and
          makes the install flow actually work.
        */}
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <TRPCProvider>
            <ThemeProvider defaultTheme={theme}>
              {children}
              <Toaster
                theme={theme}
                position="top-right"
                richColors
                closeButton
                expand
                duration={4000}
                visibleToasts={4}
                toastOptions={{
                  classNames: {
                    toast: 'pm-toast',
                    title: 'pm-toast-title',
                    description: 'pm-toast-description',
                    success: 'pm-toast-success',
                    error: 'pm-toast-error',
                    warning: 'pm-toast-warning',
                    info: 'pm-toast-info',
                    closeButton: 'pm-toast-close',
                    actionButton: 'pm-toast-action',
                  },
                }}
              />
            </ThemeProvider>
          </TRPCProvider>
        </NextIntlClientProvider>
        <PWAInstallBanner />
        <SWRegister />
      </body>
    </html>
  );
}

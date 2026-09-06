import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/i18n/messages';

/**
 * "Sin acceso" es parte del recorrido de entrada —se llega ahí sin haber entrado
 * nunca— así que va en inglés como el login. Ver el porqué del layout propio en
 * `app/login/layout.tsx`.
 */
export default function NoAccessLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {children}
    </NextIntlClientProvider>
  );
}

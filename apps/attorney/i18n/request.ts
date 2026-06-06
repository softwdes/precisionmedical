import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import esMessages from '@precision-medical/i18n/messages/es';
import enMessages from '@precision-medical/i18n/messages/en';

const messages = { es: esMessages, en: enMessages } as const;

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // Attorney portal default: English (vs other apps que default a 'es')
  const locale = (cookieStore.get('locale')?.value ?? 'en') as 'es' | 'en';

  return {
    locale,
    messages: messages[locale],
  };
});

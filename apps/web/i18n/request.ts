import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales, type Locale } from '@precision/i18n';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get('NEXT_LOCALE')?.value ?? defaultLocale;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as string;

  const messages =
    locale === 'en'
      ? (await import('@precision/i18n/messages/en.json')).default
      : (await import('@precision/i18n/messages/es.json')).default;

  return { locale, messages };
});

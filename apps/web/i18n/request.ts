import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { locales, defaultLocale } from '@precision/i18n';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || defaultLocale;

  return {
    locale,
    messages: (await import(`../../../packages/i18n/messages/${locale}.json`)).default
  };
});

import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { messages } from './messages';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = (cookieStore.get('locale')?.value ?? 'es') as 'es' | 'en';

  return {
    locale,
    messages: messages[locale],
  };
});

import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { messages } from './messages';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // Phoenix Back Office default: EN (English) — primary audience.
  // Override per-user via locale cookie set by Topbar language switcher.
  const locale = (cookieStore.get('locale')?.value ?? 'en') as 'es' | 'en';

  return {
    locale,
    messages: messages[locale],
  };
});

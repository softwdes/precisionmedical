import { useState, useEffect } from 'react';

const LS_KEY = 'trainer_currency_locale';
const SYNC_EVENT = 'trainer-currency-change';

export const LOCALE_DATA: Record<string, { symbol: string; label: string }> = {
  'es-AR': { symbol: '$',    label: 'Argentina — Peso ($)' },
  'es-MX': { symbol: '$',    label: 'México — Peso ($)' },
  'es-CO': { symbol: '$',    label: 'Colombia — Peso ($)' },
  'es-CL': { symbol: '$',    label: 'Chile — Peso ($)' },
  'es-UY': { symbol: '$',    label: 'Uruguay — Peso ($)' },
  'es-PE': { symbol: 'S/',   label: 'Perú — Sol (S/)' },
  'es-BO': { symbol: 'Bs.',  label: 'Bolivia — Boliviano (Bs.)' },
  'es-PY': { symbol: '₲',    label: 'Paraguay — Guaraní (₲)' },
  'es-EC': { symbol: '$',    label: 'Ecuador — Dólar ($)' },
  'es-VE': { symbol: 'Bs.S', label: 'Venezuela — Bolívar (Bs.S)' },
  'es-GT': { symbol: 'Q',    label: 'Guatemala — Quetzal (Q)' },
  'es-HN': { symbol: 'L',    label: 'Honduras — Lempira (L)' },
  'es-CR': { symbol: '₡',    label: 'Costa Rica — Colón (₡)' },
  'es-DO': { symbol: 'RD$',  label: 'Rep. Dominicana — Peso (RD$)' },
  'en-US': { symbol: 'US$',  label: 'Estados Unidos — Dólar (US$)' },
  'en-GB': { symbol: '£',    label: 'Reino Unido — Libra (£)' },
};

// Timezone → locale: more reliable than navigator.language (reflects OS location, not browser language)
const TZ_LOCALE: Record<string, string> = {
  'America/Lima':                        'es-PE',
  'America/Bogota':                      'es-CO',
  'America/Mexico_City':                 'es-MX',
  'America/Monterrey':                   'es-MX',
  'America/Mazatlan':                    'es-MX',
  'America/Merida':                      'es-MX',
  'America/Chihuahua':                   'es-MX',
  'America/Hermosillo':                  'es-MX',
  'America/Tijuana':                     'es-MX',
  'America/Cancun':                      'es-MX',
  'America/Buenos_Aires':                'es-AR',
  'America/Argentina/Buenos_Aires':      'es-AR',
  'America/Argentina/Cordoba':           'es-AR',
  'America/Argentina/Mendoza':           'es-AR',
  'America/Argentina/Salta':             'es-AR',
  'America/Argentina/Jujuy':             'es-AR',
  'America/Argentina/Tucuman':           'es-AR',
  'America/Argentina/Catamarca':         'es-AR',
  'America/Argentina/La_Rioja':          'es-AR',
  'America/Argentina/San_Juan':          'es-AR',
  'America/Argentina/San_Luis':          'es-AR',
  'America/Argentina/Rio_Gallegos':      'es-AR',
  'America/Argentina/Ushuaia':           'es-AR',
  'America/Santiago':                    'es-CL',
  'Pacific/Easter':                      'es-CL',
  'America/Caracas':                     'es-VE',
  'America/La_Paz':                      'es-BO',
  'America/Asuncion':                    'es-PY',
  'America/Montevideo':                  'es-UY',
  'America/Guayaquil':                   'es-EC',
  'Pacific/Galapagos':                   'es-EC',
  'America/Guatemala':                   'es-GT',
  'America/Tegucigalpa':                 'es-HN',
  'America/Costa_Rica':                  'es-CR',
  'America/Santo_Domingo':               'es-DO',
  'America/New_York':                    'en-US',
  'America/Chicago':                     'en-US',
  'America/Denver':                      'en-US',
  'America/Phoenix':                     'en-US',
  'America/Los_Angeles':                 'en-US',
  'America/Anchorage':                   'en-US',
  'Pacific/Honolulu':                    'en-US',
  'Europe/London':                       'en-GB',
};

function detectLocale(): string {
  // 1. User's explicit preference
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
  if (saved && LOCALE_DATA[saved]) return saved;

  // 2. Timezone (reflects actual OS location — more reliable than browser language)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_LOCALE[tz]) return TZ_LOCALE[tz]!;
  } catch { /* ignore */ }

  // 3. navigator.language fallback
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'es-AR';
  if (LOCALE_DATA[lang]) return lang;
  const prefix = lang.split('-')[0];
  if (prefix === 'es') return 'es-AR';
  if (prefix === 'en') return 'en-US';

  return 'es-AR';
}

export function useCurrencySymbol() {
  const [locale, setLocale] = useState<string>('es-AR');

  useEffect(() => {
    setLocale(detectLocale());

    function onSync() { setLocale(detectLocale()); }
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const data = LOCALE_DATA[locale] ?? LOCALE_DATA['es-AR']!;
  const symbol = data.symbol;

  function format(amount: number): string {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${symbol}${formatted}`;
  }

  function saveLocale(newLocale: string) {
    localStorage.setItem(LS_KEY, newLocale);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }

  return { symbol, format, locale, saveLocale };
}

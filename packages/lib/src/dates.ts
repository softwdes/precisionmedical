const PERU_TZ = 'America/Lima';
const PERU_LOCALE = 'es-PE';

/**
 * Format a date for display in Peru timezone.
 */
export function formatDate(date: Date | string, style: 'short' | 'long' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(PERU_LOCALE, {
    timeZone: PERU_TZ,
    dateStyle: style,
  }).format(d);
}

/**
 * Convert UTC date to Lima local time string.
 */
export function toLocalTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(PERU_LOCALE, {
    timeZone: PERU_TZ,
    timeStyle: 'short',
    dateStyle: 'short',
  }).format(d);
}

const PERU_LOCALE = 'es-PE';

/**
 * Format amount in PEN (Peruvian Soles) by default.
 */
export function formatCurrency(amount: number, currency = 'PEN'): string {
  return new Intl.NumberFormat(PERU_LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

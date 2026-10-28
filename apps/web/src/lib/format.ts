/** Date and time in the interface language, e.g. "29/10/2026, 14:05". */
export function formatDateTime(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** "65.63" → "65.6%" (en) / "65,6%" (de). One decimal is as precise as a 7-day accuracy gets. */
export function formatPercent(value: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

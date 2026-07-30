/**
 * Local (browser timezone) calendar day as YYYY-MM-DD.
 *
 * The cash ledger works on operative days resolved in the browser timezone, so the
 * date must always be sent explicitly to the API: the backend falls back to UTC,
 * which resolves to the previous day between midnight and 02:00 in Europe/Madrid.
 */
export function localDateYmd(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

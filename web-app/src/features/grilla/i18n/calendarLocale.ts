export function calendarLocale(lng: string): string {
  if (lng.startsWith('zh')) return 'zh-CN';
  if (lng.startsWith('en')) return 'en';
  return 'es';
}

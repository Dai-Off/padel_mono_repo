type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function formatTimeAgo(
  dateInput: string | Date,
  t: TranslateFn,
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return t('common.timeAgoNow');

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return t('common.timeAgoMinutes', { count: diffInMinutes });

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return t('common.timeAgoHours', { count: diffInHours });

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return t('common.timeAgoDays', { count: diffInDays });

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return t('common.timeAgoWeeks', { count: diffInWeeks });

  return date.toLocaleDateString();
}

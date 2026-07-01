const DEFAULT_GRACE_DAYS = 14;

export function getAccountDeletionGraceDays(): number {
  const raw = process.env.ACCOUNT_DELETION_GRACE_DAYS?.trim();
  if (!raw) return DEFAULT_GRACE_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_GRACE_DAYS;
  return n;
}

export function getAccountDeletionGraceMs(): number {
  return getAccountDeletionGraceDays() * 24 * 60 * 60 * 1000;
}

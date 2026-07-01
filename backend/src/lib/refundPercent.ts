export const ALLOWED_REFUND_PERCENTS = [0, 25, 50, 75, 100] as const;
export type RefundPercent = (typeof ALLOWED_REFUND_PERCENTS)[number];

export function normalizeRefundPercent(value: unknown): RefundPercent {
  const n = Math.trunc(Number(value));
  if ((ALLOWED_REFUND_PERCENTS as readonly number[]).includes(n)) {
    return n as RefundPercent;
  }
  throw new Error('refund_percent debe ser 0, 25, 50, 75 o 100');
}

export function scaleCentsByPercent(cents: number, percent: number): number {
  if (percent <= 0 || cents <= 0) return 0;
  return Math.max(0, Math.round((cents * percent) / 100));
}

export function resolveAdminRefundPercent(
  body: { refund_percent?: unknown; apply_refund?: unknown },
  policyEligible: boolean,
  hasPayments = true,
): RefundPercent {
  if (!hasPayments) return 0;
  if (policyEligible) return 100;
  if (body.refund_percent != null && body.refund_percent !== '') {
    return normalizeRefundPercent(body.refund_percent);
  }
  if (typeof body.apply_refund === 'boolean') {
    return body.apply_refund ? 100 : 0;
  }
  return 0;
}

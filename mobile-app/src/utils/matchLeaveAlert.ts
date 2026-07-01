export type MatchCancelPreviewResult = {
  ok?: boolean;
  refund_eligible?: boolean;
  policy_message?: string;
};

export type LeaveMatchAlertMode = {
  /** Creador del partido → cancela reserva para todos. */
  isOrganizer: boolean;
  /** Solo queda una plaza ocupada (mensaje más corto al cancelar). */
  soloInMatch: boolean;
};

export function buildLeaveMatchAlertMessage(
  t: (key: string) => string,
  mode: LeaveMatchAlertMode,
  preview: MatchCancelPreviewResult | null,
): string {
  const noRefund = preview?.ok === true && preview.refund_eligible === false;
  const policyText =
    preview?.policy_message?.trim() || t('alerts.leaveMatch.policyNoRefundDefault');

  let base: string;
  if (mode.isOrganizer) {
    base = mode.soloInMatch
      ? noRefund
        ? t('alerts.leaveMatch.bodySoloNoRefund')
        : t('alerts.leaveMatch.bodySolo')
      : noRefund
        ? t('alerts.leaveMatch.bodyOrganizerCancelNoRefund')
        : t('alerts.leaveMatch.bodyOrganizerCancel');
  } else {
    base = noRefund ? t('alerts.leaveMatch.bodyMultiNoRefund') : t('alerts.leaveMatch.bodyMulti');
  }

  return noRefund ? `${base}\n\n${policyText}` : base;
}

export function buildLeaveMatchDoneMessage(
  t: (key: string) => string,
  opts: { entireMatch: boolean; refundEligible: boolean },
): string {
  if (opts.entireMatch) {
    return opts.refundEligible
      ? t('alerts.leaveMatch.doneCancelWithRefund')
      : t('alerts.leaveMatch.doneCancelNoRefund');
  }
  return opts.refundEligible
    ? t('alerts.leaveMatch.doneLeaveWithRefund')
    : t('alerts.leaveMatch.doneLeaveNoRefund');
}

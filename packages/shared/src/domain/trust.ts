/**
 * Trust & safety thresholds (SRS §3.5, §3.11).
 *
 *  - A single report against a user lowers their rating but takes no other
 *    action. A SECOND report against the SAME user triggers mandatory admin
 *    review — it does not itself ban anyone; a ban follows only from admin
 *    decision or the no-show threshold below.
 *  - Independently, 5 system-tracked no-shows (by either party) trigger an
 *    AUTOMATIC ban — no admin step required, because it's a counted fact
 *    rather than a judgement call.
 *  - Every ban — automatic or manual — carries a stated reason and is not
 *    final until reviewed or the appeal window has passed.
 */
export const REPORT_COUNT_FOR_ADMIN_REVIEW = 2;
export const NO_SHOW_COUNT_FOR_AUTO_BAN = 5;

/** 2nd-report cases and ban appeals are targeted for review within this window. */
export const ADMIN_REVIEW_SLA_HOURS = 24;

export function requiresAdminReview(reportCountAgainstUser: number): boolean {
  return reportCountAgainstUser >= REPORT_COUNT_FOR_ADMIN_REVIEW;
}

export function triggersAutoBan(noShowCount: number): boolean {
  return noShowCount >= NO_SHOW_COUNT_FOR_AUTO_BAN;
}

export type BanTrigger = 'automatic' | 'manual';

export type ReportReason = 'no_show' | 'misconduct' | 'safety' | 'other';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  no_show: "Didn't show up",
  misconduct: 'Behaviour or misconduct',
  safety: 'Safety concern',
  other: 'Something else',
};

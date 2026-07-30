import { describe, expect, it } from 'vitest';
import {
  requiresAdminReview,
  triggersAutoBan,
  NO_SHOW_COUNT_FOR_AUTO_BAN,
  REPORT_COUNT_FOR_ADMIN_REVIEW,
  REPORT_REASON_LABELS,
} from './trust.js';

describe('report escalation', () => {
  it('does not escalate a single report', () => {
    expect(requiresAdminReview(1)).toBe(false);
  });

  it('escalates on the second report against the same user', () => {
    expect(requiresAdminReview(REPORT_COUNT_FOR_ADMIN_REVIEW)).toBe(true);
    expect(REPORT_COUNT_FOR_ADMIN_REVIEW).toBe(2);
  });

  it('stays escalated for further reports', () => {
    expect(requiresAdminReview(5)).toBe(true);
  });
});

describe('no-show ban threshold', () => {
  it('does not ban below the 5-strike threshold', () => {
    expect(triggersAutoBan(4)).toBe(false);
  });

  it('bans automatically at exactly 5', () => {
    expect(triggersAutoBan(NO_SHOW_COUNT_FOR_AUTO_BAN)).toBe(true);
    expect(NO_SHOW_COUNT_FOR_AUTO_BAN).toBe(5);
  });
});

describe('report reasons', () => {
  it('has a label for every reason offered in the Report a problem sheet', () => {
    for (const reason of ['no_show', 'misconduct', 'safety', 'other'] as const) {
      expect(REPORT_REASON_LABELS[reason]).toBeTruthy();
    }
  });
});

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, requiresAdminReview } from '@sc/shared';
import type { ReportStatus } from '@sc/shared';
import { useReports } from '../api/trust';
import { Badge } from '../components/Badge';

const FILTERS: { label: string; value: ReportStatus | undefined }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Reviewing', value: 'reviewing' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'All', value: undefined },
];

const STATUS_TONE: Record<ReportStatus, 'accent' | 'neutral' | 'dark'> = {
  open: 'accent',
  reviewing: 'dark',
  resolved: 'neutral',
};

export function ReportsPage() {
  const [filter, setFilter] = useState<ReportStatus | undefined>('open');
  const { data: reports, isLoading, isError } = useReports(filter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Reports</h1>
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-white/5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                setFilter(f.value);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-dark-surface dark:text-dark-text'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-dark-muted dark:hover:text-dark-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load reports.</p>
      ) : null}
      {!isLoading && reports?.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">Nothing here.</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {reports?.map((report) => (
          <Link
            key={report.id}
            to={`/reports/${report.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-neutral-50 dark:hover:bg-white/5"
          >
            <div className="min-w-0">
              <p className="font-medium text-neutral-900 dark:text-dark-text">
                {report.reporter.displayName} reported {report.reported.displayName}
              </p>
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
                {REPORT_REASON_LABELS[report.reason]} ·{' '}
                {new Date(report.createdAt).toLocaleDateString()}
              </p>
              {requiresAdminReview(report.reportCountAgainstReported) ? (
                <p className="mt-1 text-sm font-medium text-accent-700 dark:text-dark-accent">
                  {report.reportCountAgainstReported} reports against this person — needs review
                </p>
              ) : null}
            </div>
            <Badge label={REPORT_STATUS_LABELS[report.status]} tone={STATUS_TONE[report.status]} />
          </Link>
        ))}
      </div>
    </div>
  );
}

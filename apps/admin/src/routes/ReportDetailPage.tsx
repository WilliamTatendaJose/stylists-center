import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, type ReportStatus } from '@sc/shared';
import { useCreateManualBan, useReport, useUpdateReportStatus } from '../api/trust';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextAreaField } from '../components/ui/Field';

const STATUS_TONE: Record<ReportStatus, 'accent' | 'neutral' | 'dark'> = {
  open: 'accent',
  reviewing: 'dark',
  resolved: 'neutral',
};

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading, isError } = useReport(id);
  const updateStatus = useUpdateReportStatus(id ?? '');
  const createBan = useCreateManualBan();

  const [note, setNote] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banOpen, setBanOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p>;
  if (isError || !report)
    return (
      <p className="text-sm text-accent-700 dark:text-dark-accent">
        Couldn&apos;t load this report.
      </p>
    );

  const setStatus = (status: ReportStatus) => {
    setError(null);
    updateStatus.mutate(
      { status, ...(note.trim() ? { resolutionNote: note.trim() } : {}) },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not update.');
        },
      },
    );
  };

  const submitBan = () => {
    if (!banReason.trim()) return;
    setError(null);
    createBan.mutate(
      { userId: report.reported.id, reason: banReason.trim() },
      {
        onSuccess: () => {
          void navigate('/bans');
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not create ban.');
        },
      },
    );
  };

  return (
    <div className="max-w-2xl">
      <Link
        to="/reports"
        className="mb-4 inline-block text-sm text-neutral-600 hover:underline dark:text-dark-muted"
      >
        ← Reports
      </Link>

      <Card>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">
              {report.reporter.displayName} reported {report.reported.displayName}
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
              {REPORT_REASON_LABELS[report.reason]} · filed{' '}
              {new Date(report.createdAt).toLocaleString()}
            </p>
          </div>
          <Badge label={REPORT_STATUS_LABELS[report.status]} tone={STATUS_TONE[report.status]} />
        </div>

        <dl className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Reporter</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {report.reporter.displayName} · {report.reporter.phone}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Reported</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {report.reported.displayName} · {report.reported.phone}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Total reports against them</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {report.reportCountAgainstReported}
            </dd>
          </div>
          {report.bookingId ? (
            <div>
              <dt className="text-neutral-600 dark:text-dark-muted">Booking</dt>
              <dd className="font-medium text-neutral-900 dark:text-dark-text">
                {report.bookingId}
              </dd>
            </div>
          ) : null}
        </dl>

        {report.resolutionNote ? (
          <div className="mb-6 rounded-xl bg-neutral-50 p-4 text-sm dark:bg-white/5">
            <p className="font-medium text-neutral-700 dark:text-dark-muted">Resolution note</p>
            <p className="mt-1 text-neutral-900 dark:text-dark-text">{report.resolutionNote}</p>
          </div>
        ) : null}

        {report.status !== 'resolved' ? (
          <TextAreaField
            label="Note (optional, shown when resolving)"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            rows={3}
          />
        ) : null}

        {error ? (
          <p role="alert" className="mb-4 text-sm text-accent-700 dark:text-dark-accent">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {report.status === 'open' ? (
            <Button
              variant="secondary"
              disabled={updateStatus.isPending}
              onClick={() => {
                setStatus('reviewing');
              }}
            >
              Mark reviewing
            </Button>
          ) : null}
          {report.status !== 'resolved' ? (
            <Button
              variant="secondary"
              disabled={updateStatus.isPending}
              onClick={() => {
                setStatus('resolved');
              }}
            >
              Resolve
            </Button>
          ) : null}
          <Button
            variant="danger"
            onClick={() => {
              setBanOpen((v) => !v);
            }}
            className="border border-accent-700 dark:border-dark-accent"
          >
            Ban {report.reported.displayName}
          </Button>
        </div>

        {banOpen ? (
          <div className="mt-4 rounded-xl border border-accent-100 bg-accent-100/40 p-4 dark:border-accent/20 dark:bg-accent/10">
            <TextAreaField
              label="Ban reason"
              value={banReason}
              onChange={(e) => {
                setBanReason(e.target.value);
              }}
              rows={2}
              placeholder="Why is this account being removed?"
            />
            <Button
              variant="primary"
              disabled={!banReason.trim() || createBan.isPending}
              onClick={submitBan}
            >
              {createBan.isPending ? 'Banning…' : 'Confirm ban'}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

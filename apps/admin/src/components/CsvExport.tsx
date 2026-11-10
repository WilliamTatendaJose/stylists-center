import { useState } from 'react';
import { apiFetch, ApiError } from '../api/client';
import { Button } from './ui/Button';

type Kind = 'payments' | 'payouts' | 'cash-outs';

const LABELS: Record<Kind, string> = {
  payments: 'Payments ledger',
  payouts: 'Payouts',
  'cash-outs': 'Cash-outs',
};

/** Today's date in Harare (UTC+2), as YYYY-MM-DD. */
function harareToday(): string {
  return new Date(Date.now() + 2 * 60 * 60_000).toISOString().slice(0, 10);
}

/**
 * Date range + one download button per export. Dates are Harare days,
 * inclusive; the API caps a range at a year and records each export in the
 * audit log.
 */
export function CsvExport({ kinds }: { kinds: Kind[] }) {
  const today = harareToday();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (kind: Kind) => {
    setError(null);
    setBusy(kind);
    try {
      const params = new URLSearchParams({ from, to });
      const file = await apiFetch<Blob>(`/v1/admin/exports/${kind}.csv?${params.toString()}`, {
        blob: true,
      });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not export.');
    } finally {
      setBusy(null);
    }
  };

  const dateInput =
    'rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 dark:border-dark-border dark:bg-white/5 dark:text-dark-text';

  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 p-4 dark:border-dark-border">
      <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-dark-text">
        Export to CSV
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-neutral-700 dark:text-dark-muted">
          <span className="mb-1 block">From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
            }}
            className={dateInput}
          />
        </label>
        <label className="text-sm text-neutral-700 dark:text-dark-muted">
          <span className="mb-1 block">To</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
            }}
            className={dateInput}
          />
        </label>
        {kinds.map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            disabled={busy !== null || !from || !to}
            onClick={() => {
              void download(kind);
            }}
          >
            {busy === kind ? 'Exporting…' : LABELS[kind]}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500 dark:text-dark-muted">
        Harare dates, both days included. Exports are recorded in the audit log.
      </p>
      {error ? <p className="mt-2 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
    </div>
  );
}

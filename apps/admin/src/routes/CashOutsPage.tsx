import { useState } from 'react';
import { formatUsd } from '@sc/shared';
import type { AdminCashOutRowDto } from '@sc/shared';
import { useCashOuts, useSettleCashOut } from '../api/wallet';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';

function SettleCashOutForm({
  cashOut,
  onDone,
}: {
  cashOut: AdminCashOutRowDto;
  onDone: () => void;
}) {
  const settleCashOut = useSettleCashOut(cashOut.transactionId);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    settleCashOut.mutate(
      { note: note.trim() || undefined },
      {
        onSuccess: onDone,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not settle this cash-out.');
        },
      },
    );
  };

  return (
    <div className="mt-3 rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <TextField
        label="Note (optional)"
        placeholder="e.g. EcoCash ref, cash handed over"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
      />
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={settleCashOut.isPending}>
          {settleCashOut.isPending ? 'Recording…' : 'Confirm paid'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CashOutRow({ cashOut }: { cashOut: AdminCashOutRowDto }) {
  const [settling, setSettling] = useState(false);

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-dark-text">
            {cashOut.displayName} · {cashOut.phone}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
            {formatUsd(cashOut.amountUsdCents)} · {cashOut.coins} coins · requested{' '}
            {new Date(cashOut.requestedAt).toLocaleDateString()}
            {cashOut.settledAt ? ` · paid ${new Date(cashOut.settledAt).toLocaleDateString()}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            label={cashOut.settled ? 'Paid' : 'Pending'}
            tone={cashOut.settled ? 'neutral' : 'accent'}
          />
          {!cashOut.settled ? (
            <Button
              variant="secondary"
              onClick={() => {
                setSettling((v) => !v);
              }}
            >
              {settling ? 'Close' : 'Mark paid'}
            </Button>
          ) : null}
        </div>
      </div>

      {settling ? (
        <SettleCashOutForm
          cashOut={cashOut}
          onDone={() => {
            setSettling(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function CashOutsPage() {
  const { data: cashOuts, isLoading, isError } = useCashOuts();
  const pendingCount = cashOuts?.filter((c) => !c.settled).length ?? 0;

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-neutral-900 dark:text-dark-text">Cash-outs</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-dark-muted">
        A cash-out request debits a stylist&apos;s SC Coin balance the moment they ask — that only
        marks the ledger settled, it does not send money. Use &quot;Mark paid&quot; once the
        real-world transfer (EcoCash, cash, bank) has actually happened.
      </p>

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">
          Couldn&apos;t load cash-out requests.
        </p>
      ) : null}
      {!isLoading && cashOuts?.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">No cash-out requests yet.</p>
      ) : null}
      {!isLoading && cashOuts && cashOuts.length > 0 ? (
        <p className="mb-3 text-sm text-neutral-600 dark:text-dark-muted">{pendingCount} pending</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {cashOuts?.map((cashOut) => (
          <CashOutRow key={cashOut.transactionId} cashOut={cashOut} />
        ))}
      </div>
    </div>
  );
}

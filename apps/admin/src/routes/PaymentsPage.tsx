import { useState } from 'react';
import { AlertTriangle, Banknote, HandCoins, Lock, Wallet } from 'lucide-react';
import { formatUsd } from '@sc/shared';
import type { AdminProviderPayoutRowDto } from '@sc/shared';
import { usePaymentsOverview, useProviderPayouts, useRecordPayout } from '../api/payments';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatTile } from '../components/ui/StatTile';
import { TextField } from '../components/ui/Field';

function RecordPayoutForm({
  provider,
  onDone,
}: {
  provider: AdminProviderPayoutRowDto;
  onDone: () => void;
}) {
  const recordPayout = useRecordPayout(provider.providerId);
  const [amountInput, setAmountInput] = useState(String(provider.owedUsdCents / 100));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const dollars = Number(amountInput);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setError(null);
    recordPayout.mutate(
      { amountUsdCents: Math.round(dollars * 100), note: note.trim() || undefined },
      {
        onSuccess: onDone,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not record payout.');
        },
      },
    );
  };

  return (
    <div className="mt-3 rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
        <TextField
          label="Amount (USD)"
          value={amountInput}
          onChange={(e) => {
            setAmountInput(e.target.value);
          }}
        />
        <TextField
          label="Note (optional)"
          placeholder="e.g. EcoCash ref, bank transfer date"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </div>
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={recordPayout.isPending}>
          {recordPayout.isPending ? 'Recording…' : 'Confirm payout'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ProviderPayoutRow({ provider }: { provider: AdminProviderPayoutRowDto }) {
  const [recording, setRecording] = useState(false);

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-dark-text">
            {provider.displayName} · {provider.phone}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
            {formatUsd(provider.releasedUsdCents)} released · {formatUsd(provider.paidOutUsdCents)}{' '}
            paid out
            {provider.lastPayoutAt
              ? ` · last payout ${new Date(provider.lastPayoutAt).toLocaleDateString()}`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            label={
              provider.owedUsdCents > 0 ? `Owes ${formatUsd(provider.owedUsdCents)}` : 'Settled'
            }
            tone={provider.owedUsdCents > 0 ? 'accent' : 'neutral'}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setRecording((v) => !v);
            }}
          >
            {recording ? 'Close' : 'Record payout'}
          </Button>
        </div>
      </div>

      {recording ? (
        <RecordPayoutForm
          provider={provider}
          onDone={() => {
            setRecording(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function PaymentsPage() {
  const { data: overview, isLoading: overviewLoading } = usePaymentsOverview();
  const { data: providers, isLoading: providersLoading, isError } = useProviderPayouts();

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-neutral-900 dark:text-dark-text">Payments</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-dark-muted">
        Client bookings and orders are held in escrow, then released to a provider&apos;s balance
        here — that only marks the ledger settled, it does not send money. Use &quot;Record
        payout&quot; once a provider has actually been paid (bank transfer, EcoCash, cash) to track
        what&apos;s still outstanding.
      </p>

      {overviewLoading ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p>
      ) : null}

      {overview ? (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Held in escrow"
            value={formatUsd(overview.heldUsdCents)}
            icon={<Lock size={20} />}
          />
          <StatTile
            label="Released to providers"
            value={formatUsd(overview.releasedUsdCents)}
            icon={<Wallet size={20} />}
          />
          <StatTile
            label="Paid out"
            value={formatUsd(overview.paidOutUsdCents)}
            icon={<Banknote size={20} />}
          />
          <StatTile
            label="Outstanding"
            value={formatUsd(overview.owedUsdCents)}
            icon={<HandCoins size={20} />}
            tone={overview.owedUsdCents > 0 ? 'accent' : 'neutral'}
          />
        </div>
      ) : null}

      {overview && (overview.refundedUsdCents > 0 || overview.failedUsdCents > 0) ? (
        <Card className="mb-8 flex items-center gap-3 border-accent-200 bg-accent-50 dark:border-transparent dark:bg-accent/10">
          <AlertTriangle size={18} className="shrink-0 text-accent-700 dark:text-dark-accent" />
          <p className="text-sm text-accent-800 dark:text-dark-accent">
            {formatUsd(overview.refundedUsdCents)} refunded and {formatUsd(overview.failedUsdCents)}{' '}
            failed across all bookings and orders.
          </p>
        </Card>
      ) : null}

      <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">Provider balances</h2>

      {providersLoading ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p>
      ) : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">
          Couldn&apos;t load provider balances.
        </p>
      ) : null}
      {!providersLoading && providers?.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">
          No provider has any released earnings yet.
        </p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {providers?.map((provider) => (
          <ProviderPayoutRow key={provider.providerId} provider={provider} />
        ))}
      </div>
    </div>
  );
}

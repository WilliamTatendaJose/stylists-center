import { useState } from 'react';
import { formatInHarare, formatUsd } from '@sc/shared';
import type { AdminCashOutRowDto } from '@sc/shared';
import { useAgents, useCashOuts, useSettleCashOut } from '../api/wallet';
import { ApiError } from '../api/client';
import { Pager, SearchBox } from '../components/Pager';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { CsvExport } from '../components/CsvExport';

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
            {formatUsd(cashOut.amountUsdCents)} · {cashOut.coins}{' '}
            {cashOut.coinType === 'agent' ? 'agent coins' : 'coins from clients'} · requested{' '}
            {new Date(cashOut.requestedAt).toLocaleDateString()}
            {cashOut.settledAt ? ` · paid ${new Date(cashOut.settledAt).toLocaleDateString()}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            label={cashOut.coinType === 'agent' ? 'Agent earnings' : 'Stylist or vendor'}
            tone="dark"
          />
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

function CashOutsList() {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useCashOuts({ q, offset });
  const cashOuts = data?.items;
  const pendingCount = cashOuts?.filter((c) => !c.settled).length ?? 0;

  return (
    <div>
      <p className="mb-6 text-sm text-neutral-600 dark:text-dark-muted">
        A cash-out request debits a stylist&apos;s SC Coin balance the moment they ask — that only
        marks the ledger settled, it does not send money. Use &quot;Mark paid&quot; once the
        real-world transfer (EcoCash, cash, bank) has actually happened.
      </p>

      <CsvExport kinds={['cash-outs']} />
      <div className="mb-4">
        <SearchBox
          placeholder="Search name or phone"
          onSearch={(value) => {
            setQ(value);
            setOffset(0);
          }}
        />
      </div>
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
      {data ? (
        <Pager offset={offset} shown={data.items.length} total={data.total} onChange={setOffset} />
      ) : null}
    </div>
  );
}

const DATE_FORMAT = 'd MMM yyyy';

function AgentsList() {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [subscription, setSubscription] = useState<'' | 'active' | 'lapsed'>('');
  const { data, isLoading, isError } = useAgents({
    q,
    offset,
    ...(subscription ? { subscription } : {}),
  });

  return (
    <div>
      <p className="mb-6 text-sm text-neutral-600 dark:text-dark-muted">
        Agents need an active subscription to earn on purchases and to cash out their agent coins.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          placeholder="Search name or phone"
          onSearch={(value) => {
            setQ(value);
            setOffset(0);
          }}
        />
        {(['', 'active', 'lapsed'] as const).map((value) => (
          <Button
            key={value || 'all'}
            variant={subscription === value ? 'primary' : 'secondary'}
            onClick={() => {
              setSubscription(value);
              setOffset(0);
            }}
          >
            {value === '' ? 'All' : value === 'active' ? 'Subscribed' : 'Not subscribed'}
          </Button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load agents.</p>
      ) : null}
      {!isLoading && data?.items.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">No agents found.</p>
      ) : null}
      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {data?.items.map((agent) => (
          <div
            key={agent.agentId}
            className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <div className="min-w-0">
              <p className="font-medium text-neutral-900 dark:text-dark-text">
                {agent.displayName} · {agent.phone}
              </p>
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
                Code {agent.referralCode} · {agent.agentCoins} agent coins ·{' '}
                {agent.subscriptionPaidUntil
                  ? `${agent.subscriptionActive ? 'paid until' : 'ended'} ${formatInHarare(agent.subscriptionPaidUntil, DATE_FORMAT)}`
                  : 'never subscribed'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                label={agent.subscriptionActive ? 'Subscribed' : 'Not subscribed'}
                tone={agent.subscriptionActive ? 'neutral' : 'accent'}
              />
              {agent.verificationStatus !== 'verified' ? (
                <Badge label="Not verified" tone="accent" />
              ) : null}
              {agent.status !== 'active' ? <Badge label="Suspended" tone="accent" /> : null}
            </div>
          </div>
        ))}
      </div>
      {data ? (
        <Pager offset={offset} shown={data.items.length} total={data.total} onChange={setOffset} />
      ) : null}
    </div>
  );
}

export function CashOutsPage() {
  const [tab, setTab] = useState<'cash-outs' | 'agents'>('cash-outs');
  return (
    <div>
      <h1 className="mb-3 text-lg font-bold text-neutral-900 dark:text-dark-text">
        Cash-outs and agents
      </h1>
      <div className="mb-5 flex gap-2">
        <Button
          variant={tab === 'cash-outs' ? 'primary' : 'secondary'}
          onClick={() => {
            setTab('cash-outs');
          }}
        >
          Cash-outs
        </Button>
        <Button
          variant={tab === 'agents' ? 'primary' : 'secondary'}
          onClick={() => {
            setTab('agents');
          }}
        >
          Agent subscriptions
        </Button>
      </div>
      {tab === 'cash-outs' ? <CashOutsList /> : <AgentsList />}
    </div>
  );
}

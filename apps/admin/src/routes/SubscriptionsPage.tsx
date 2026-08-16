import { useMemo, useState } from 'react';
import { DollarSign, Users, Wallet } from 'lucide-react';
import { formatUsd } from '@sc/shared';
import type { AdminProviderRowDto } from '@sc/shared';
import { useExtendSubscription, useProviders, useUpdateProvider } from '../api/providers';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { StatTile } from '../components/ui/StatTile';

const FILTERS: { label: string; value: 'active' | 'lapsed' | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Active', value: 'active' },
  { label: 'Lapsed', value: 'lapsed' },
];

function SubscriptionRow({ provider }: { provider: AdminProviderRowDto }) {
  const updateProvider = useUpdateProvider(provider.id);
  const extendSubscription = useExtendSubscription(provider.id);
  const [priceInput, setPriceInput] = useState(String(provider.subscriptionPriceUsdCents / 100));
  const [error, setError] = useState<string | null>(null);

  const priceChanged = Math.round(Number(priceInput) * 100) !== provider.subscriptionPriceUsdCents;

  const savePrice = () => {
    const dollars = Number(priceInput);
    if (!Number.isFinite(dollars) || dollars < 0) return;
    setError(null);
    updateProvider.mutate(
      { subscriptionPriceUsdCents: Math.round(dollars * 100) },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not update.');
        },
      },
    );
  };

  const extend = () => {
    setError(null);
    extendSubscription.mutate(undefined, {
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : 'Could not extend.');
      },
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="font-medium text-neutral-900 dark:text-dark-text">
          {provider.displayName} · {provider.phone}
        </p>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
          {provider.subscriptionPaidUntil
            ? `${provider.subscriptionActive ? 'Renews' : 'Expired'} ${new Date(
                provider.subscriptionPaidUntil,
              ).toLocaleDateString()}`
            : 'Never paid'}
        </p>
        {error ? (
          <p className="mt-1 text-sm text-accent-700 dark:text-dark-accent">{error}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Badge
          label={provider.subscriptionActive ? 'Active' : 'Lapsed'}
          tone={provider.subscriptionActive ? 'neutral' : 'accent'}
        />
        <div className="flex items-center gap-1">
          <span className="text-sm text-neutral-600 dark:text-dark-muted">$</span>
          <input
            value={priceInput}
            onChange={(e) => {
              setPriceInput(e.target.value);
            }}
            className="w-16 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 focus:border-accent focus:outline-none dark:border-dark-border dark:bg-white/5 dark:text-dark-text"
          />
          {priceChanged ? (
            <Button variant="secondary" onClick={savePrice} disabled={updateProvider.isPending}>
              Save
            </Button>
          ) : null}
        </div>
        <Button variant="secondary" onClick={extend} disabled={extendSubscription.isPending}>
          {extendSubscription.isPending ? 'Extending…' : 'Extend 30 days'}
        </Button>
      </div>
    </div>
  );
}

export function SubscriptionsPage() {
  const [filter, setFilter] = useState<'active' | 'lapsed' | undefined>(undefined);
  const { data: providers, isLoading, isError } = useProviders();

  const filtered = useMemo(() => {
    if (!providers) return providers;
    if (filter === 'active') return providers.filter((p) => p.subscriptionActive);
    if (filter === 'lapsed') return providers.filter((p) => !p.subscriptionActive);
    return providers;
  }, [providers, filter]);

  const activeCount = providers?.filter((p) => p.subscriptionActive).length ?? 0;
  const lapsedCount = (providers?.length ?? 0) - activeCount;
  const mrrUsdCents =
    providers
      ?.filter((p) => p.subscriptionActive)
      .reduce((sum, p) => sum + p.subscriptionPriceUsdCents, 0) ?? 0;

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-neutral-900 dark:text-dark-text">Subscriptions</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Monthly recurring revenue"
          value={formatUsd(mrrUsdCents)}
          icon={<DollarSign size={20} />}
        />
        <StatTile label="Active subscriptions" value={activeCount} icon={<Wallet size={20} />} />
        <StatTile
          label="Lapsed"
          value={lapsedCount}
          icon={<Users size={20} />}
          tone={lapsedCount > 0 ? 'accent' : 'neutral'}
        />
      </div>

      <div className="mb-6 flex items-center justify-between">
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
        <p className="text-sm text-accent-700 dark:text-dark-accent">
          Couldn&apos;t load subscriptions.
        </p>
      ) : null}
      {!isLoading && filtered?.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">Nothing here.</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {filtered?.map((provider) => (
          <SubscriptionRow key={provider.id} provider={provider} />
        ))}
      </div>
    </div>
  );
}

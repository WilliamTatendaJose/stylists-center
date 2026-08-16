import { useState } from 'react';
import type { AdminProviderRowDto } from '@sc/shared';
import { useProviders, useUpdateProvider } from '../api/providers';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { adminAssetUrl } from '../api/media';

const FILTERS: { label: string; value: boolean | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Unverified', value: false },
  { label: 'Verified', value: true },
];

function ProviderRow({ provider }: { provider: AdminProviderRowDto }) {
  const updateProvider = useUpdateProvider(provider.id);
  const [error, setError] = useState<string | null>(null);

  const toggleVerified = () => {
    setError(null);
    updateProvider.mutate(
      { verified: !provider.verified },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not update.');
        },
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="font-medium text-neutral-900 dark:text-dark-text">
          {provider.displayName} · {provider.phone}
        </p>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
          {provider.categoryName} · {provider.areaName} · {provider.ratingAvg.toFixed(1)}★ ·{' '}
          {provider.completedCount} done
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-dark-muted">
          <Badge
            label={`Identity: ${provider.verificationStatus}`}
            tone={provider.verificationStatus === 'verified' ? 'neutral' : 'accent'}
          />
          {provider.verificationIdDocumentUrl ? (
            <a
              className="underline hover:text-neutral-900 dark:hover:text-dark-text"
              href={adminAssetUrl(provider.verificationIdDocumentUrl)}
              target="_blank"
              rel="noreferrer"
            >
              Open ID
            </a>
          ) : null}
          {provider.verificationSelfieImageUrl ? (
            <a
              className="underline hover:text-neutral-900 dark:hover:text-dark-text"
              href={adminAssetUrl(provider.verificationSelfieImageUrl)}
              target="_blank"
              rel="noreferrer"
            >
              Open selfie
            </a>
          ) : null}
        </div>
        {provider.verificationNote ? (
          <p className="mt-1 text-xs text-accent-700 dark:text-dark-accent">
            Review note: {provider.verificationNote}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[
            ...provider.portfolioImageUrls,
            ...provider.serviceImageUrls,
            ...provider.productImageUrls,
          ].map((url, index) => (
            <a
              key={`${url}-${String(index)}`}
              href={adminAssetUrl(url)}
              target="_blank"
              rel="noreferrer"
              title="Open uploaded image"
            >
              <img
                src={adminAssetUrl(url)}
                alt=""
                className="h-12 w-12 rounded-lg border border-neutral-200 object-cover dark:border-dark-border"
                loading="lazy"
              />
            </a>
          ))}
          {provider.profileImageUrl || provider.avatarImageUrl ? (
            <a
              href={adminAssetUrl(provider.profileImageUrl ?? provider.avatarImageUrl ?? '')}
              target="_blank"
              rel="noreferrer"
              title="Open public profile image"
            >
              <img
                src={adminAssetUrl(provider.profileImageUrl ?? provider.avatarImageUrl ?? '')}
                alt=""
                className="h-12 w-12 rounded-full border border-neutral-200 object-cover dark:border-dark-border"
                loading="lazy"
              />
            </a>
          ) : null}
        </div>
        {error ? <p className="mt-1 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      </div>

      <div className="flex items-center gap-3">
        <Badge label={provider.verified ? 'Verified' : 'Not verified'} tone={provider.verified ? 'neutral' : 'accent'} />
        <Button
          variant={provider.verified ? 'ghost' : 'primary'}
          onClick={toggleVerified}
          disabled={updateProvider.isPending}
        >
          {provider.verified ? 'Unverify' : 'Verify'}
        </Button>
      </div>
    </div>
  );
}

export function ProvidersPage() {
  const [filter, setFilter] = useState<boolean | undefined>(undefined);
  const { data: providers, isLoading, isError } = useProviders(filter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Providers</h1>
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
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load providers.</p>
      ) : null}
      {!isLoading && providers?.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">Nothing here.</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {providers?.map((provider) => (
          <ProviderRow key={provider.id} provider={provider} />
        ))}
      </div>
    </div>
  );
}

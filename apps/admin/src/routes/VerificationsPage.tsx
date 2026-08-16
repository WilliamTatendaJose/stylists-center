import { useState } from 'react';
import type { AdminVerificationRowDto, VerificationStatus } from '@sc/shared';
import { useReviewVerification, useVerifications } from '../api/verifications';
import { ApiError } from '../api/client';
import { adminAssetUrl } from '../api/media';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';

const FILTERS: { label: string; value: VerificationStatus | undefined }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Rejected', value: 'unverified' },
  { label: 'Verified', value: 'verified' },
  { label: 'All', value: undefined },
];

function DocumentPreview({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-dark-border dark:text-dark-muted">
        No {label.toLowerCase()} uploaded
      </div>
    );
  }
  return (
    <a href={adminAssetUrl(url)} target="_blank" rel="noreferrer" className="group block">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-dark-border dark:bg-dark-bg">
        <img
          src={adminAssetUrl(url)}
          alt={label}
          className="h-56 w-full object-contain transition-transform group-hover:scale-[1.02]"
          loading="lazy"
        />
      </div>
      <p className="mt-2 text-center text-xs font-medium text-neutral-600 group-hover:text-neutral-900 dark:text-dark-muted dark:group-hover:text-dark-text">
        Open {label.toLowerCase()}
      </p>
    </a>
  );
}

function VerificationCard({ row }: { row: AdminVerificationRowDto }) {
  const review = useReviewVerification(row.id);
  const [note, setNote] = useState(row.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (status: VerificationStatus) => {
    setError(null);
    review.mutate(
      {
        verificationStatus: status,
        verificationNote: note.trim() || null,
      },
      {
        onError: (reason) => {
          setError(reason instanceof ApiError ? reason.message : 'Could not update verification.');
        },
      },
    );
  };

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900 dark:text-dark-text">{row.displayName}</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
            {row.phone} · {row.activeRole === 'provider' ? 'Stylist' : 'Client'}
            {row.hasProviderProfile ? ' · Has stylist page' : ''}
          </p>
        </div>
        <Badge
          label={row.verificationStatus}
          tone={row.verificationStatus === 'verified' ? 'neutral' : 'accent'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DocumentPreview label="Government ID" url={row.idDocumentUrl} />
        <DocumentPreview label="Live selfie" url={row.selfieImageUrl} />
      </div>

      <div className="mt-5">
        <label className="block text-sm font-medium text-neutral-700 dark:text-dark-muted">
          Review note <span className="font-normal">(optional)</span>
          <textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            rows={2}
            maxLength={2000}
            placeholder="Explain what needs to be corrected if rejecting."
            className="mt-2 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent dark:border-dark-border dark:bg-dark-bg dark:text-dark-text"
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="danger"
          disabled={review.isPending}
          onClick={() => {
            submit('unverified');
          }}
        >
          Reject / request resubmission
        </Button>
        <Button
          disabled={review.isPending}
          onClick={() => {
            submit('verified');
          }}
        >
          Verify user
        </Button>
      </div>
    </article>
  );
}

export function VerificationsPage() {
  const [filter, setFilter] = useState<VerificationStatus | undefined>('pending');
  const { data: rows, isLoading, isError } = useVerifications(filter);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Verifications</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
            Compare the government ID and selfie before approving a client or stylist.
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-white/5">
          {FILTERS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setFilter(item.value);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === item.value
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-dark-surface dark:text-dark-text'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-dark-muted dark:hover:text-dark-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load verifications.</p>
      ) : null}
      {!isLoading && rows?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-600 dark:border-dark-border dark:text-dark-muted">
          No verification submissions in this view.
        </div>
      ) : null}
      <div className="space-y-5">
        {rows?.map((row) => <VerificationCard key={row.id} row={row} />)}
      </div>
    </div>
  );
}

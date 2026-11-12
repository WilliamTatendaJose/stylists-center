import { useState } from 'react';
import { VENDOR_STATUS_LABELS, type AdminVendorRowDto, type VendorStatus } from '@sc/shared';
import { useReviewVendor, useVendors } from '../api/vendors';
import { ApiError } from '../api/client';
import { adminAssetUrl } from '../api/media';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Pager, SearchBox } from '../components/Pager';

const FILTERS: { label: string; value: VendorStatus | undefined }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: undefined },
];

const STATUS_TONE = { pending: 'accent', approved: 'neutral', rejected: 'dark' } as const;

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-neutral-600 dark:text-dark-muted">{label}</dt>
      <dd className="text-sm font-medium text-neutral-900 dark:text-dark-text">
        {value?.length ? value : '—'}
      </dd>
    </div>
  );
}

function VendorCard({ row }: { row: AdminVendorRowDto }) {
  const review = useReviewVendor(row.id);
  const [note, setNote] = useState(row.reviewNote ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (decision: 'approved' | 'rejected') => {
    setError(null);
    if (decision === 'rejected' && !note.trim()) {
      setError('Tell the applicant why it was not approved.');
      return;
    }
    review.mutate(
      { decision, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onError: (reason) => {
          setError(reason instanceof ApiError ? reason.message : 'Could not save the decision.');
        },
      },
    );
  };

  const mapUrl =
    row.shopLat !== null && row.shopLng !== null
      ? `https://www.openstreetmap.org/?mlat=${String(row.shopLat)}&mlon=${String(row.shopLng)}#map=17/${String(row.shopLat)}/${String(row.shopLng)}`
      : null;

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900 dark:text-dark-text">{row.businessName}</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
            Applied {new Date(row.submittedAt).toLocaleDateString()} ·{' '}
            {row.isStylist ? 'Stylist applying to sell' : 'Shop only (not a stylist)'}
          </p>
        </div>
        <Badge label={VENDOR_STATUS_LABELS[row.status]} tone={STATUS_TONE[row.status]} />
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Registration number" value={row.registrationNumber} />
        <Field label="Shop address" value={row.shopAddress} />
        <Field label="Contact person" value={row.contactName} />
        <Field label="Contact phone" value={row.contactPhone} />
        <Field
          label="Account"
          value={`${row.accountName}${row.accountPhone ? ` · ${row.accountPhone}` : ''}`}
        />
        <div>
          <dt className="text-xs text-neutral-600 dark:text-dark-muted">Map location</dt>
          <dd className="text-sm font-medium text-neutral-900 dark:text-dark-text">
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noreferrer" className="underline">
                Open on map
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-neutral-900 dark:text-dark-text">
        Premises photos
      </h3>
      {row.premisesPhotoUrls.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">No photos.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {row.premisesPhotoUrls.map((url) => (
            <a key={url} href={adminAssetUrl(url)} target="_blank" rel="noreferrer">
              <img
                src={adminAssetUrl(url)}
                alt="Shop premises"
                className="h-44 w-full rounded-xl border border-neutral-200 object-cover dark:border-dark-border"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {row.reviewedAt ? (
        <p className="mt-4 text-xs text-neutral-600 dark:text-dark-muted">
          Last decision {new Date(row.reviewedAt).toLocaleString()}
          {row.reviewedByAdminName ? ` by ${row.reviewedByAdminName}` : ''}
        </p>
      ) : null}

      <div className="mt-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-dark-muted">
          Note to the applicant <span className="font-normal">(needed to reject)</span>
          <textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            rows={2}
            maxLength={500}
            placeholder="For example: the photos do not show a shop front."
            className="mt-2 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent dark:border-dark-border dark:bg-dark-bg dark:text-dark-text"
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {row.status !== 'rejected' ? (
          <Button
            variant="danger"
            disabled={review.isPending}
            onClick={() => {
              submit('rejected');
            }}
          >
            {row.status === 'approved' ? 'Remove approval' : 'Reject'}
          </Button>
        ) : null}
        {row.status !== 'approved' ? (
          <Button
            disabled={review.isPending}
            onClick={() => {
              submit('approved');
            }}
          >
            Approve vendor
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function VendorsPage() {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<VendorStatus | undefined>('pending');
  const { data, isLoading, isError } = useVendors({ status: filter, q, offset });
  const rows = data?.items;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Vendors</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
            Check the shop photos and details before letting a business sell in the market.
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-white/5">
          {FILTERS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setFilter(item.value);
                setOffset(0);
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

      <div className="mb-4">
        <SearchBox
          placeholder="Search business, contact or registration number"
          onSearch={(value) => {
            setQ(value);
            setOffset(0);
          }}
        />
      </div>
      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">
          Couldn&apos;t load vendor applications.
        </p>
      ) : null}
      {!isLoading && rows?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-600 dark:border-dark-border dark:text-dark-muted">
          No applications in this view.
        </div>
      ) : null}
      <div className="space-y-5">
        {rows?.map((row) => (
          <VendorCard key={row.id} row={row} />
        ))}
      </div>
      {data ? (
        <Pager offset={offset} shown={data.items.length} total={data.total} onChange={setOffset} />
      ) : null}
    </div>
  );
}

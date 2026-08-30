import { Link, useParams } from 'react-router-dom';
import { formatUsd } from '@sc/shared';
import { useBookingDetail } from '../api/lookup';
import { Badge } from '../components/Badge';
import { Card } from '../components/ui/Card';

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isLoading, isError } = useBookingDetail(id ?? '');

  if (isLoading) return <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p>;
  if (isError || !booking) {
    return (
      <p className="text-sm text-accent-700 dark:text-dark-accent">
        Couldn&apos;t load this booking.
      </p>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link
        to="/lookup"
        className="mb-4 inline-block text-sm text-neutral-600 hover:underline dark:text-dark-muted"
      >
        ← Lookup
      </Link>

      <Card className="mb-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">
              {booking.reference}
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
              {booking.serviceName} · {formatUsd(booking.priceUsdCents)} · {booking.paymentMethod}
            </p>
          </div>
          <Badge label={booking.status} tone="neutral" />
        </div>

        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Client</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {booking.client.displayName} · {booking.client.phone}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Provider</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {booking.provider.displayName} · {booking.provider.phone}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Starts</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {new Date(booking.startsAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Cash confirmation</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              client {booking.confirmedByClient ? '✓' : '—'} · provider{' '}
              {booking.confirmedByProvider ? '✓' : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">Payment ledger</h2>
      <Card padded={false} className="mb-6">
        {booking.payments.length === 0 ? (
          <p className="p-5 text-sm text-neutral-600 dark:text-dark-muted">No payment rows.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-dark-border">
            {booking.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-neutral-900 dark:text-dark-text">
                  {p.gateway} · <Badge label={p.status} tone="neutral" />
                </span>
                <span className="text-right text-neutral-600 dark:text-dark-muted">
                  {formatUsd(p.amountUsdCents)} (fee {formatUsd(p.feeUsdCents)}) ·{' '}
                  {new Date(p.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {booking.trips.length > 0 ? (
        <>
          <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">Trip tracking</h2>
          <Card padded={false} className="mb-6">
            <div className="divide-y divide-neutral-200 dark:divide-dark-border">
              {booking.trips.map((t, i) => (
                <div key={i} className="px-5 py-3 text-sm">
                  <span className="font-medium text-neutral-900 dark:text-dark-text">
                    {t.mode} side
                  </span>
                  <span className="ml-2 text-neutral-600 dark:text-dark-muted">
                    {t.arrived ? 'arrived' : 'en route'}
                    {t.checkedInAt
                      ? ` · checked in ${new Date(t.checkedInAt).toLocaleTimeString()}`
                      : ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {booking.reviews.length > 0 ? (
        <>
          <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">Reviews</h2>
          <Card padded={false}>
            <div className="divide-y divide-neutral-200 dark:divide-dark-border">
              {booking.reviews.map((r) => (
                <div key={r.id} className="px-5 py-3 text-sm">
                  <span className="font-medium text-neutral-900 dark:text-dark-text">
                    {r.rating}★
                  </span>
                  <span className="ml-2 text-neutral-600 dark:text-dark-muted">
                    {r.rater.displayName}
                    {r.text ? ` — "${r.text}"` : ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

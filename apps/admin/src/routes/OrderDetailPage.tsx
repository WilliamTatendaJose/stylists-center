import { Link, useParams } from 'react-router-dom';
import { formatUsd } from '@sc/shared';
import { useOrderDetail } from '../api/lookup';
import { Badge } from '../components/Badge';
import { Card } from '../components/ui/Card';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError } = useOrderDetail(id ?? '');

  if (isLoading) return <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p>;
  if (isError || !order) {
    return (
      <p className="text-sm text-accent-700 dark:text-dark-accent">
        Couldn&apos;t load this order.
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
              {order.reference}
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
              {formatUsd(order.totalUsdCents)} · {order.paymentMethod} ·{' '}
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>
          <Badge label={order.status} tone="neutral" />
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Buyer</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {order.buyer.displayName} · {order.buyer.phone}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-600 dark:text-dark-muted">Provider</dt>
            <dd className="font-medium text-neutral-900 dark:text-dark-text">
              {order.provider.displayName} · {order.provider.phone}
            </dd>
          </div>
        </dl>
      </Card>

      <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">Items</h2>
      <Card padded={false} className="mb-6">
        <div className="divide-y divide-neutral-200 dark:divide-dark-border">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="text-neutral-900 dark:text-dark-text">
                {item.quantity} × {item.nameSnapshot}
              </span>
              <span className="text-neutral-600 dark:text-dark-muted">
                {formatUsd(item.priceUsdCents)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">Payment ledger</h2>
      <Card padded={false}>
        {order.payments.length === 0 ? (
          <p className="p-5 text-sm text-neutral-600 dark:text-dark-muted">No payment rows.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-dark-border">
            {order.payments.map((p) => (
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
    </div>
  );
}

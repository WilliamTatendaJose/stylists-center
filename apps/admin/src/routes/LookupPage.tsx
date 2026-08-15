import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { formatUsd } from '@sc/shared';
import { useLookupSearch } from '../api/lookup';
import { Badge } from '../components/Badge';
import { Card } from '../components/ui/Card';

export function LookupPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const { data, isFetching } = useLookupSearch(query);

  const submit = () => {
    setQuery(input);
  };

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-neutral-900 dark:text-dark-text">Lookup</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-dark-muted">
        Find a booking or order by its reference (e.g. SC-4471) or a client/provider phone number.
      </p>

      <div className="mb-8 flex max-w-lg items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="Reference or phone number"
            className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 focus:border-accent focus:outline-none dark:border-dark-border dark:bg-white/5 dark:text-dark-text"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Search
        </button>
      </div>

      {isFetching ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Searching…</p> : null}

      {data ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">
              Bookings {data.bookings.length ? `(${String(data.bookings.length)})` : ''}
            </h2>
            {data.bookings.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-dark-muted">No matching bookings.</p>
            ) : (
              <Card padded={false}>
                <div className="divide-y divide-neutral-200 dark:divide-dark-border">
                  {data.bookings.map((b) => (
                    <Link
                      key={b.id}
                      to={`/lookup/bookings/${b.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-50 dark:hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-dark-text">{b.reference}</p>
                        <p className="text-sm text-neutral-600 dark:text-dark-muted">
                          {b.client.displayName} → {b.provider.displayName} · {b.serviceName} ·{' '}
                          {formatUsd(b.priceUsdCents)}
                        </p>
                      </div>
                      <Badge label={b.status} tone="neutral" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-semibold text-neutral-900 dark:text-dark-text">
              Orders {data.orders.length ? `(${String(data.orders.length)})` : ''}
            </h2>
            {data.orders.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-dark-muted">No matching orders.</p>
            ) : (
              <Card padded={false}>
                <div className="divide-y divide-neutral-200 dark:divide-dark-border">
                  {data.orders.map((o) => (
                    <Link
                      key={o.id}
                      to={`/lookup/orders/${o.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-50 dark:hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-dark-text">{o.reference}</p>
                        <p className="text-sm text-neutral-600 dark:text-dark-muted">
                          {o.buyer.displayName} → {o.provider.displayName} · {formatUsd(o.totalUsdCents)}
                        </p>
                      </div>
                      <Badge label={o.status} tone="neutral" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

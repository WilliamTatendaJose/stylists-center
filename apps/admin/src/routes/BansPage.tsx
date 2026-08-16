import { useState } from 'react';
import { APPEAL_STATUS_LABELS, type AdminBanRowDto, type AppealStatus } from '@sc/shared';
import { useBans, useResolveAppeal } from '../api/trust';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { TextAreaField } from '../components/ui/Field';

const FILTERS: { label: string; value: AppealStatus | undefined }[] = [
  { label: 'Active', value: undefined },
  { label: 'Requested', value: 'requested' },
  { label: 'Upheld', value: 'upheld' },
  { label: 'Overturned', value: 'overturned' },
];

const APPEAL_TONE: Record<AppealStatus, 'accent' | 'neutral' | 'dark'> = {
  none: 'neutral',
  requested: 'accent',
  upheld: 'dark',
  overturned: 'neutral',
};

function BanRow({ ban }: { ban: AdminBanRowDto }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const resolveAppeal = useResolveAppeal(ban.id);

  const resolve = (appealStatus: 'upheld' | 'overturned') => {
    setError(null);
    resolveAppeal.mutate(
      { appealStatus, ...(note.trim() ? { appealNote: note.trim() } : {}) },
      {
        onSuccess: () => {
          setOpen(false);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not resolve.');
        },
      },
    );
  };

  const isActive = ban.appealStatus !== 'overturned';

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-dark-text">
            {ban.user.displayName} · {ban.user.phone}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">{ban.reason}</p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-dark-muted">
            {ban.trigger === 'automatic' ? 'Automatic' : 'Manual'} ·{' '}
            {new Date(ban.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge
            label={APPEAL_STATUS_LABELS[ban.appealStatus]}
            tone={APPEAL_TONE[ban.appealStatus]}
          />
          {isActive ? (
            <button
              type="button"
              onClick={() => {
                setOpen((v) => !v);
              }}
              className="text-sm font-medium text-accent-700 hover:underline dark:text-dark-accent"
            >
              Resolve appeal
            </button>
          ) : null}
        </div>
      </div>

      {ban.appealNote ? (
        <p className="mt-2 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-white/5 dark:text-dark-muted">
          {ban.appealNote}
        </p>
      ) : null}

      {open ? (
        <div className="mt-3 rounded-xl border border-neutral-200 p-4 dark:border-dark-border">
          <TextAreaField
            label="Note (why upheld or overturned)"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            rows={2}
          />
          {error ? (
            <p role="alert" className="mb-3 text-sm text-accent-700 dark:text-dark-accent">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={resolveAppeal.isPending}
              onClick={() => {
                resolve('overturned');
              }}
            >
              Overturn — lift ban
            </Button>
            <Button
              variant="ghost"
              disabled={resolveAppeal.isPending}
              onClick={() => {
                resolve('upheld');
              }}
            >
              Uphold — ban stands
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BansPage() {
  const [filter, setFilter] = useState<AppealStatus | undefined>(undefined);
  const { data: bans, isLoading, isError } = useBans(filter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Bans</h1>
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
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load bans.</p>
      ) : null}
      {!isLoading && bans?.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-muted">Nothing here.</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {bans?.map((ban) => (
          <BanRow key={ban.id} ban={ban} />
        ))}
      </div>
    </div>
  );
}

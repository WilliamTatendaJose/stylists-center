import { useAuditLog } from '../api/audit';
import { Badge } from '../components/Badge';

const ACTOR_TONE = {
  admin: 'accent',
  user: 'neutral',
  system: 'neutral',
} as const;

export function AuditLogPage() {
  const { data: entries, isLoading, isError } = useAuditLog(200);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-neutral-900 dark:text-dark-text">Audit log</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-dark-muted">
        Every mutating request, most recent first. Read-only — this is the record, not an action
        surface.
      </p>

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load the audit log.</p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-dark-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-white/5 dark:text-dark-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Actor</th>
              <th className="px-5 py-3 font-medium">Action</th>
              <th className="px-5 py-3 font-medium">IP</th>
              <th className="px-5 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-dark-border">
            {entries?.map((entry) => (
              <tr key={entry.id}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Badge label={entry.actorType} tone={ACTOR_TONE[entry.actorType]} />
                    <span className="text-neutral-900 dark:text-dark-text">
                      {entry.actorName ?? '—'}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-neutral-700 dark:text-dark-muted">
                  {entry.action}
                </td>
                <td className="px-5 py-3 text-neutral-600 dark:text-dark-muted">{entry.ip ?? '—'}</td>
                <td className="px-5 py-3 whitespace-nowrap text-neutral-600 dark:text-dark-muted">
                  {new Date(entry.at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries?.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-neutral-600 dark:text-dark-muted">
            Nothing recorded yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}

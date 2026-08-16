import { Link } from 'react-router-dom';
import { Flag, ShieldBan, UserCheck, Users } from 'lucide-react';
import { formatUsd } from '@sc/shared';
import { useOverview, useOverviewTrends } from '../api/overview';
import { useAuditLog } from '../api/audit';
import { StatTile } from '../components/ui/StatTile';
import { Card } from '../components/ui/Card';
import { TrendChart } from '../components/ui/TrendChart';

export function OverviewPage() {
  const { data: overview, isLoading } = useOverview();
  const { data: trends } = useOverviewTrends();
  const { data: recent } = useAuditLog(8);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-neutral-900 dark:text-dark-text">Overview</h1>

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}

      {overview ? (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Link to="/reports">
            <StatTile
              label="Open reports"
              value={overview.openReports}
              icon={<Flag size={20} />}
              tone={overview.openReports > 0 ? 'accent' : 'neutral'}
            />
          </Link>
          <Link to="/reports">
            <StatTile
              label="Reports in review"
              value={overview.reviewingReports}
              icon={<Flag size={20} />}
            />
          </Link>
          <Link to="/bans">
            <StatTile
              label="Active bans"
              value={overview.activeBans}
              icon={<ShieldBan size={20} />}
              tone={overview.activeBans > 0 ? 'accent' : 'neutral'}
            />
          </Link>
          <Link to="/providers">
            <StatTile
              label="Pending verification"
              value={overview.pendingVerification}
              icon={<UserCheck size={20} />}
              tone={overview.pendingVerification > 0 ? 'accent' : 'neutral'}
            />
          </Link>
        </div>
      ) : null}

      {overview ? (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-4">
          <StatTile
            label="Total providers"
            value={overview.totalProviders}
            icon={<Users size={20} />}
          />
        </div>
      ) : null}

      {trends ? (
        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 font-semibold text-neutral-900 dark:text-dark-text">
              Bookings, last 14 days
            </h2>
            <TrendChart
              points={trends.map((t) => ({ date: t.date, value: t.bookingsCount }))}
              valueFormatter={(v) => `${String(v)} booking${v === 1 ? '' : 's'}`}
            />
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold text-neutral-900 dark:text-dark-text">
              Revenue released, last 14 days
            </h2>
            <TrendChart
              points={trends.map((t) => ({ date: t.date, value: t.releasedUsdCents }))}
              valueFormatter={(v) => formatUsd(v)}
            />
          </Card>
        </div>
      ) : null}

      <Card padded={false}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-dark-border">
          <h2 className="font-semibold text-neutral-900 dark:text-dark-text">Recent activity</h2>
          <Link
            to="/audit-log"
            className="text-sm font-medium text-accent-700 hover:underline dark:text-dark-accent"
          >
            View all
          </Link>
        </div>
        <div className="divide-y divide-neutral-200 dark:divide-dark-border">
          {recent?.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between px-6 py-3 text-sm">
              <span className="text-neutral-900 dark:text-dark-text">
                {entry.actorName ?? (entry.actorType === 'admin' ? 'An admin' : 'System')} ·{' '}
                <span className="text-neutral-600 dark:text-dark-muted">{entry.action}</span>
              </span>
              <span className="shrink-0 text-neutral-500 dark:text-dark-muted">
                {new Date(entry.at).toLocaleString()}
              </span>
            </div>
          ))}
          {recent?.length === 0 ? (
            <p className="px-6 py-4 text-sm text-neutral-600 dark:text-dark-muted">Nothing yet.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

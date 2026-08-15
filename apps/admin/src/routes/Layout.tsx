import { NavLink, Outlet } from 'react-router-dom';
import {
  CreditCard,
  Flag,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MapPinned,
  Search,
  ShieldBan,
  Star,
  UserCheck,
  UserCog,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '../state/authStore';
import { useLogout } from '../api/auth';
import { ThemeToggle } from '../components/ThemeToggle';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/lookup', label: 'Lookup', icon: Search },
  { to: '/reports', label: 'Reports', icon: Flag },
  { to: '/bans', label: 'Bans', icon: ShieldBan },
  { to: '/reviews', label: 'Reviews', icon: Star },
  { to: '/providers', label: 'Providers', icon: UserCheck },
  { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/catalog', label: 'Catalog', icon: MapPinned },
  { to: '/staff', label: 'Staff', icon: UserCog },
  { to: '/audit-log', label: 'Audit log', icon: ListChecks },
];

export function Layout() {
  const admin = useAuthStore((s) => s.admin);
  const logout = useLogout();

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-dark-bg">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-dark-border dark:bg-dark-surface">
        <div className="px-6 py-6">
          <p className="text-sm font-semibold text-neutral-500 dark:text-dark-muted">Stylists Center</p>
          <p className="text-lg font-bold text-neutral-900 dark:text-dark-text">Admin</p>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-100 text-accent-700 dark:bg-accent/15 dark:text-dark-accent'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-dark-muted dark:hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 p-3 dark:border-dark-border">
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-dark-text">
                {admin?.displayName}
              </p>
              <p className="truncate text-xs text-neutral-500 dark:text-dark-muted">{admin?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void logout.mutateAsync();
            }}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-dark-muted dark:hover:bg-white/5"
          >
            <LogOut size={18} strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-neutral-200 bg-white px-8 py-3 dark:border-dark-border dark:bg-dark-surface">
          <ThemeToggle />
        </header>
        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

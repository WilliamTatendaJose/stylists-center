import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  CreditCard,
  Flag,
  HandCoins,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MapPinned,
  Search,
  ShieldBan,
  Star,
  UserCheck,
  ShieldCheck,
  UserCog,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import { useAuthStore } from '../state/authStore';
import { useLogout } from '../api/auth';
import { ThemeToggle } from '../components/ThemeToggle';
import { BrandLogo } from '../components/BrandLogo';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/lookup', label: 'Lookup', icon: Search },
  { to: '/reports', label: 'Reports', icon: Flag },
  { to: '/bans', label: 'Bans', icon: ShieldBan },
  { to: '/reviews', label: 'Reviews', icon: Star },
  { to: '/providers', label: 'Providers', icon: UserCheck },
  { to: '/users', label: 'Users', icon: UsersRound },
  { to: '/verifications', label: 'Verifications', icon: ShieldCheck },
  { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/cash-outs', label: 'Cash-outs', icon: HandCoins },
  { to: '/catalog', label: 'Catalog', icon: MapPinned },
  { to: '/staff', label: 'Staff', icon: UserCog },
  { to: '/audit-log', label: 'Audit log', icon: ListChecks },
];

export function Layout() {
  const admin = useAuthStore((s) => s.admin);
  const logout = useLogout();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-neutral-50 dark:bg-dark-bg">
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => {
            setMobileNavOpen(false);
          }}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-3rem)] -translate-x-full flex-col overflow-y-auto border-r border-neutral-200 bg-white transition-transform lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:overflow-visible dark:border-dark-border dark:bg-dark-surface ${
          mobileNavOpen ? 'translate-x-0' : ''
        }`}
      >
        <div className="flex items-start justify-between px-4 py-4 sm:px-5 sm:py-5">
          <div className="min-w-0">
            <BrandLogo className="w-full rounded-lg" />
            <p className="mt-2 px-1 text-xs font-semibold tracking-[0.18em] text-neutral-500 uppercase dark:text-dark-muted">
              Admin console
            </p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 lg:hidden dark:text-dark-muted dark:hover:bg-white/10"
            onClick={() => {
              setMobileNavOpen(false);
            }}
          >
            <X size={20} />
          </button>
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
              onClick={() => {
                setMobileNavOpen(false);
              }}
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
              <p className="truncate text-xs text-neutral-500 dark:text-dark-muted">
                {admin?.email}
              </p>
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
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5 sm:px-6 lg:justify-end lg:px-8 lg:py-3 dark:border-dark-border dark:bg-dark-surface">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-dark-muted dark:hover:bg-white/10"
              onClick={() => {
                setMobileNavOpen(true);
              }}
            >
              <Menu size={20} />
            </button>
            <BrandLogo className="h-8 w-auto rounded-md" />
          </div>
          <ThemeToggle />
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

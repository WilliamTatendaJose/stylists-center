import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from './state/authStore';
import { Layout } from './routes/Layout';
import { LoginPage } from './routes/LoginPage';
import { canOpen } from './roles';

// Each page is loaded as its own chunk on first visit, so the login screen
// and initial load don't pay for every admin page.
const OverviewPage = lazy(() =>
  import('./routes/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const ReportsPage = lazy(() =>
  import('./routes/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const ReportDetailPage = lazy(() =>
  import('./routes/ReportDetailPage').then((m) => ({ default: m.ReportDetailPage })),
);
const BansPage = lazy(() => import('./routes/BansPage').then((m) => ({ default: m.BansPage })));
const ProvidersPage = lazy(() =>
  import('./routes/ProvidersPage').then((m) => ({ default: m.ProvidersPage })),
);
const SubscriptionsPage = lazy(() =>
  import('./routes/SubscriptionsPage').then((m) => ({ default: m.SubscriptionsPage })),
);
const PaymentsPage = lazy(() =>
  import('./routes/PaymentsPage').then((m) => ({ default: m.PaymentsPage })),
);
const CashOutsPage = lazy(() =>
  import('./routes/CashOutsPage').then((m) => ({ default: m.CashOutsPage })),
);
const AuditLogPage = lazy(() =>
  import('./routes/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
);
const LookupPage = lazy(() =>
  import('./routes/LookupPage').then((m) => ({ default: m.LookupPage })),
);
const BookingDetailPage = lazy(() =>
  import('./routes/BookingDetailPage').then((m) => ({ default: m.BookingDetailPage })),
);
const OrderDetailPage = lazy(() =>
  import('./routes/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })),
);
const ReviewsPage = lazy(() =>
  import('./routes/ReviewsPage').then((m) => ({ default: m.ReviewsPage })),
);
const CatalogPage = lazy(() =>
  import('./routes/CatalogPage').then((m) => ({ default: m.CatalogPage })),
);
const StaffPage = lazy(() => import('./routes/StaffPage').then((m) => ({ default: m.StaffPage })));
const VerificationsPage = lazy(() =>
  import('./routes/VerificationsPage').then((m) => ({ default: m.VerificationsPage })),
);
const VendorsPage = lazy(() =>
  import('./routes/VendorsPage').then((m) => ({ default: m.VendorsPage })),
);
const UsersPage = lazy(() => import('./routes/UsersPage').then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() =>
  import('./routes/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const ContentPage = lazy(() =>
  import('./routes/ContentPage').then((m) => ({ default: m.ContentPage })),
);
const AccountPage = lazy(() =>
  import('./routes/AccountPage').then((m) => ({ default: m.AccountPage })),
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const admin = useAuthStore((s) => s.admin);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-neutral-600 dark:bg-dark-bg dark:text-dark-muted">
        Loading…
      </div>
    );
  }
  if (!admin) {
    return <Navigate to="/login" replace />;
  }
  // ADMIN_MFA_REQUIRED and not enrolled: the API refuses everything else, so
  // keep the user on the page where they can fix that.
  if (admin.mfaSetupRequired && location.pathname !== '/account') {
    return <Navigate to="/account" replace />;
  }
  // Hidden pages are also refused by the API; this just avoids a page full
  // of 403s when someone follows an old link.
  if (!canOpen(admin.role, location.pathname)) {
    return <Navigate to="/overview" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<div className="p-6 text-neutral-600 dark:text-dark-muted">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="bans" element={<BansPage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="verifications" element={<VerificationsPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="cash-outs" element={<CashOutsPage />} />
          <Route path="lookup" element={<LookupPage />} />
          <Route path="lookup/bookings/:id" element={<BookingDetailPage />} />
          <Route path="lookup/orders/:id" element={<OrderDetailPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

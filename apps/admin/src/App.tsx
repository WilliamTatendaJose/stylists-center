import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from './state/authStore';
import { Layout } from './routes/Layout';
import { LoginPage } from './routes/LoginPage';
import { OverviewPage } from './routes/OverviewPage';
import { ReportsPage } from './routes/ReportsPage';
import { ReportDetailPage } from './routes/ReportDetailPage';
import { BansPage } from './routes/BansPage';
import { ProvidersPage } from './routes/ProvidersPage';
import { SubscriptionsPage } from './routes/SubscriptionsPage';
import { PaymentsPage } from './routes/PaymentsPage';
import { CashOutsPage } from './routes/CashOutsPage';
import { AuditLogPage } from './routes/AuditLogPage';
import { LookupPage } from './routes/LookupPage';
import { BookingDetailPage } from './routes/BookingDetailPage';
import { OrderDetailPage } from './routes/OrderDetailPage';
import { ReviewsPage } from './routes/ReviewsPage';
import { CatalogPage } from './routes/CatalogPage';
import { StaffPage } from './routes/StaffPage';
import { VerificationsPage } from './routes/VerificationsPage';
import { UsersPage } from './routes/UsersPage';
import { AccountPage } from './routes/AccountPage';
import { canOpen } from './roles';

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
        <Route path="subscriptions" element={<SubscriptionsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="cash-outs" element={<CashOutsPage />} />
        <Route path="lookup" element={<LookupPage />} />
        <Route path="lookup/bookings/:id" element={<BookingDetailPage />} />
        <Route path="lookup/orders/:id" element={<OrderDetailPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

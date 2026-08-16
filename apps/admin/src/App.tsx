import { Navigate, Route, Routes } from 'react-router-dom';
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
import { AuditLogPage } from './routes/AuditLogPage';
import { LookupPage } from './routes/LookupPage';
import { BookingDetailPage } from './routes/BookingDetailPage';
import { OrderDetailPage } from './routes/OrderDetailPage';
import { ReviewsPage } from './routes/ReviewsPage';
import { CatalogPage } from './routes/CatalogPage';
import { StaffPage } from './routes/StaffPage';
import { VerificationsPage } from './routes/VerificationsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const admin = useAuthStore((s) => s.admin);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

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
        <Route path="verifications" element={<VerificationsPage />} />
        <Route path="subscriptions" element={<SubscriptionsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="lookup" element={<LookupPage />} />
        <Route path="lookup/bookings/:id" element={<BookingDetailPage />} />
        <Route path="lookup/orders/:id" element={<OrderDetailPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

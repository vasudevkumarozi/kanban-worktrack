import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import api from './api/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import ProjectBoard from './pages/projects/ProjectBoard';
import SprintsPage from './pages/projects/SprintsPage';
import ActivityPage from './pages/projects/ActivityPage';
import AdminUsersPage from './pages/admin/UsersPage';
import AdminAnalyticsPage from './pages/admin/AnalyticsPage';
import MyTasksPage from './pages/dashboard/MyTasksPage';
import ReportsPage from './pages/reports/ReportsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const { setUser } = useAuthStore();

  useEffect(() => {
    // On mount, try to restore the session from the httpOnly cookie.
    // The interceptor transparently calls /auth/refresh if the access token
    // has expired — do NOT call /auth/refresh explicitly here because it would
    // race with the interceptor's own refresh attempt and cause a double-rotation
    // (second caller gets "token already used" 401 → logout → redirect to /login).
    // Socket.io authenticates via the httpOnly cookie (withCredentials: true),
    // so no in-memory token is needed on page load.
    api.get<{ accessToken?: string }>('/auth/me')
      .then((r) => setUser(r.data as any))
      .catch(() => setUser(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
            <Route path="/my-tasks" element={<ErrorBoundary><MyTasksPage /></ErrorBoundary>} />
            <Route path="/projects" element={<ErrorBoundary><ProjectsPage /></ErrorBoundary>} />
            <Route path="/projects/:id" element={<ErrorBoundary><ProjectBoard /></ErrorBoundary>} />
            <Route path="/projects/:id/sprints" element={<ErrorBoundary><SprintsPage /></ErrorBoundary>} />
            <Route path="/projects/:id/activity" element={<ErrorBoundary><ActivityPage /></ErrorBoundary>} />
            <Route path="/reports" element={
              <RequireRole roles={['SUPER_ADMIN', 'MANAGER']}>
                <ErrorBoundary><ReportsPage /></ErrorBoundary>
              </RequireRole>
            } />
            <Route path="/admin/users" element={
              <RequireRole roles={['SUPER_ADMIN', 'MANAGER']}>
                <ErrorBoundary><AdminUsersPage /></ErrorBoundary>
              </RequireRole>
            } />
            <Route path="/admin/analytics" element={
              <RequireRole roles={['SUPER_ADMIN', 'MANAGER']}>
                <ErrorBoundary><AdminAnalyticsPage /></ErrorBoundary>
              </RequireRole>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

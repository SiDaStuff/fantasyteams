import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';

/**
 * Guards private routes. While Firebase session state is loading we show a
 * spinner; unauthenticated visitors are redirected to /login preserving the
 * destination so they can be returned after signing in.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullPageSpinner label="Loading your session…" />;
  }

  // No Firebase configured: let the guarded pages render their own setup notice.
  if (status === 'unconfigured') {
    return <Outlet />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
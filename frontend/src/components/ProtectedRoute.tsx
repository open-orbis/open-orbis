import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();

  // /auth/me is in flight — show a spinner instead of flashing the
  // landing page for a beat. Without an accessible token in localStorage
  // we can't decide synchronously; we always have to wait for the probe.
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!user.activated) {
    return <Navigate to="/activate" replace />;
  }

  return <>{children}</>;
}

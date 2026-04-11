import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Requires a logged-in user but does NOT check activation status.
 * Used for /activate — a page that must be accessible to non-activated users.
 */
export default function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();

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

  return <>{children}</>;
}

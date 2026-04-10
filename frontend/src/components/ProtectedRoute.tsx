import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user, loading } = useAuthStore();

  // No token at all → redirect immediately
  if (!token) {
    return <Navigate to="/" replace />;
  }

  // Token present but user not yet fetched → wait for fetchUser to resolve
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // User is authenticated but not activated → redirect to activation page
  if (!user.activated) {
    return <Navigate to="/activate" replace />;
  }

  return <>{children}</>;
}

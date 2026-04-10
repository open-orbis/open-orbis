import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, user, loading } = useAuthStore();

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user.is_admin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

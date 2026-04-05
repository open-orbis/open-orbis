import { Navigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const adminToken = useAdminAuthStore((s) => s.adminToken);

  if (!adminToken) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

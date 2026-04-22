import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from './stores/authStore';
import { useToastStore } from './stores/toastStore';
import LandingPage from './pages/LandingPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import LinkedInCallbackPage from './pages/LinkedInCallbackPage';
import CreateOrbPage from './pages/CreateOrbPage';
import OrbViewPage from './pages/OrbViewPage';
import SharedOrbPage from './pages/SharedOrbPage';
import CvExportPage from './pages/CvExportPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ToastContainer from './components/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AuthenticatedRoute from './components/AuthenticatedRoute';
import AdminPage from './pages/AdminPage';
import ActivatePage from './pages/ActivatePage';
import ConsentPage from './pages/ConsentPage';

const scrollPositions: Record<string, number> = {};

function ScrollManager() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      scrollPositions[prevPathname.current] = window.scrollY;
      prevPathname.current = pathname;
    }

    if (navType === 'POP' && scrollPositions[pathname] != null) {
      window.scrollTo(0, scrollPositions[pathname]);
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, navType]);

  return null;
}

function AppRoutes() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const lastSessionExpiredEventAt = useRef(0);

  // Handle global session-expired events from the API client
  useEffect(() => {
    const handler = () => {
      const now = Date.now();
      // Guard against duplicate 401/event bursts that can occur close together.
      if (now - lastSessionExpiredEventAt.current < 1500) return;
      lastSessionExpiredEventAt.current = now;
      logout();
      addToast('Your session has expired. Please sign in again.', 'info');
      navigate('/', { replace: true });
    };
    window.addEventListener('orbis:session-expired', handler);
    return () => window.removeEventListener('orbis:session-expired', handler);
  }, [logout, addToast, navigate]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/linkedin/callback" element={<LinkedInCallbackPage />} />
      <Route path="/create" element={<ProtectedRoute><CreateOrbPage /></ProtectedRoute>} />
      <Route path="/myorbis" element={<ProtectedRoute><OrbViewPage /></ProtectedRoute>} />
      <Route path="/cv-export" element={<ProtectedRoute><CvExportPage /></ProtectedRoute>} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/activate" element={<AuthenticatedRoute><ActivatePage /></AuthenticatedRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="/oauth/authorize" element={<ConsentPage />} />
      <Route path="/:orbId" element={<SharedOrbPage />} />
    </Routes>
  );
}

function App() {
  const { fetchUser } = useAuthStore();

  // Always probe /auth/me on mount. With httpOnly cookies we cannot
  // know synchronously whether a session exists — the backend is the
  // only authority. fetchUser flips loading back to false once done.
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <BrowserRouter>
        <ScrollManager />
        <AppRoutes />
        <ToastContainer />
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;

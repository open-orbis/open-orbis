import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from './stores/authStore';
import { useToastStore } from './stores/toastStore';
import LandingPage from './pages/LandingPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import LinkedInCallbackPage from './pages/LinkedInCallbackPage';
import CreateOrbPage from './pages/CreateOrbPage';
import AboutPage from './pages/AboutPage';
import OrbViewPage from './pages/OrbViewPage';
import SharedOrbPage from './pages/SharedOrbPage';
import CvExportPage from './pages/CvExportPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ToastContainer from './components/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';

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

  // Handle global session-expired events from the API client
  useEffect(() => {
    const handler = () => {
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
      <Route path="/about" element={<AboutPage />} />
      <Route path="/create" element={<ProtectedRoute><CreateOrbPage /></ProtectedRoute>} />
      <Route path="/myorbis" element={<ProtectedRoute><OrbViewPage /></ProtectedRoute>} />
      <Route path="/cv-export" element={<ProtectedRoute><CvExportPage /></ProtectedRoute>} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/:orbId" element={<SharedOrbPage />} />
    </Routes>
  );
}

function App() {
  const { token, fetchUser } = useAuthStore();

  useEffect(() => {
    if (token) fetchUser();
  }, [token, fetchUser]);

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
